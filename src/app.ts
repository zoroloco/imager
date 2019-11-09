import * as _ from 'underscore';
import {Logger} from './logger';
import conf from './conf.json';
import MySqlClient from './mysqlClient';
import Queue from 'better-queue';
import {FileData} from './fileData';
const gm = require('gm').subClass({imageMagick: true});
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid/v4');

const mysqlClient: MySqlClient = new MySqlClient();

let srcDir:string = '';
let destDir:string = '';

/**
 * Traverses conf.imageDir files and for each filename not found in the database,
 * it will backup the file and then create a thumbnail
 * finally save the file meta-data to the db.
 */

export enum ImagerEvents{
    DONE = "DONE"
}

function getDestDir(){
    return path.join(destDir,path.basename(srcDir)+'_COPY');
}

export class App {

    private allowedFileTypes: Set<string>
    private sourceFileCounter: number = 0;//the current count of image files in src dir
    private sourceFileCount: number = 0;//the total image files in src dir
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
     * Processes a batch of files that have been queued up.
     * This is the callback method called by the queue.
     */
    processQueueTask(queueBulk:any, cb:any){
        let completedCount:number = 0;

        function persistImage(fileData:FileData): Promise<any>{
            Logger.info('Persisting image file:'+fileData.toString()+' to image group ID:'+queueBulk.imageGroupId);
            return new Promise((resolve,reject)=>{
                mysqlClient.query("insert into image (groupId,sourcePath,path) " +
                    "values(" +queueBulk.imageGroupId+","+
                    "'" +fileData.sourcePath+ "',"+
                    "'" +fileData.path+"'"+
                    ")")
                    .then((result)=>{
                        Logger.info('Successfully persisted image file:'+fileData.toString()+' with ID:'+result.insertId);
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
        function createThumbnail(fileData:FileData): Promise<any>{
            Logger.info('Creating thumbnail for:'+fileData.sourcePath);
            return new Promise((resolve,reject)=>{
                let thumbnailFileName = path.join(path.dirname(fileData.path),
                                        path.basename(fileData.path,path.extname(fileData.path))+'_THUMB'+path.extname(fileData.path));
                Logger.info('Creating thumbnail:'+thumbnailFileName);

                //call identify to get image height and width properties.
                gm(fileData.path).identify((err:any, props:any)=>{
                    if(!_.isEmpty(err)){reject(err)};
                    Logger.debug('Identify returned:'+JSON.stringify(props));

                    gm(fileData.path).thumb(
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
                Logger.info("All done creating thumbnails and persisting images for this bulk queue task.");
                cb();//executing callback is a trigger that this queue task is now complete.
            }
        }

        //main flow
        if(!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length>0){
            Logger.info("Processing queue task!");

            for(let fileData of queueBulk.fileBulk){
                Logger.debug('Processing thumb for:'+fileData.toString());
                createThumbnail(fileData)
                    .then(()=>{
                        persistImage(fileData)
                            .then(()=>{
                                updateCompletedCount();
                            }).catch(((err)=>{
                                Logger.error('Error persisting file:'+fileData.toString()+' with error:'+err);
                        }))
                    }).catch((err)=>{
                        Logger.error('Error creating thumbnail for file:'+fileData.toString()+' with error:'+err);
                });
            }
        }
    }

    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    queueUpFiles(filesToProcess:Array<FileData|null>,imageGroupId:number){
        Logger.info('There will be '+filesToProcess.length+' files to process.');

        let fileBulk: Array<FileData|null> = new Array<FileData|null>();
        let fileCount:number = 0;

        //traverse ALL files eligible for processing.
        for(let fileData of filesToProcess){
            fileCount++;
            fileBulk.push(fileData);

            //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
            if(fileCount % conf.fileBulkSize === 0 || fileCount === filesToProcess.length){
                Logger.info('The files to process has now reached the max bulk size of:'+conf.fileBulkSize+' or all files exhausted.');
                Logger.info('Adding bulk to the queue for processing.');
                this.queue.push({"imageGroupId":imageGroupId, "fileBulk":fileBulk},function(){});
                this.queueSize++;
                fileBulk = new Array<FileData>();//reset
            }
        }
    }

    /**
     * check if you are all done copying all your files to backup dir.
     *
     */
    checkIfDone(filesToProcess:Array<FileData|null>,imageGroupId:number){
        this.sourceFileCounter--;

        Logger.info(this.sourceFileCounter+' files remain to be processed.');

        if(!_.isEmpty(filesToProcess) && filesToProcess.length>0){
            Logger.info(this.sourceFileCounter+' files left to evaluate.');
        }

        //all done backing up.
        if(!this.sourceFileCounter){//exhausted going through all files in src dir
            Logger.info('File count is now:'+this.sourceFileCounter);

            //if files to process, then lets queue them up.
            if(!_.isEmpty(filesToProcess) && filesToProcess.length>0){
                //now lets just do a sanity check to make sure ALL files were backed up!
                fs.readdir(getDestDir(), (err :any, copiedFiles :Array<string>)=> {
                    Logger.info(copiedFiles.length + ' total files exist in the dest directory.');
                    Logger.info(this.sourceFileCount+' total files exist in the src directory.');
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
            mysqlClient.query("insert into image (sourcePath,path) " +
                "values("+
                "'"+srcDir+"',"+
                "'"+getDestDir()+"'"+
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

    /**
     *
     * Figure out if the dest already exists in the DB.
     */
    queryDestDir(): Promise<any> {
        Logger.info('Fetching the group image ID from the db for '+getDestDir());
        let imageGroupId:number;

        let date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

        return new Promise((resolve,reject)=>{
            mysqlClient.query("select id from image where groupId is null and path='"+getDestDir()+"'").then((data)=>{
                Logger.info('Select query for image group ID returned:'+JSON.stringify(data));
                if(_.isEmpty(data)){
                    Logger.info(getDestDir()+' image group was not found in the db.');
                    resolve(null);
                }
                else{
                    imageGroupId = data[0].id;
                    Logger.info(getDestDir()+' image group was already found in the db with ID:'+imageGroupId);
                    resolve({"imageGroupId":imageGroupId});
                }

            }).catch(err=>{
                reject(err);
            });
        });
    }

    /**
     * Verifies if the file already exists in the image table.
     *
     * @param file
     */
    queryFile(file:string,imageGroupId:number): Promise<any>{
        return new Promise((resolve,reject)=> {
            Logger.debug("Querying db for file:" + file);

            let query = "select * from image i where groupId = " + imageGroupId + " and sourcePath = '" + path.join(srcDir, file) + "'";

            mysqlClient.query(query).then(results => {
                if (_.isEmpty(results)) {
                    Logger.debug(file + " not found in db.");
                    resolve();
                } else {
                    reject(file + " was already found in db.");
                }

            }).catch(err => {
                reject(err);
            });
        });
    }

    /**
     *
     * @param file
     */
    copyFile(file:string) :FileData|null{
        let uniqueFilename:string = uuidv4()+path.extname(file);
        Logger.info(file+' is being renamed to:'+uniqueFilename);
        try {
            fs.copyFileSync(path.join(srcDir, file), path.join(getDestDir(), uniqueFilename));
            Logger.info('Successfully backed up file:'+file+' at '+path.join(getDestDir(), uniqueFilename));
            let fileData:FileData = new FileData();
            fileData.sourcePath = path.join(srcDir, file);
            fileData.path = path.join(getDestDir(), uniqueFilename);
            return fileData;
        }
        catch(e){
            Logger.error('Error backing up file:'+file+' with error:'+e);
        }

        Logger.error('Error backing up file:'+file);
        return null;
    }

    /**
     *
     * @param file
     */
    verifyFileType(file:string): boolean{
        if(this.allowedFileTypes.has(path.extname(file))) {
            return true;
        }
        else{
            Logger.warn('Not adding:'+file+' because it is of the wrong filetype.');
            return false;
        }
    }

    /**
     *
     * @param imageGroupId
     */
    processSourceDest(imageGroupId:number){
        Logger.info("Scanning source directory:"+srcDir);

        fs.readdir(srcDir, (err :any, files :Array<string>)=>{

            if(!_.isEmpty(err)){
                Logger.error(err);
                this.emitter.emit(ImagerEvents.DONE);
                return;
            }

            Logger.info(files.length+" total files found in src directory:"+srcDir);
            this.sourceFileCounter = files.length;
            this.sourceFileCount = files.length;//total valid files found in the source dir.

            //this array contains files that do not exist already in the db.
            let filesToProcess: Array<FileData|null> = new Array<FileData|null>();

            if(!_.isEmpty(files)){
                for(let file of files){
                    if(file){
                        if(this.verifyFileType(file)){
                            this.queryFile(file,imageGroupId)
                                .then(()=>{
                                    let fileData = this.copyFile(file);
                                    if(!_.isEmpty(fileData)) {
                                        filesToProcess.push(fileData);
                                        this.checkIfDone(filesToProcess,imageGroupId);
                                    }
                                    else{
                                        this.checkIfDone(filesToProcess,imageGroupId);
                                    }
                                })
                                .catch((err)=>{
                                    this.checkIfDone(filesToProcess,imageGroupId);
                            });
                        }
                        else{
                            this.sourceFileCount--;
                            this.checkIfDone(filesToProcess,imageGroupId);
                        }
                    }
                }
            }
            else{
                Logger.info(srcDir+' did not contain any files.');
                this.emitter.emit(ImagerEvents.DONE);
            }
        });
    }

    /**
     * Main app execution point.
     */
    run(){
        Logger.info('--Starting execution--');
        //0         //1        //2   //3
        //node lib/index.js  /foo  /bar
        if(process.argv.length === 4){
            srcDir = process.argv[2];
            destDir = process.argv[3];
        }

        if(_.isEmpty(srcDir) || _.isEmpty(destDir)){
            Logger.error('Src and Dest directories need to be specified. Please run program in the format: node lib/index.js -srcDir /foo -destDir /bar');
            this.emitter.emit(ImagerEvents.DONE);
        }
        else{
            Logger.info('Source directory:'+srcDir+' Destination directory:'+destDir);
        }

        this.createDestDir().then(this.queryDestDir)
            .then((queryResult:any)=>{
                if(_.isEmpty(queryResult)){
                    this.persistDestDir()
                        .then((insertResult:any)=>{
                            this.processSourceDest(insertResult.imageGroupId);
                        }).catch((err)=>{
                            Logger.error('Error persisting dest dir:'+err);
                            this.emitter.emit(ImagerEvents.DONE);
                        });
                }
                else{
                    this.processSourceDest(queryResult.imageGroupId);
                }
            })
            .catch((err)=>{
                Logger.error('Error querying destination directory:'+err);
                this.emitter.emit(ImagerEvents.DONE);
            })

    }//run
}
