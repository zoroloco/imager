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
var fs = require('fs');
var path = require('path');
var App = /** @class */ (function () {
    function App() {
        this.mysqlClient = new mysqlClient_1.default();
    }
    App.prototype.processFile = function (file) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            //Logger.info("Processing file:"+file);
            var query = "select * from image i where groupId = (select id from image where path='/" + path.basename(conf_json_1.default.rootDir) + "') and path = '/" + file + "'";
            //Logger.info("Executing mysql query:"+query);
            _this.mysqlClient.query(query).then(function (results) {
                resolve(results);
            }).catch(function (err) {
                logger_1.Logger.error('Error searching for file:' + file);
                reject(err);
            });
        });
    };
    /**
     * Main app execution point.
     */
    App.prototype.run = function () {
        var _this = this;
        logger_1.Logger.info('--Starting execution--');
        logger_1.Logger.info("Scanning directory:" + conf_json_1.default.rootDir);
        fs.readdir(conf_json_1.default.rootDir, function (err, files) {
            logger_1.Logger.info(files.length + " files found.");
            if (!_.isEmpty(files)) {
                var _loop_1 = function (file) {
                    if (file) {
                        _this.processFile(file)
                            .then(function (results) {
                            if (results && !_.isEmpty(results)) {
                                logger_1.Logger.info(file + " found in db.");
                            }
                            else {
                                logger_1.Logger.info(file + " not found in db.");
                            }
                        });
                    }
                };
                for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                    var file = files_1[_i];
                    _loop_1(file);
                }
            }
            if (err) {
                logger_1.Logger.error(err);
            }
        });
        //process.exit();
    }; //run
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map