import * as _ from 'underscore';
import {Logger} from './logger';
import conf from './conf.json';
import MySqlClient from './mysqlClient';
import Queue from 'better-queue';
import {query} from "winston";
const gm = require('gm').subClass({imageMagick: true});
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');

const mysqlClient: MySqlClient = new MySqlClient();

/**
 * Traverses conf.imageDir files and for each filename not found in the database,
 * it will backup the file and then create a thumbnail
 * finally save the file meta-data to the db.
 */

export enum ImagerEvents{
    DONE = "DONE"
}

function getDestDir(){
    return path.join(conf.destDir,path.basename(conf.sourceDir)+'_COPY');
}

export class App {

    private allowedFileTypes: Set<string>
    private fileCount: number = 0;
    private queue: Queue;
    private queueSize: number = 0;
    private emitter: any;

    constructor(){
        this.allowedFileTypes = new Set<string>();
        this.allowedFileTypes.add('.png').add('.jpeg').add('.jpg').add('.gif').add('.img').add('.JPG');
        this.queue = new Queue(this.processQueueTask, conf.queueSettings);
        this.emitter = new EventEmitter();

        this.defineListeners();
    }

    /**
     *
     * define any listeners.
     */
    defineListeners(){
        this.queue.on('task_finish',(taskId,result)=>{
            Logger.info(taskId+' queue task has completed successfully.');
            this.queueSize--;

            if(!this.queueSize){
                this.emitter.emit(ImagerEvents.DONE);
            }
        });

        this.queue.on('task_failed',(taskId,err)=>{
           Logger.error(taskId+' task failed with error:'+err);
        });

        this.emitter.on(ImagerEvents.DONE, ()=>{
           Logger.info(ImagerEvents.DONE+' event has been invoked.');
           process.exit();
        });
    }

    /**
     * Verifies if the file already exists in the image table and is of correct file type.
     *
     * @param file
     */
    verifyNewFile(file:string,imageGroupId:number): Promise<any>{
        return new Promise((resolve,reject)=>{
            Logger.info("Processing file:"+file);

            //weed out wrong file types
            if(this.allowedFileTypes.has(path.extname(file))){
                let query = "select * from image i where groupId = "+imageGroupId+" and path = '"+path.join(getDestDir(),file)+"'";
                Logger.debug("Executing verify mysql query:"+query);

                mysqlClient.query(query).then(results=>{
                    if(_.isEmpty(results)){
                        Logger.debug(file+" not found in db.");
                        resolve();
                    }
                    else{
                        reject(file+" was already found in db.");
                    }

                }).catch(err=>{
                    reject(err);
                });
            }
            else{
                reject('Not adding:'+file+' because it is of the wrong filetype.');
            }
        });
    }

    /**
     *
     * @param file
     */
    copyFile(file:string) {
        try {
            if(!fs.existsSync(path.join(getDestDir(),file))){
                fs.copyFileSync(path.join(conf.sourceDir, file), path.join(getDestDir(), file));
                Logger.info('Successfully backed up file:'+file);
                return true;
            }
            else{
                Logger.info(file+' has already been backed up.');
                return true;
            }
        }
        catch(e){
            Logger.error('Error backing up file:'+file+' with error:'+e);
        }
        return false;
    }

    /**
     * Processes a batch of files that have been queued up.
     * This is the callback method called by the queue.
     */
    processQueueTask(queueBulk:any, cb:any){
        let completedCount:number = 0;

        function persistImage(file:string): Promise<any>{
            Logger.info('Persisting image file:'+file+' to image group ID:'+queueBulk.imageGroupId);
            return new Promise((resolve,reject)=>{
                mysqlClient.query("insert into image (groupId,name,path) " +
                    "values(" +queueBulk.imageGroupId+","+
                    "'" +file+ "',"+
                    "'" +path.join(getDestDir(),file)+"'"+
                    ")")
                    .then((result)=>{
                        Logger.info('Successfully persisted image file:'+file+' with ID:'+result.insertId);
                        resolve();
                    }).catch((err)=>{
                    reject(err);
                });
            });
        }

        /**
         * Creates a thumbnail file that is better tuned for the web.
         * @param file
         */
        function createThumbnail(file:string): Promise<any>{
            Logger.info('Creating thumbnail for:'+file);
            return new Promise((resolve,reject)=>{
                let thumbnailFileName = path.join(getDestDir(),
                                                  path.basename(file,path.extname(file))+'_THUMB'+path.extname(file));
                Logger.info('Creating thumbnail:'+thumbnailFileName);

                //call identify to get image height and width properties.
                gm(path.join(getDestDir(),file)).identify((err:any, props:any)=>{
                    if(!_.isEmpty(err)){reject(err)};
                    Logger.debug('Identify returned:'+JSON.stringify(props));

                    gm(path.join(getDestDir(),file)).thumb(
                        props.size.width/2,
                        props.size.height/2,
                               thumbnailFileName,
                               conf.thumbnailSettings.quality,
                        (err:any)=>{
                            if(!_.isEmpty(err)){
                                reject(err);
                            }
                            else{
                                resolve();
                            }
                        });
                });
            });
        }

        /**
         * Once all images completed, then queue task will be done.
         */
        function updateCompletedCount(){
            completedCount++;
            if(completedCount === queueBulk.fileBulk.length){
                Logger.info("All done creating thumbnails for this bulk queue task.");
                cb();//executing callback is a trigger that this queue task is now complete.
            }
        }

        //main flow
        if(!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length>0){
            Logger.info("Processing queue task!");

            for(let file of queueBulk.fileBulk){
                Logger.info('Processing thumb for:'+file);
                createThumbnail(file)
                    .then(()=>{
                        persistImage(file)
                            .then(()=>{
                                updateCompletedCount();
                            }).catch(((err)=>{
                                Logger.error('Error persisting file:'+file+' with error:'+err);
                        }))
                    }).catch((err)=>{
                        Logger.error('Error creating thumbnail for file:'+file+' with error:'+err);
                });
            }
        }
    }

    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    queueUpFiles(filesToProcess:Array<string>,imageGroupId:number){
        if(!_.isEmpty(filesToProcess)){
            Logger.info('There will be '+filesToProcess.length+' files to process.');

            let fileBulk: Array<string> = new Array<string>();
            let fileCount:number = 0;

            //traverse ALL files eligible for processing.
            for(let file of filesToProcess){
                fileCount++;
                fileBulk.push(file);

                //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
                if(fileCount % conf.fileBulkSize === 0 || fileCount === filesToProcess.length){
                    Logger.info('The files to process has now reached the max bulk size of:'+conf.fileBulkSize+' or all files exhausted.');
                    Logger.info('Adding bulk to the queue for processing.');
                    this.queue.push({"imageGroupId":imageGroupId, "fileBulk":fileBulk},function(){});
                    this.queueSize++;
                    fileBulk = new Array<string>();//reset
                }
            }
        }
    }

    /**
     * check if you are all done copying all your files to backup dir.
     *
     */
    checkIfDone(filesToProcess:Array<string>,imageGroupId:number){
        this.fileCount--;

        if(!_.isEmpty(filesToProcess) && filesToProcess.length>0){
            Logger.info(this.fileCount+' files left out of '+filesToProcess.length);
        }

        //all done backing up.
        if(!this.fileCount){
            Logger.info('File count is now:'+this.fileCount);

            //if files to process, then lets queue them up.
            if(!_.isEmpty(filesToProcess) && filesToProcess.length>0){
                //now lets just do a sanity check to make sure ALL files were backed up!
                fs.readdir(getDestDir(), (err :any, copiedFiles :Array<string>)=> {
                    //TODO: filter out thumbs to get an accurate count!
                    //Logger.warn(copiedFiles.length + ' files out of '+filesToProcess.length+' were copied to destination directory.');
                    this.queueUpFiles(filesToProcess,imageGroupId);
                });
            }
            else{
                this.emitter.emit(ImagerEvents.DONE);
            }
        }
    }

    /**
     * Creates the destination directory if it doesn't already exist. The base directory of this destination directory
     * is conf.destDir. The dest directory will have the same name as the source directory, but have _COPY appended to the end.
     */
    createDestDir(): Promise<any>{
        return new Promise((resolve,reject)=>{
            try {
                Logger.info('Attempting to create destination directory:'+getDestDir());
                fs.mkdirSync(getDestDir());
                Logger.info('Successfully created destination directory:'+getDestDir());
                resolve();
            }
            catch(err) {
                if ( err.code === 'EEXIST'){
                    Logger.warn('Destination directory already exists. '+getDestDir());
                    resolve();

                }
                else{
                    reject(err);
                }
            }
        });
    }

    persistDestDir(): Promise<any>{
        Logger.info('Attempting to insert into db image group:'+getDestDir());
        return new Promise((resolve,reject)=>{
            mysqlClient.query("insert into image (name,path) " +
                "values(" +
                "'" +path.basename(conf.sourceDir)+ "',"+
                "'" +getDestDir()+"'"+
                ")")
                .then((result)=>{
                    Logger.info('Successfully created image group for '+getDestDir());
                    Logger.debug('After image group persisted, got result:'+JSON.stringify(result));
                    resolve({"imageGroupId":result.insertId});
                }).catch((err)=>{
                reject(err);
            });
        });
    }

    queryDestDir(): Promise<any> {
        Logger.info('Fetching the group image ID from the db for '+getDestDir());
        let imageGroupId:number;

        let date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

        return new Promise((resolve,reject)=>{
            mysqlClient.query("select id from image where groupId is null and path='"+getDestDir()+"'").then((data)=>{
                Logger.info('Select query for image group ID returned:'+JSON.stringify(data));
                if(_.isEmpty(data)){
                    Logger.info(conf.destDir+' image group was not found in the db.');
                    resolve(null);
                }
                else{
                    imageGroupId = data[0].id;
                    Logger.info(conf.destDir+' image group was already found in the db with ID:'+imageGroupId);
                    resolve({"imageGroupId":imageGroupId});
                }

            }).catch(err=>{
                reject(err);
            });
        });
    }

    processSourceDest(imageGroupId:number){
        Logger.info("Scanning source directory:"+conf.sourceDir);

        fs.readdir(conf.sourceDir, (err :any, files :Array<string>)=>{
            Logger.info(files.length+" files found.");
            //this.filesFound = files.length;
            this.fileCount = files.length;

            let filesToProcess: Array<string> = new Array<string>();

            if(!_.isEmpty(files)){
                for(let file of files){
                    if(file){
                        this.verifyNewFile(file,imageGroupId)
                            .then(()=>{
                                if(this.copyFile(file)){//blocking
                                    filesToProcess.push(file);
                                    this.checkIfDone(filesToProcess,imageGroupId);
                                }

                            }).catch((err)=>{
                            this.checkIfDone(filesToProcess,imageGroupId);
                        });
                    }
                }
            }

            if(err){
                Logger.error(err);
            }
        });
    }

    /**
     * Main app execution point.
     */
    run(){
        Logger.info('--Starting execution--');

        this.createDestDir().then(this.queryDestDir)
            .then((queryResult:any)=>{
                if(_.isEmpty(queryResult)){
                    this.persistDestDir()
                        .then((insertResult:any)=>{
                            this.processSourceDest(insertResult.imageGroupId);
                        }).catch((err)=>{'Error persisting dest dir:'+err});
                }
                else{
                    this.processSourceDest(queryResult.imageGroupId);
                }
            })
            .catch((err)=>{
                Logger.error('Error querying destination directory:'+err);
            })

    }//run
}
