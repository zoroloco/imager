import * as _ from 'underscore';
import {Logger} from './logger';
import conf from './conf.json';
import MySqlClient from './mysqlClient';
import Queue from 'better-queue';
const gm = require('gm').subClass({imageMagick: true});
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');

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
    private mysqlClient: MySqlClient;
    private fileCount: number = 0;
    private queue: Queue;
    private queueSize: number = 0;
    private emitter: any;

    constructor(){
        this.mysqlClient = new MySqlClient();
        this.allowedFileTypes = new Set<string>();
        this.allowedFileTypes.add('.png').add('.jpeg').add('.jpg').add('.gif').add('.img').add('.JPG');
        this.queue = new Queue(this.processQueueTask, conf.queueSettings);
        this.emitter = new EventEmitter();

        this.defineListener();
    }

    /**
     *
     * define any listeners.
     */
    defineListener(){
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
    verifyNewFile(file:string): Promise<any>{
        return new Promise((resolve,reject)=>{
            Logger.info("Processing file:"+file);

            //weed out wrong file types
            if(this.allowedFileTypes.has(path.extname(file))){
                let query = "select * from image i where groupId = (select id from image where path='/"+path.basename(getDestDir())+ "') and path = '/"+file+"'";
                Logger.debug("Executing mysql query:"+query);

                this.mysqlClient.query(query).then(results=>{
                    if(_.isEmpty(results)){
                        Logger.debug(file+" not found in db.");
                        resolve();
                    }
                    else{
                        reject(file+" was already found in db.");
                    }

                }).catch(err=>{
                    reject('Error encountered while searching db for file:'+file);
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
    backupFile(file:string) {
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
     * Saves the file meta-data to the database so subsequent runs of this imageDir won't
     * work on the same files again.
     *
     * @param file
     */
    persistFile(file:string): Promise<any>{//TODO: may have to create parent db row before child.
        Logger.info('Persisting file:'+file);
        return new Promise((resolve,reject)=>{

        });
    }

    /**
     * Creates the destination directory if it doesn't already exist. The base directory of this destination directory
     * is conf.destDir. The dest directory will have the same name as the source directory, but have _COPY appended to the end.
     */
    createDestDir(){
        try {
            Logger.info('Attempting to create destination directory:'+getDestDir());
            fs.mkdirSync(getDestDir());
            Logger.info('Successfully created destination directory:'+getDestDir());
            return true;
        }
        catch(e) {
            if ( e.code === 'EEXIST'){
                Logger.warn('Destination directory already exists. '+getDestDir());
                return true;
            }
            else{
                Logger.error('Error creating destination directory:'+e);
            }
        }
        return false;
    }

    /**
     * Processes a batch of files that have been queued up.
     * This is the callback method called by the queue.
     */
    processQueueTask(queueBulk:any, cb:any){
        let thumbCount:number = 0;

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

                gm(path.join(getDestDir(),file)).thumb(conf.thumbnailSettings.width,
                    conf.thumbnailSettings.height,
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
        }

        function updateThumbCount(){
            thumbCount++;
            if(thumbCount === queueBulk.fileBulk.length){
                Logger.info("All done creating thumbnails for this bulk queue task.");
                cb();//executing callback is a trigger that this queue task is now complete.
            }
        }

        if(!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length>0){
            Logger.info("Processing queue task!");

            for(let file of queueBulk.fileBulk){
                Logger.info('Processing thumb for:'+file);
                createThumbnail(file)
                    .then(()=>{
                        updateThumbCount();
                    }).catch((err)=>{
                        Logger.error('Error creating thumbnail:'+err);
                });
            }
        }
    }

    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    queueUpFiles(filesToProcess:Array<string>){
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
                    Logger.info('The files to process has now reached the max bulk size of:'+conf.fileBulkSize);
                    Logger.info('Adding bulk to the queue for processing.');
                    this.queue.push({"fileCount":fileCount, "fileBulk":fileBulk},function(){});
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
    checkIfDone(filesToProcess:Array<string>){
        this.fileCount--;
        Logger.info(this.fileCount+' files left out of '+filesToProcess.length);
        //all done backing up.
        if(!this.fileCount){
            Logger.info('File count is now:'+this.fileCount);
            //now lets just do a sanity check to make sure ALL files were backed up!
            fs.readdir(getDestDir(), (err :any, copiedFiles :Array<string>)=> {
                //TODO: filter out thumbs to get an accurate count!
                Logger.warn(copiedFiles.length + ' files out of '+filesToProcess.length+' were copied to destination directory.');
                this.queueUpFiles(filesToProcess);
            });
        }
    }

    /**
     * Main app execution point.
     */
    run(){
        Logger.info('--Starting execution--');

        if(!this.createDestDir()){
            process.exit();
        }

        Logger.info("Scanning source directory:"+conf.sourceDir);

        fs.readdir(conf.sourceDir, (err :any, files :Array<string>)=>{
            Logger.info(files.length+" files found.");
            //this.filesFound = files.length;
            this.fileCount = files.length;

            let filesToProcess: Array<string> = new Array<string>();

            if(!_.isEmpty(files)){
                for(let file of files){
                    if(file){
                        this.verifyNewFile(file)
                            .then(()=>{
                                if(this.backupFile(file)){//blocking
                                    filesToProcess.push(file);
                                    this.checkIfDone(filesToProcess);
                                }

                                }).catch((err)=>{
                            this.checkIfDone(filesToProcess);
                        });
                    }
                }
            }

            if(err){
                Logger.error(err);
            }
        });

        //process.exit();
    }//run
}
