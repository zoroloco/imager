import * as _ from 'underscore';
import {Logger} from './logger';
import Image from './image';
import conf from './conf.json';
import MySqlClient from './mysqlClient';
import ElasticClient from './elasticClient';
import Queue from 'better-queue';
import {TagUpdater} from "./tagUpdater";
import {ImagerEvents} from './imagerEvents';

const gm = require('gm');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid/v4');

const mysqlClient: MySqlClient = new MySqlClient();
const elasticClient: ElasticClient = new ElasticClient();

let srcDir:string = '';
let destDir:string = '';

/**

 The text images below explain the different EXIF orientations.

 1        2       3      4         5            6           7          8

 888888  888888      88  88      8888888888  88                  88  8888888888
 88          88      88  88      88  88      88  88          88  88      88  88
 8888      8888    8888  8888    88          8888888888  8888888888          88
 88          88      88  88
 88          88  888888  888888

 */
export enum ExifOrientation{
    TOP_LEFT = 1,
    TOP_RIGHT,
    BOTTOM_RIGHT,
    BOTTOM_LEFT,
    LEFT_TOP,
    RIGHT_TOP,
    RIGHT_BOTTOM,
    LEFT_BOTTOM
}

function getDestDir(){
    return path.join(destDir,path.basename(srcDir));
}

export class ImageCreator {

    private allowedFileTypes: Set<string>
    private sourceFileCounter: number = 0;//the current count of image files in src dir
    private sourceFileCount: number = 0;//the total image files in src dir
    private queue: Queue;
    private queueSize: number = 0;
    private emitter: any;

    constructor(srcDirectory:string,destDirectory:string){
        srcDir = srcDirectory;
        destDir = destDirectory;
        this.allowedFileTypes = new Set<string>();
        this.allowedFileTypes.add('.png').add('.jpeg').add('.jpg').add('.gif').add('.img').add('.JPG').add('.JPEG').add('.PNG');
        this.queue = new Queue(this.processQueueTask, conf.queueSettings);
        this.emitter = new EventEmitter();

        this.defineListeners();
        this.start();
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

        /**
         *
         * @param image
         */
        function persistImage(image:Image): Promise<any>{
            Logger.info('Posting image file to elastic index:'+image.toString()+' to image group ID:'+queueBulk.imageGroupId);
            return elasticClient.indexImage(image);
        }

        /**
         * When you view an image in a browser or file explorer, it uses the EXIF data to see if the image was shot upside down or
         * at some non-normal orientation.  The browser uses that EXIF data to properly display the image to you. When you create a
         * thumbnail, all this EXIF meta-data is stripped out, so the browser/OS will not know how to auto orient and you will see the
         * image as-is, which is the way it was shot.  In the createThumbnail method we captured the orientation value and we use it in
         * this method to correctly rotate the thumbnail so it will match the original pic.
         *
         * @param image
         */
        function autoOrientThumb(image:Image): Promise<any>{
            Logger.info('Attempting to auto-orient file:'+image.getAbsoluteThumbPath()+ ' with orientation value of:'+image.orientation);
            return new Promise((resolve,reject)=> {
                if(!_.isEmpty(image.orientation)){
                    Logger.info('Orientation found of:'+image.orientation);
                    if(image.orientation === ExifOrientation.TOP_LEFT+''){
                        Logger.info('Orientation is left top normal. No need to auto orient.');
                        resolve(image);
                    }
                    else{
                        Logger.info('Orientation of:'+image.orientation+' found. There is a need to auto orient.');
                        let rotationAngle:number = 0;
                        switch(image.orientation){
                            case ExifOrientation.BOTTOM_RIGHT+'':
                                rotationAngle = 180;
                                break;
                            case ExifOrientation.RIGHT_TOP+'':
                                rotationAngle = 90;
                                break;
                            default:
                                break;
                        }

                        if(rotationAngle>0){
                            Logger.info('Attempting to flip thumb image '+rotationAngle+' degrees.');
                            gm(image.getAbsoluteThumbPath()).rotate('white',rotationAngle)
                                .write(image.getAbsoluteThumbPath(),   (err:any)=>{
                                    if(!_.isEmpty(err)){
                                        reject(err);
                                    }
                                    else{
                                        resolve(image);
                                    }
                                });
                        }
                        else{
                            resolve(image);
                        }
                    }
                }
                else{
                    resolve(image);
                }
            });
        }

        /**
         * Creates a thumbnail file that is better tuned for the web.  Note: thumbnail creation also
         * strips out all EXIF meta-data. This is captured though in our image object.
         *
         * @param image
         */
        function createThumbnail(image:Image): Promise<any>{
            Logger.info('Creating thumbnail for:'+image.getAbsolutePath());
            return new Promise((resolve,reject)=>{
                image.thumbFileName = path.basename(image.fileName,path.extname(image.fileName))+'_THUMB'+path.extname(image.fileName);
                Logger.debug('Thumbnail filename = '+image.thumbFileName+' image filename='+image.fileName+' image path='+image.path);


                let thumbPath = path.join(path.dirname(image.path,image.thumbFileName),
                                        );
                Logger.info('Creating thumbnail:'+thumbPath);

                //call identify to get image height and width properties.
                gm(image.getAbsolutePath()).identify((err:any, props:any)=>{
                    if(!_.isEmpty(err)){reject(err)};
                    Logger.debug('Identify returned:'+JSON.stringify(props));

                    if(!_.isEmpty(props)){
                        if(props.hasOwnProperty('format'))
                            image.format = props.format;
                        if(props.hasOwnProperty('Mime type'))
                            image.mimeType = props["Mime type"];
                        if(props.hasOwnProperty("Resolution"))
                            image.resolution = props.Resolution;

                        if(props.hasOwnProperty('Properties')) {//Works for mobile.
                            image.orientation = props.Properties['exif:Orientation'];
                            image.cameraModel = props.Properties['exif:Model'];
                            if(!_.isEmpty(props.Properties['date:modify']))
                                image.dateImageTaken = props.Properties['date:modify'];

                            if(!_.isEmpty(props.Properties['date:create']))//2019-10-14T02:04:41+00:00
                                image.dateImageCreated = props.Properties['date:create'];
                        }
                        else if(props.hasOwnProperty('Profile-EXIF')){//For Sony NEX5n camera.
                            image.cameraMake = props['Profile-EXIF']['Make'];
                            image.cameraModel = props['Profile-EXIF']['Model'];
                            image.orientation = props['Profile-EXIF']['Profile-EXIF'].Orientation;

                            //2019:07:09 16:58:35'
                            let dateImageTakenStr = props['Profile-EXIF']['Date Time'];
                            if(!_.isEmpty(dateImageTakenStr)){
                                let strSplit:string[] = dateImageTakenStr.toString().split(' ');
                                if(null != strSplit && strSplit.length>1){
                                    let dateStr:string = strSplit[0];
                                    let timeStr:string = strSplit[1];

                                    dateStr = dateStr.replace(':','-').replace(':','-');
                                    dateStr = dateStr+' '+timeStr;
                                    let dateImageTaken = new Date(dateStr);
                                    image.dateImageTaken = dateImageTaken;
                                    Logger.info('Date image taken for '+image.fileName+':'+image.dateImageTaken);
                                }
                            }
                        }

                        if(props.hasOwnProperty('size')){
                            image.height = props.size.height;
                            image.width = props.size.width;

                            Logger.info('DONE extracting EXIF properties for image:'+image.toString());

                            gm(image.getAbsolutePath()).thumb(
                                props.size.width/2,
                                props.size.height/2,
                                image.getAbsoluteThumbPath(),
                                conf.thumbnailSettings.quality,
                                (err:any)=>{
                                    if(!_.isEmpty(err)){
                                        reject(err);
                                    }
                                    else{
                                        resolve(image);
                                    }
                                });
                        }
                        else{
                            reject('File:'+image.getAbsoluteThumbPath()+' did not contain valid EXIF data and a thumbnail could not be created.');
                        }
                    }
                    else{
                        reject('File:'+image.getAbsoluteThumbPath()+' did not contain valid EXIF data and a thumbnail could not be created.');
                    }

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

        //main flow of queue task that is processing.
        if(!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length>0){
            Logger.info("Processing queue task!");

            for(let image of queueBulk.fileBulk){
                Logger.debug('Processing thumb for:'+image.toString());

                createThumbnail(image).then(autoOrientThumb).then(persistImage).then(updateCompletedCount)
                    .catch((err)=>{Logger.error(err)});
            }
        }
    }

    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    queueUpFiles(filesToProcess:Array<Image|null>,imageGroupId:number){
        Logger.info('There will be '+filesToProcess.length+' files to process.');

        let fileBulk: Array<Image|null> = new Array<Image|null>();
        let fileCount:number = 0;

        //traverse ALL files eligible for processing.
        for(let image of filesToProcess){
            fileCount++;
            fileBulk.push(image);

            //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
            if(fileCount % conf.fileBulkSize === 0 || fileCount === filesToProcess.length){
                Logger.info('The files to process has now reached the max bulk size of:'+conf.fileBulkSize+' or all files exhausted.');
                Logger.info('Adding bulk to the queue for processing.');
                this.queue.push({"imageGroupId":imageGroupId, "fileBulk":fileBulk},function(){});
                this.queueSize++;
                fileBulk = new Array<Image>();//reset
            }
        }
    }

    /**
     * check if you are all done copying all your files to backup dir.
     *
     */
    checkIfCopyDone(filesToProcess:Array<Image|null>,imageGroupId:number){
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
                    //now verify ALL files were copied before proceeding.
                    if(copiedFiles.length === this.sourceFileCount){
                        Logger.info('ALL files were successfully copied.');
                        this.queueUpFiles(filesToProcess,imageGroupId);
                    }
                    else{
                        Logger.info(copiedFiles.length+' files were copied out of '+this.sourceFileCount+' files.');
                        this.emitter.emit(ImagerEvents.DONE);
                    }
                });
            }
            else{
                Logger.info('No files to process.');
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
            mysqlClient.query("insert into imageGroup (sourcePath,path,createdBy) " +
                "values("+
                "'"+srcDir+"',"+
                "'"+getDestDir()+"',"+4+//my user id
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
            mysqlClient.query("select id from imageGroup where path='"+getDestDir()+"' and sourcePath='"+srcDir+"' and deactivationTime is null").then((data)=>{
                Logger.info('Select query for image group returned:'+JSON.stringify(data));
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
        let fileName = path.basename(file, path.extname(file));
        Logger.debug("Querying elastic for image:" + fileName+' with groupId:'+imageGroupId);

        return new Promise((resolve,reject)=> {

            let searchParams = {
                "query": {
                    "bool": {
                        "filter": [
                            {"match": {"groupId": imageGroupId}},
                            {"match": {"sourceName": fileName}}
                        ]
                    }
                }
            };

            elasticClient.search(0,100,searchParams).then((result)=>{
                Logger.info('Elastic query for image:'+fileName+' returned '+JSON.stringify(result.body.hits.hits.length)+' result(s).');
                if(result.body.hits.hits.length<=0){
                    Logger.info('Image filename:'+fileName+' was NOT found in elastic.');
                    resolve();
                }
                else{
                    reject('Image filename:'+fileName+' already found in elastic.');
                }
            }).catch((err)=>{Logger.error('Error querying elastic for existing image with err:'+JSON.stringify(err))});

        });
    }

    /**
     *
     * @param file
     */
    copyFile(file:string, imageGroupId:number) :Image|null{
        let uniqueFilename:string = uuidv4()+path.extname(file);
        Logger.info(file+' is being renamed to:'+uniqueFilename);
        try {
            fs.copyFileSync(path.join(srcDir, file), path.join(getDestDir(), uniqueFilename));
            Logger.info('Successfully backed up file:'+file+' at '+path.join(getDestDir(), uniqueFilename));
            let image:Image = new Image();
            image.sourcePath = srcDir;
            image.sourceName = file;
            image.path = getDestDir();
            image.fileName = uniqueFilename;
            image.groupName = path.basename(srcDir);
            image.groupId = imageGroupId+'';
            image.createdTime = new Date().toDateString();
            image.createdBy = "4";
            image.tags.push('khc');//add the universal tag.

            return image;
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
            if(!(/(\/|^)\.[^\/\.]/g).test(file)) {//ignore hidden files. TODO: get this to work!
                return true;
            }
            else{
                Logger.warn('Not adding:'+file+' because it is a hidden file.');
                return false;
            }
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
            let filesToProcess: Array<Image|null> = new Array<Image|null>();

            if(!_.isEmpty(files)){
                for(let file of files){
                    if(file){
                        if(this.verifyFileType(file)){
                            this.queryFile(file,imageGroupId)
                                .then(()=>{
                                    let image = this.copyFile(file,imageGroupId);
                                    if(!_.isEmpty(image)) {
                                        filesToProcess.push(image);
                                        this.checkIfCopyDone(filesToProcess,imageGroupId);
                                    }
                                    else{
                                        this.checkIfCopyDone(filesToProcess,imageGroupId);
                                    }
                                })
                                .catch((err)=>{
                                    this.checkIfCopyDone(filesToProcess,imageGroupId);
                            }).catch((err)=>{Logger.error(err)});
                        }
                        else{
                            this.sourceFileCount--;
                            this.checkIfCopyDone(filesToProcess,imageGroupId);
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
     * start the main flow of adding images to elastic.
     */
    start(){
        Logger.info('ADDING IMAGES - Source directory:'+srcDir+' Destination directory:'+destDir);

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
    }

}
