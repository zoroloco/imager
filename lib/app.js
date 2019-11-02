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
var gm = require('gm').subClass({ imageMagick: true });
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var mysqlClient = new mysqlClient_1.default();
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
    return path.join(conf_json_1.default.destDir, path.basename(conf_json_1.default.sourceDir) + '_COPY');
}
var App = /** @class */ (function () {
    function App() {
        this.fileCount = 0;
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
     * Verifies if the file already exists in the image table and is of correct file type.
     *
     * @param file
     */
    App.prototype.verifyNewFile = function (file, imageGroupId) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            logger_1.Logger.info("Processing file:" + file);
            //weed out wrong file types
            if (_this.allowedFileTypes.has(path.extname(file))) {
                var query_1 = "select * from image i where groupId = " + imageGroupId + " and path = '" + path.join(getDestDir(), file) + "'";
                logger_1.Logger.debug("Executing verify mysql query:" + query_1);
                mysqlClient.query(query_1).then(function (results) {
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
            }
            else {
                reject('Not adding:' + file + ' because it is of the wrong filetype.');
            }
        });
    };
    /**
     *
     * @param file
     */
    App.prototype.copyFile = function (file) {
        try {
            if (!fs.existsSync(path.join(getDestDir(), file))) {
                fs.copyFileSync(path.join(conf_json_1.default.sourceDir, file), path.join(getDestDir(), file));
                logger_1.Logger.info('Successfully backed up file:' + file);
                return true;
            }
            else {
                logger_1.Logger.info(file + ' has already been backed up.');
                return true;
            }
        }
        catch (e) {
            logger_1.Logger.error('Error backing up file:' + file + ' with error:' + e);
        }
        return false;
    };
    /**
     * Processes a batch of files that have been queued up.
     * This is the callback method called by the queue.
     */
    App.prototype.processQueueTask = function (queueBulk, cb) {
        var completedCount = 0;
        function persistImage(file) {
            logger_1.Logger.info('Persisting image file:' + file + ' to image group ID:' + queueBulk.imageGroupId);
            return new Promise(function (resolve, reject) {
                mysqlClient.query("insert into image (groupId,name,path) " +
                    "values(" + queueBulk.imageGroupId + "," +
                    "'" + file + "'," +
                    "'" + path.join(getDestDir(), file) + "'" +
                    ")")
                    .then(function (result) {
                    logger_1.Logger.info('Successfully persisted image file:' + file + ' with ID:' + result.insertId);
                    resolve();
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        /**
         * Creates a thumbnail file that is better tuned for the web.
         * @param file
         */
        function createThumbnail(file) {
            logger_1.Logger.info('Creating thumbnail for:' + file);
            return new Promise(function (resolve, reject) {
                var thumbnailFileName = path.join(getDestDir(), path.basename(file, path.extname(file)) + '_THUMB' + path.extname(file));
                logger_1.Logger.info('Creating thumbnail:' + thumbnailFileName);
                //call identify to get image height and width properties.
                gm(path.join(getDestDir(), file)).identify(function (err, props) {
                    if (!_.isEmpty(err)) {
                        reject(err);
                    }
                    ;
                    logger_1.Logger.debug('Identify returned:' + JSON.stringify(props));
                    gm(path.join(getDestDir(), file)).thumb(props.size.width / 2, props.size.height / 2, thumbnailFileName, conf_json_1.default.thumbnailSettings.quality, function (err) {
                        if (!_.isEmpty(err)) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            });
        }
        /**
         * Once all images completed, then queue task will be done.
         */
        function updateCompletedCount() {
            completedCount++;
            if (completedCount === queueBulk.fileBulk.length) {
                logger_1.Logger.info("All done creating thumbnails for this bulk queue task.");
                cb(); //executing callback is a trigger that this queue task is now complete.
            }
        }
        //main flow
        if (!_.isEmpty(queueBulk) && !_.isEmpty(queueBulk.fileBulk) && queueBulk.fileBulk.length > 0) {
            logger_1.Logger.info("Processing queue task!");
            var _loop_1 = function (file) {
                logger_1.Logger.info('Processing thumb for:' + file);
                createThumbnail(file)
                    .then(function () {
                    persistImage(file)
                        .then(function () {
                        updateCompletedCount();
                    }).catch((function (err) {
                        logger_1.Logger.error('Error persisting file:' + file + ' with error:' + err);
                    }));
                }).catch(function (err) {
                    logger_1.Logger.error('Error creating thumbnail for file:' + file + ' with error:' + err);
                });
            };
            for (var _i = 0, _a = queueBulk.fileBulk; _i < _a.length; _i++) {
                var file = _a[_i];
                _loop_1(file);
            }
        }
    };
    /**
     * Now that files are backed up and verified, lets process the ones that need attention.
     *
     */
    App.prototype.queueUpFiles = function (filesToProcess, imageGroupId) {
        if (!_.isEmpty(filesToProcess)) {
            logger_1.Logger.info('There will be ' + filesToProcess.length + ' files to process.');
            var fileBulk = new Array();
            var fileCount = 0;
            //traverse ALL files eligible for processing.
            for (var _i = 0, filesToProcess_1 = filesToProcess; _i < filesToProcess_1.length; _i++) {
                var file = filesToProcess_1[_i];
                fileCount++;
                fileBulk.push(file);
                //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
                if (fileCount % conf_json_1.default.fileBulkSize === 0 || fileCount === filesToProcess.length) {
                    logger_1.Logger.info('The files to process has now reached the max bulk size of:' + conf_json_1.default.fileBulkSize + ' or all files exhausted.');
                    logger_1.Logger.info('Adding bulk to the queue for processing.');
                    this.queue.push({ "imageGroupId": imageGroupId, "fileBulk": fileBulk }, function () { });
                    this.queueSize++;
                    fileBulk = new Array(); //reset
                }
            }
        }
    };
    /**
     * check if you are all done copying all your files to backup dir.
     *
     */
    App.prototype.checkIfDone = function (filesToProcess, imageGroupId) {
        var _this = this;
        this.fileCount--;
        if (!_.isEmpty(filesToProcess) && filesToProcess.length > 0) {
            logger_1.Logger.info(this.fileCount + ' files left out of ' + filesToProcess.length);
        }
        //all done backing up.
        if (!this.fileCount) {
            logger_1.Logger.info('File count is now:' + this.fileCount);
            //if files to process, then lets queue them up.
            if (!_.isEmpty(filesToProcess) && filesToProcess.length > 0) {
                //now lets just do a sanity check to make sure ALL files were backed up!
                fs.readdir(getDestDir(), function (err, copiedFiles) {
                    //TODO: filter out thumbs to get an accurate count!
                    //Logger.warn(copiedFiles.length + ' files out of '+filesToProcess.length+' were copied to destination directory.');
                    _this.queueUpFiles(filesToProcess, imageGroupId);
                });
            }
            else {
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
            mysqlClient.query("insert into image (name,path) " +
                "values(" +
                "'" + path.basename(conf_json_1.default.sourceDir) + "'," +
                "'" + getDestDir() + "'" +
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
    App.prototype.queryDestDir = function () {
        logger_1.Logger.info('Fetching the group image ID from the db for ' + getDestDir());
        var imageGroupId;
        var date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        return new Promise(function (resolve, reject) {
            mysqlClient.query("select id from image where groupId is null and path='" + getDestDir() + "'").then(function (data) {
                logger_1.Logger.info('Select query for image group ID returned:' + JSON.stringify(data));
                if (_.isEmpty(data)) {
                    logger_1.Logger.info(conf_json_1.default.destDir + ' image group was not found in the db.');
                    resolve(null);
                }
                else {
                    imageGroupId = data[0].id;
                    logger_1.Logger.info(conf_json_1.default.destDir + ' image group was already found in the db with ID:' + imageGroupId);
                    resolve({ "imageGroupId": imageGroupId });
                }
            }).catch(function (err) {
                reject(err);
            });
        });
    };
    App.prototype.processSourceDest = function (imageGroupId) {
        var _this = this;
        logger_1.Logger.info("Scanning source directory:" + conf_json_1.default.sourceDir);
        fs.readdir(conf_json_1.default.sourceDir, function (err, files) {
            logger_1.Logger.info(files.length + " files found.");
            //this.filesFound = files.length;
            _this.fileCount = files.length;
            var filesToProcess = new Array();
            if (!_.isEmpty(files)) {
                var _loop_2 = function (file) {
                    if (file) {
                        _this.verifyNewFile(file, imageGroupId)
                            .then(function () {
                            if (_this.copyFile(file)) { //blocking
                                filesToProcess.push(file);
                                _this.checkIfDone(filesToProcess, imageGroupId);
                            }
                        }).catch(function (err) {
                            _this.checkIfDone(filesToProcess, imageGroupId);
                        });
                    }
                };
                for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                    var file = files_1[_i];
                    _loop_2(file);
                }
            }
            if (err) {
                logger_1.Logger.error(err);
            }
        });
    };
    /**
     * Main app execution point.
     */
    App.prototype.run = function () {
        var _this = this;
        logger_1.Logger.info('--Starting execution--');
        this.createDestDir().then(this.queryDestDir)
            .then(function (queryResult) {
            if (_.isEmpty(queryResult)) {
                _this.persistDestDir()
                    .then(function (insertResult) {
                    _this.processSourceDest(insertResult.imageGroupId);
                }).catch(function (err) { 'Error persisting dest dir:' + err; });
            }
            else {
                _this.processSourceDest(queryResult.imageGroupId);
            }
        })
            .catch(function (err) {
            logger_1.Logger.error('Error querying destination directory:' + err);
        });
    }; //run
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map