"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var _ = __importStar(require("underscore"));
var logger_1 = require("./logger");
var conf_json_1 = __importDefault(require("./conf.json"));
var mysqlClient_1 = __importDefault(require("./mysqlClient"));
var better_queue_1 = __importDefault(require("better-queue"));
var fileData_1 = require("./fileData");
var gm = require('gm').subClass({ imageMagick: true });
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var uuidv4 = require('uuid/v4');
var mysqlClient = new mysqlClient_1.default();
var srcDir = '';
var destDir = '';
/**
 * Traverses conf.imageDir files and for each filename not found in the database,
 * it will backup the file and then create a thumbnail
 * finally save the file meta-data to the db.
 */
var ImagerEvents;
(function (ImagerEvents) {
    ImagerEvents["DONE"] = "DONE";
})(ImagerEvents = exports.ImagerEvents || (exports.ImagerEvents = {}));
function getDestDir() {
    return path.join(destDir, path.basename(srcDir));
}
var App = /** @class */ (function () {
    function App() {
        this.sourceFileCounter = 0; //the current count of image files in src dir
        this.sourceFileCount = 0; //the total image files in src dir
        this.queueSize = 0;
        this.allowedFileTypes = new Set();
        this.allowedFileTypes.add('.png').add('.jpeg').add('.jpg').add('.gif').add('.img').add('.JPG');
        this.queue = new better_queue_1.default(this.processQueueTask, conf_json_1.default.queueSettings);
        this.emitter = new EventEmitter();
        this.defineListeners();
    }
    /**
     *
     * define any listeners.
     */
    App.prototype.defineListeners = function () {
        var _this = this;
        this.queue.on('task_finish', function (taskId, result) {
            logger_1.Logger.info(taskId + ' queue task has completed successfully.');
            _this.queueSize--;
            if (!_this.queueSize) {
                _this.emitter.emit(ImagerEvents.DONE);
            }
        });
        this.queue.on('task_failed', function (taskId, err) {
            logger_1.Logger.error(taskId + ' task failed with error:' + err);
        });
        this.emitter.on(ImagerEvents.DONE, function () {
            logger_1.Logger.info(ImagerEvents.DONE + ' event has been invoked.');
            process.exit();
        });
    };
    /**
     * Processes a batch of files that have been queued up.
     * This is the callback method called by the queue.
     */
    App.prototype.processQueueTask = function (queueBulk, cb) {
        var completedCount = 0;
        function persistImage(fileData) {
            logger_1.Logger.info('Persisting image file:' + fileData.toString() + ' to image group ID:' + queueBulk.imageGroupId);
            return new Promise(function (resolve, reject) {
                mysqlClient.query("insert into image (groupId,sourcePath,path,width,height,resolution,mimeType,format,createdBy) " +
                    "values(" + queueBulk.imageGroupId + "," +
                    "'" + fileData.sourcePath + "'," +
                    "'" + fileData.path + "'," + fileData.width + "," + fileData.height + "," +
                    "'" + fileData.resolution + "'," +
                    "'" + fileData.mimeType + "'," +
                    "'" + fileData.format + "'," +
                    4 + //my user id
                    ")")
                    .then(function (result) {
                    logger_1.Logger.info('Successfully persisted image file:' + fileData.toString() + ' with ID:' + result.insertId);
                    resolve();
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        /*
        function autoOrient(fileData:FileData): Promise<any>{
            Logger.info('Attempting to auto-orient file:'+fileData.sourcePath);
            return new Promise((resolve,reject)=> {
                let ext:string = path.extname(fileData.path);
                if(ext === 'JPG' || ext === 'JPEG' || ext === 'jpg' || ext === 'jpeg'){
                    gm(path.join(path.dirname(fileData.path)))
                        .autoOrient()
                        .write(path.join(path.dirname(fileData.path)), function (err:any) {
                            if (err){
                                reject('Error encountered trying to auto orient file:'+fileData.path+' with error:'+err);
                            }
                            else{
                                Logger.info('Successfully auto oriented file:'+fileData.path);
                                resolve();
                            }
                        });
                }
                else{
                    Logger.info('Will not try to auto orient file if it is not of type jpg/jpeg');
                    resolve();
                }
            });
        }
        */
        /**
         * Creates a thumbnail file that is better tuned for the web.
         * @param file
         */
        function createThumbnail(fileData) {
            logger_1.Logger.info('Creating thumbnail for:' + fileData.sourcePath);
            return new Promise(function (resolve, reject) {
                var thumbnailFileName = path.join(path.dirname(fileData.path), path.basename(fileData.path, path.extname(fileData.path)) + '_THUMB' + path.extname(fileData.path));
                logger_1.Logger.info('Creating thumbnail:' + thumbnailFileName);
                //call identify to get image height and width properties.
                gm(fileData.path).identify(function (err, props) {
                    if (!_.isEmpty(err)) {
                        reject(err);
                    }
                    ;
                    logger_1.Logger.debug('Identify returned:' + JSON.stringify(props));
                    if (!_.isEmpty(props)) {
                        if (props.hasOwnProperty('format'))
                            fileData.format = props.format;
                        if (props.hasOwnProperty('Mime type'))
                            fileData.mimeType = props["Mime type"];
                        if (props.hasOwnProperty("Resolution"))
                            fileData.resolution = props.Resolution;
                        if (props.hasOwnProperty('size')) {
                            fileData.height = props.size.height;
                            fileData.width = props.size.width;
                            gm(fileData.path).thumb(props.size.width / 2, props.size.height / 2, thumbnailFileName, conf_json_1.default.thumbnailSettings.quality, function (err) {
                                if (!_.isEmpty(err)) {
                                    reject(err);
                                }
                                else {
                                    resolve(fileData);
                                }
                            });
                        }
                        else {
                            reject('File:' + fileData.path + ' did not contain valid EXIF data and a thumbnail could not be created.');
                        }
                    }
                    else {
                        reject('File:' + fileData.path + ' did not contain valid EXIF data and a thumbnail could not be created.');
                    }
                });
            });
        }
        /**
         * Once all images completed, then queue task will be done.
         */
        function updateCompletedCount() {
            completedCount++;
            if (completedCount === queueBulk.fileBulk.length) {
                logger_1.Logger.info("All done creating thumbnails and persisting images for this bulk queue task.");
                cb(); //executing callback is a trigger that this queue task is now complete.
            }
        }
        //main flow of queue task that is processing.
        if (!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length > 0) {
            logger_1.Logger.info("Processing queue task!");
            var _loop_1 = function (fileData) {
                logger_1.Logger.debug('Processing thumb for:' + fileData.toString());
                createThumbnail(fileData)
                    .then(function (fileData) {
                    persistImage(fileData)
                        .then(function () {
                        updateCompletedCount();
                    }).catch((function (err) {
                        logger_1.Logger.error('Error persisting file:' + fileData.toString() + ' with error:' + err);
                    }));
                }).catch(function (err) {
                    logger_1.Logger.error('Error creating thumbnail for file:' + fileData.toString() + ' with error:' + err);
                }).catch(function (err) {
                    logger_1.Logger.error(err);
                });
            };
            for (var _i = 0, _a = queueBulk.fileBulk; _i < _a.length; _i++) {
                var fileData = _a[_i];
                _loop_1(fileData);
            }
        }
    };
    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    App.prototype.queueUpFiles = function (filesToProcess, imageGroupId) {
        logger_1.Logger.info('There will be ' + filesToProcess.length + ' files to process.');
        var fileBulk = new Array();
        var fileCount = 0;
        //traverse ALL files eligible for processing.
        for (var _i = 0, filesToProcess_1 = filesToProcess; _i < filesToProcess_1.length; _i++) {
            var fileData = filesToProcess_1[_i];
            fileCount++;
            fileBulk.push(fileData);
            //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
            if (fileCount % conf_json_1.default.fileBulkSize === 0 || fileCount === filesToProcess.length) {
                logger_1.Logger.info('The files to process has now reached the max bulk size of:' + conf_json_1.default.fileBulkSize + ' or all files exhausted.');
                logger_1.Logger.info('Adding bulk to the queue for processing.');
                this.queue.push({ "imageGroupId": imageGroupId, "fileBulk": fileBulk }, function () { });
                this.queueSize++;
                fileBulk = new Array(); //reset
            }
        }
    };
    /**
     * check if you are all done copying all your files to backup dir.
     *
     */
    App.prototype.checkIfCopyDone = function (filesToProcess, imageGroupId) {
        var _this = this;
        this.sourceFileCounter--;
        logger_1.Logger.info(this.sourceFileCounter + ' files remain to be processed.');
        if (!_.isEmpty(filesToProcess) && filesToProcess.length > 0) {
            logger_1.Logger.info(this.sourceFileCounter + ' files left to evaluate.');
        }
        //all done backing up.
        if (!this.sourceFileCounter) { //exhausted going through all files in src dir
            logger_1.Logger.info('File count is now:' + this.sourceFileCounter);
            //if files to process, then lets queue them up.
            if (!_.isEmpty(filesToProcess) && filesToProcess.length > 0) {
                //now lets just do a sanity check to make sure ALL files were backed up!
                fs.readdir(getDestDir(), function (err, copiedFiles) {
                    logger_1.Logger.info(copiedFiles.length + ' total files exist in the dest directory.');
                    logger_1.Logger.info(_this.sourceFileCount + ' total files exist in the src directory.');
                    //now verify ALL files were copied before proceeding.
                    if (copiedFiles.length === _this.sourceFileCount) {
                        logger_1.Logger.info('ALL files were successfully copied.');
                        _this.queueUpFiles(filesToProcess, imageGroupId);
                    }
                    else {
                        logger_1.Logger.info(copiedFiles.length + ' files were copied out of ' + _this.sourceFileCount + ' files.');
                        _this.emitter.emit(ImagerEvents.DONE);
                    }
                });
            }
            else {
                logger_1.Logger.info('No files to process.');
                this.emitter.emit(ImagerEvents.DONE);
            }
        }
    };
    /**
     * Creates the destination directory if it doesn't already exist. The base directory of this destination directory
     * is conf.destDir. The dest directory will have the same name as the source directory, but have _COPY appended to the end.
     */
    App.prototype.createDestDir = function () {
        return new Promise(function (resolve, reject) {
            try {
                logger_1.Logger.info('Attempting to create destination directory:' + getDestDir());
                fs.mkdirSync(getDestDir());
                logger_1.Logger.info('Successfully created destination directory:' + getDestDir());
                resolve();
            }
            catch (err) {
                if (err.code === 'EEXIST') {
                    logger_1.Logger.warn('Destination directory already exists. ' + getDestDir());
                    resolve();
                }
                else {
                    reject(err);
                }
            }
        });
    };
    App.prototype.persistDestDir = function () {
        logger_1.Logger.info('Attempting to insert into db image group:' + getDestDir());
        return new Promise(function (resolve, reject) {
            mysqlClient.query("insert into image (sourcePath,path,createdBy) " +
                "values(" +
                "'" + srcDir + "'," +
                "'" + getDestDir() + "'," + 4 + //my user id
                ")")
                .then(function (result) {
                logger_1.Logger.info('Successfully created image group for ' + getDestDir());
                logger_1.Logger.debug('After image group persisted, got result:' + JSON.stringify(result));
                resolve({ "imageGroupId": result.insertId });
            }).catch(function (err) {
                reject(err);
            });
        });
    };
    /**
     *
     * Figure out if the dest already exists in the DB.
     */
    App.prototype.queryDestDir = function () {
        logger_1.Logger.info('Fetching the group image ID from the db for ' + getDestDir());
        var imageGroupId;
        var date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        return new Promise(function (resolve, reject) {
            mysqlClient.query("select id from image where groupId is null and path='" + getDestDir() + "'").then(function (data) {
                logger_1.Logger.info('Select query for image group ID returned:' + JSON.stringify(data));
                if (_.isEmpty(data)) {
                    logger_1.Logger.info(getDestDir() + ' image group was not found in the db.');
                    resolve(null);
                }
                else {
                    imageGroupId = data[0].id;
                    logger_1.Logger.info(getDestDir() + ' image group was already found in the db with ID:' + imageGroupId);
                    resolve({ "imageGroupId": imageGroupId });
                }
            }).catch(function (err) {
                reject(err);
            });
        });
    };
    /**
     * Verifies if the file already exists in the image table.
     *
     * @param file
     */
    App.prototype.queryFile = function (file, imageGroupId) {
        return new Promise(function (resolve, reject) {
            logger_1.Logger.debug("Querying db for file:" + file);
            var query = "select * from image i where groupId = " + imageGroupId + " and sourcePath = '" + path.join(srcDir, file) + "'";
            mysqlClient.query(query).then(function (results) {
                if (_.isEmpty(results)) {
                    logger_1.Logger.debug(file + " not found in db.");
                    resolve();
                }
                else {
                    reject(file + " was already found in db.");
                }
            }).catch(function (err) {
                reject(err);
            });
        });
    };
    /**
     *
     * @param file
     */
    App.prototype.copyFile = function (file) {
        var uniqueFilename = uuidv4() + path.extname(file);
        logger_1.Logger.info(file + ' is being renamed to:' + uniqueFilename);
        try {
            fs.copyFileSync(path.join(srcDir, file), path.join(getDestDir(), uniqueFilename));
            logger_1.Logger.info('Successfully backed up file:' + file + ' at ' + path.join(getDestDir(), uniqueFilename));
            var fileData = new fileData_1.FileData();
            fileData.sourcePath = path.join(srcDir, file);
            fileData.path = path.join(getDestDir(), uniqueFilename);
            return fileData;
        }
        catch (e) {
            logger_1.Logger.error('Error backing up file:' + file + ' with error:' + e);
        }
        logger_1.Logger.error('Error backing up file:' + file);
        return null;
    };
    /**
     *
     * @param file
     */
    App.prototype.verifyFileType = function (file) {
        if (this.allowedFileTypes.has(path.extname(file))) {
            return true;
        }
        else {
            logger_1.Logger.warn('Not adding:' + file + ' because it is of the wrong filetype.');
            return false;
        }
    };
    /**
     *
     * @param imageGroupId
     */
    App.prototype.processSourceDest = function (imageGroupId) {
        var _this = this;
        logger_1.Logger.info("Scanning source directory:" + srcDir);
        fs.readdir(srcDir, function (err, files) {
            if (!_.isEmpty(err)) {
                logger_1.Logger.error(err);
                _this.emitter.emit(ImagerEvents.DONE);
                return;
            }
            logger_1.Logger.info(files.length + " total files found in src directory:" + srcDir);
            _this.sourceFileCounter = files.length;
            _this.sourceFileCount = files.length; //total valid files found in the source dir.
            //this array contains files that do not exist already in the db.
            var filesToProcess = new Array();
            if (!_.isEmpty(files)) {
                var _loop_2 = function (file) {
                    if (file) {
                        if (_this.verifyFileType(file)) {
                            _this.queryFile(file, imageGroupId)
                                .then(function () {
                                var fileData = _this.copyFile(file);
                                if (!_.isEmpty(fileData)) {
                                    filesToProcess.push(fileData);
                                    _this.checkIfCopyDone(filesToProcess, imageGroupId);
                                }
                                else {
                                    _this.checkIfCopyDone(filesToProcess, imageGroupId);
                                }
                            })
                                .catch(function (err) {
                                _this.checkIfCopyDone(filesToProcess, imageGroupId);
                            });
                        }
                        else {
                            _this.sourceFileCount--;
                            _this.checkIfCopyDone(filesToProcess, imageGroupId);
                        }
                    }
                };
                for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                    var file = files_1[_i];
                    _loop_2(file);
                }
            }
            else {
                logger_1.Logger.info(srcDir + ' did not contain any files.');
                _this.emitter.emit(ImagerEvents.DONE);
            }
        });
    };
    /**
     * Main app execution point.
     */
    App.prototype.run = function () {
        var _this = this;
        logger_1.Logger.info('--Starting execution--');
        //0         //1        //2   //3
        //node lib/index.js  /foo  /bar
        if (process.argv.length === 4) {
            srcDir = process.argv[2];
            destDir = process.argv[3];
        }
        if (_.isEmpty(srcDir) || _.isEmpty(destDir)) {
            logger_1.Logger.error('Src and Dest directories need to be specified. Please run program in the format: node lib/index.js /src /dest');
            this.emitter.emit(ImagerEvents.DONE);
        }
        else {
            logger_1.Logger.info('Source directory:' + srcDir + ' Destination directory:' + destDir);
        }
        this.createDestDir().then(this.queryDestDir)
            .then(function (queryResult) {
            if (_.isEmpty(queryResult)) {
                _this.persistDestDir()
                    .then(function (insertResult) {
                    _this.processSourceDest(insertResult.imageGroupId);
                }).catch(function (err) {
                    logger_1.Logger.error('Error persisting dest dir:' + err);
                    _this.emitter.emit(ImagerEvents.DONE);
                });
            }
            else {
                _this.processSourceDest(queryResult.imageGroupId);
            }
        })
            .catch(function (err) {
            logger_1.Logger.error('Error querying destination directory:' + err);
            _this.emitter.emit(ImagerEvents.DONE);
        });
    }; //run
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map