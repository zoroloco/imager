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
 * it will backup the file in conf.imageDir_BAK and then create a thumbnail of the file
 * and then save the file meta-data to the db.
 */

export enum ImagerEvents{
    DONE = "DONE"
}

export class App {

    private allowedFileTypes: Set<string>
    private mysqlClient: MySqlClient;
    private backupDir: string;
    private filesFound: number = 0;
    private fileCount: number = 0;
    private queue: Queue;
    private queueSize: number = 0;
    private emitter: any;

    constructor(){
        this.mysqlClient = new MySqlClient();
        this.backupDir = path.join(path.dirname(conf.imageDir),'BAK_'+path.basename(conf.imageDir));
        this.allowedFileTypes = new Set<string>();
        this.allowedFileTypes.add('.png').add('.jpeg').add('.jpg').add('.gif').add('.img').add('.JPG');
        this.queue = new Queue(this.processQueueTask, conf.queueSettings);
        this.emitter = new EventEmitter();

        Logger.info('Backup directory set to:'+this.backupDir);
        this.init();
    }

    /**
     *
     * define any listeners.
     */
    init(){
        this.queue.on('task_finish',(taskId,result)=>{
            Logger.info(taskId+' task has completed successfully.');
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
                let query = "select * from image i where groupId = (select id from image where path='/"+path.basename(conf.imageDir)+ "') and path = '/"+file+"'";
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
     * Will save a copy of this original file in the BAK directory.
     * Will only save a copy if the file does not already exist in the BAK directory.
     * This is done because the creation of
     * the thumbnails will deteriorate the original file.
     *
     * @param file
     */
    backupFile(file:string) {
        try {
            if(!fs.existsSync(path.join(this.backupDir,file))){
                fs.copyFileSync(path.join(conf.imageDir, file), path.join(this.backupDir, file));
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
    persistFile(file:string): Promise<any>{
        Logger.info('Persisting file:'+file);
        return new Promise((resolve,reject)=>{

        });
    }

    /**
     * Creates the backup directory if it doesn't already exist.
     */
    createBackupDir(){
        try {
            Logger.info('Creating directory:'+this.backupDir);
            fs.mkdirSync(this.backupDir);
            return true;
        }
        catch(e) {
            if ( e.code === 'EEXIST'){
                Logger.warn('Backup directory already exists. '+this.backupDir);
                return true;
            }
            else{
                Logger.error('Error creating backup directory:'+e);
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
                let thumbnailFileName = path.join(conf.imageDir,path.basename(file,path.extname(file))+'_THUMB'+path.extname(file));
                Logger.info('Creating thumbnail:'+thumbnailFileName);

                gm(path.join(conf.imageDir,file)).thumb(conf.thumbnailSettings.width,
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
     *
     *
     */
    checkIfDone(filesToProcess:Array<string>){
        this.fileCount--;
        Logger.info(this.fileCount+' files left out of '+this.filesFound);
        if(!this.fileCount){
            Logger.info('File count is now:'+this.fileCount);
            this.queueUpFiles(filesToProcess);
        }
    }

    /**
     * Main app execution point.
     */
    run(){
        Logger.info('--Starting execution--');

        if(!this.createBackupDir()){
            process.exit();
        }

        Logger.info("Scanning directory:"+conf.imageDir);
        fs.readdir(conf.imageDir, (err :any, files :Array<string>)=>{
            Logger.info(files.length+" files found.");
            this.filesFound = files.length;
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
