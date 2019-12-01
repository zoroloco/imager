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
var image_1 = __importDefault(require("./image"));
var conf_json_1 = __importDefault(require("./conf.json"));
var mysqlClient_1 = __importDefault(require("./mysqlClient"));
var elasticClient_1 = __importDefault(require("./elasticClient"));
var better_queue_1 = __importDefault(require("better-queue"));
var gm = require('gm').subClass({ imageMagick: true });
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var uuidv4 = require('uuid/v4');
var mysqlClient = new mysqlClient_1.default();
var elasticClient = new elasticClient_1.default();
var srcDir = '';
var destDir = '';
/**

 The text images below explain the different EXIF orientations.

 1        2       3      4         5            6           7          8

 888888  888888      88  88      8888888888  88                  88  8888888888
 88          88      88  88      88  88      88  88          88  88      88  88
 8888      8888    8888  8888    88          8888888888  8888888888          88
 88          88      88  88
 88          88  888888  888888

 */
var ExifOrientation;
(function (ExifOrientation) {
    ExifOrientation[ExifOrientation["TOP_LEFT"] = 1] = "TOP_LEFT";
    ExifOrientation[ExifOrientation["TOP_RIGHT"] = 2] = "TOP_RIGHT";
    ExifOrientation[ExifOrientation["BOTTOM_RIGHT"] = 3] = "BOTTOM_RIGHT";
    ExifOrientation[ExifOrientation["BOTTOM_LEFT"] = 4] = "BOTTOM_LEFT";
    ExifOrientation[ExifOrientation["LEFT_TOP"] = 5] = "LEFT_TOP";
    ExifOrientation[ExifOrientation["RIGHT_TOP"] = 6] = "RIGHT_TOP";
    ExifOrientation[ExifOrientation["RIGHT_BOTTOM"] = 7] = "RIGHT_BOTTOM";
    ExifOrientation[ExifOrientation["LEFT_BOTTOM"] = 8] = "LEFT_BOTTOM";
})(ExifOrientation = exports.ExifOrientation || (exports.ExifOrientation = {}));
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
        /**
         *
         * @param image
         */
        function persistImage(image) {
            logger_1.Logger.info('Posting image file to elastic index:' + image.toString() + ' to image group ID:' + queueBulk.imageGroupId);
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
        function autoOrientThumb(image) {
            logger_1.Logger.info('Attempting to auto-orient file:' + image.getAbsoluteThumbPath() + ' with orientation value of:' + image.orientation);
            return new Promise(function (resolve, reject) {
                if (!_.isEmpty(image.orientation)) {
                    logger_1.Logger.info('Orientation found of:' + image.orientation);
                    if (image.orientation === ExifOrientation.TOP_LEFT + '') {
                        logger_1.Logger.info('Orientation is left top normal. No need to auto orient.');
                        resolve(image);
                    }
                    else {
                        logger_1.Logger.info('Orientation of:' + image.orientation + ' found. There is a need to auto orient.');
                        var rotationAngle = 0;
                        switch (image.orientation) {
                            case ExifOrientation.BOTTOM_RIGHT + '':
                                rotationAngle = 180;
                                break;
                            case ExifOrientation.RIGHT_TOP + '':
                                rotationAngle = 90;
                                break;
                            default:
                                break;
                        }
                        if (rotationAngle > 0) {
                            logger_1.Logger.info('Attempting to flip thumb image ' + rotationAngle + ' degrees.');
                            gm(image.getAbsoluteThumbPath()).rotate('white', rotationAngle)
                                .write(image.getAbsoluteThumbPath(), function (err) {
                                if (!_.isEmpty(err)) {
                                    reject(err);
                                }
                                else {
                                    resolve(image);
                                }
                            });
                        }
                        else {
                            resolve(image);
                        }
                    }
                }
                else {
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
        function createThumbnail(image) {
            logger_1.Logger.info('Creating thumbnail for:' + image.getAbsolutePath());
            return new Promise(function (resolve, reject) {
                image.thumbFileName = path.basename(image.fileName, path.extname(image.fileName)) + '_THUMB' + path.extname(image.fileName);
                logger_1.Logger.debug('Thumbnail filename = ' + image.thumbFileName + ' image filename=' + image.fileName + ' image path=' + image.path);
                var thumbPath = path.join(path.dirname(image.path, image.thumbFileName));
                logger_1.Logger.info('Creating thumbnail:' + thumbPath);
                //call identify to get image height and width properties.
                gm(image.getAbsolutePath()).identify(function (err, props) {
                    if (!_.isEmpty(err)) {
                        reject(err);
                    }
                    ;
                    logger_1.Logger.debug('Identify returned:' + JSON.stringify(props));
                    if (!_.isEmpty(props)) {
                        if (props.hasOwnProperty('format'))
                            image.format = props.format;
                        if (props.hasOwnProperty('Mime type'))
                            image.mimeType = props["Mime type"];
                        if (props.hasOwnProperty("Resolution"))
                            image.resolution = props.Resolution;
                        if (props.hasOwnProperty('Properties')) {
                            image.orientation = props.Properties['exif:Orientation'];
                            image.cameraModel = props.Properties['exif:Model'];
                            image.dateImageTaken = props.Properties['date:modify'];
                            image.dateImageCreated = props.Properties['date:create'];
                        }
                        if (props.hasOwnProperty('size')) {
                            image.height = props.size.height;
                            image.width = props.size.width;
                            gm(image.getAbsolutePath()).thumb(props.size.width / 2, props.size.height / 2, image.getAbsoluteThumbPath(), conf_json_1.default.thumbnailSettings.quality, function (err) {
                                if (!_.isEmpty(err)) {
                                    reject(err);
                                }
                                else {
                                    resolve(image);
                                }
                            });
                        }
                        else {
                            reject('File:' + image.getAbsoluteThumbPath() + ' did not contain valid EXIF data and a thumbnail could not be created.');
                        }
                    }
                    else {
                        reject('File:' + image.getAbsoluteThumbPath() + ' did not contain valid EXIF data and a thumbnail could not be created.');
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
            for (var _i = 0, _a = queueBulk.fileBulk; _i < _a.length; _i++) {
                var image = _a[_i];
                logger_1.Logger.debug('Processing thumb for:' + image.toString());
                createThumbnail(image).then(autoOrientThumb).then(persistImage).then(updateCompletedCount)
                    .catch(function (err) { logger_1.Logger.error(err); });
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
            var image = filesToProcess_1[_i];
            fileCount++;
            fileBulk.push(image);
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
            mysqlClient.query("insert into imageGroup (sourcePath,path,createdBy) " +
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
            mysqlClient.query("select id from imageGroup where path='" + getDestDir() + "' and sourcePath='" + srcDir + "' and deactivationTime is null").then(function (data) {
                logger_1.Logger.info('Select query for image group returned:' + JSON.stringify(data));
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
        var fileName = path.basename(file, path.extname(file));
        logger_1.Logger.debug("Querying elastic for image:" + fileName + ' with groupId:' + imageGroupId);
        return new Promise(function (resolve, reject) {
            var searchParams = {
                "query": {
                    "bool": {
                        "filter": [
                            { "match": { "groupId": imageGroupId } },
                            { "match": { "sourceName": fileName } }
                        ]
                    }
                }
            };
            elasticClient.search(0, 100, searchParams).then(function (result) {
                logger_1.Logger.info('Elastic query for image:' + fileName + ' returned ' + JSON.stringify(result.body.hits.hits.length) + ' result(s).');
                if (result.body.hits.hits.length <= 0) {
                    logger_1.Logger.info('Image filename:' + fileName + ' was NOT found in elastic.');
                    resolve();
                }
                else {
                    reject('Image filename:' + fileName + ' already found in elastic.');
                }
            }).catch(function (err) { logger_1.Logger.error('Error querying elastic for existing image with err:' + JSON.stringify(err)); });
        });
    };
    /**
     *
     * @param file
     */
    App.prototype.copyFile = function (file, imageGroupId) {
        var uniqueFilename = uuidv4() + path.extname(file);
        logger_1.Logger.info(file + ' is being renamed to:' + uniqueFilename);
        try {
            fs.copyFileSync(path.join(srcDir, file), path.join(getDestDir(), uniqueFilename));
            logger_1.Logger.info('Successfully backed up file:' + file + ' at ' + path.join(getDestDir(), uniqueFilename));
            var image = new image_1.default();
            image.sourcePath = srcDir;
            image.sourceName = file;
            image.path = getDestDir();
            image.fileName = uniqueFilename;
            image.groupName = path.basename(srcDir);
            image.groupId = imageGroupId + '';
            image.createdTime = new Date().toDateString();
            image.createdBy = "4";
            image.tags.push('khc'); //add the universal tag.
            return image;
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
                var _loop_1 = function (file) {
                    if (file) {
                        if (_this.verifyFileType(file)) {
                            _this.queryFile(file, imageGroupId)
                                .then(function () {
                                var image = _this.copyFile(file, imageGroupId);
                                if (!_.isEmpty(image)) {
                                    filesToProcess.push(image);
                                    _this.checkIfCopyDone(filesToProcess, imageGroupId);
                                }
                                else {
                                    _this.checkIfCopyDone(filesToProcess, imageGroupId);
                                }
                            })
                                .catch(function (err) {
                                _this.checkIfCopyDone(filesToProcess, imageGroupId);
                            }).catch(function (err) { logger_1.Logger.error(err); });
                        }
                        else {
                            _this.sourceFileCount--;
                            _this.checkIfCopyDone(filesToProcess, imageGroupId);
                        }
                    }
                };
                for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                    var file = files_1[_i];
                    _loop_1(file);
                }
            }
            else {
                logger_1.Logger.info(srcDir + ' did not contain any files.');
                _this.emitter.emit(ImagerEvents.DONE);
            }
        });
    };
    App.prototype.queryImageCount = function () {
        logger_1.Logger.info('Querying elastic for a count of all images.');
        return new Promise(function (resolve, reject) {
            elasticClient.count().then(function (result) {
                logger_1.Logger.info('Elastic query for image count returned ' + JSON.stringify(result));
                resolve(result.count);
            }).catch(function (err) { logger_1.Logger.error('Error querying elastic for image count with err:' + JSON.stringify(err)); });
        });
    };
    App.prototype.queryTags = function (count) {
        logger_1.Logger.info("Querying elastic for all tags with count:" + count);
        return new Promise(function (resolve, reject) {
            var searchParams = {
                "_source": {
                    "includes": ["tags"]
                }
            };
            elasticClient.search(0, 100, searchParams).then(function (result) {
                logger_1.Logger.info('Elastic query for tags returned ' + JSON.stringify(result.body.hits.hits.length) + ' result(s).');
                if (result.body.hits.hits.length <= 0) {
                    reject('No tags were found in elastic.');
                }
                else {
                    resolve(result.body.hits.hits);
                }
            }).catch(function (err) { logger_1.Logger.error('Error querying elastic for tags with err:' + JSON.stringify(err)); });
        });
    };
    /**
     * start the main flow of adding images to elastic.
     */
    App.prototype.processAddImages = function () {
        var _this = this;
        logger_1.Logger.info('ADDING IMAGES - Source directory:' + srcDir + ' Destination directory:' + destDir);
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
    };
    /**
     * start main flow of updating tags to mysql from elastic
     */
    App.prototype.processUpdateTags = function () {
        var _this = this;
        logger_1.Logger.info('UPDATING TAGS');
        this.queryImageCount().then(this.queryTags)
            .then(function (hits) {
            if (hits) {
                //Logger.info('HITS:'+JSON.stringify(hits));
            }
        }).catch(function (err) {
            logger_1.Logger.error(err);
            _this.emitter.emit(ImagerEvents.DONE);
        });
    };
    /**
     * Main app execution point.
     */
    App.prototype.run = function () {
        //Logger.info('--Starting execution--');
        //0         //1
        //node lib/index.js  -h
        //node lib/index.js  -src /foo  -dest /bar (adds images)
        //node lib/index.js  -t (updates tags in db)
        var updateTags = false;
        var addImages = false;
        if (process.argv.length === 6 && process.argv[2] === '-src' && process.argv[4] === '-dest') {
            srcDir = process.argv[3];
            destDir = process.argv[5];
            addImages = true;
        }
        else if (process.argv.length === 3 && process.argv[2] === '-h') {
            logger_1.Logger.info('-- HELP --');
            logger_1.Logger.info('Add images:  node lib/index.js -src /srcDir -dest /destDir');
            logger_1.Logger.info('Update image tags: node lib/index.js -t');
            logger_1.Logger.info('This help menu: node lib/index.js -h');
            this.emitter.emit(ImagerEvents.DONE);
        }
        else if (process.argv.length === 3 && process.argv[2] === '-t') {
            updateTags = true;
        }
        else {
            this.emitter.emit(ImagerEvents.DONE);
        }
        if (addImages) {
            this.processAddImages();
        }
        else if (updateTags) {
            this.processUpdateTags();
        }
    }; //run
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map