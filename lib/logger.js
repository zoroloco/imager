"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * A custom console and file logger.
 */
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var _ = __importStar(require("underscore"));
var conf_json_1 = __importDefault(require("./conf.json"));
var winston_1 = __importDefault(require("winston"));
//
// Logging levels
//
var config = {
    levels: {
        error: 0,
        debug: 1,
        warn: 2,
        data: 3,
        info: 4,
        verbose: 5
    },
    colors: {
        error: 'red',
        debug: 'blue',
        warn: 'yellow',
        data: 'grey',
        info: 'green',
        verbose: 'cyan'
    }
};
winston_1.default.addColors(config.colors);
var consoleLogger = winston_1.default.createLogger({
    levels: config.levels,
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple(), winston_1.default.format.timestamp({ format: 'YY-MM-DD HH:MM:SS' }), winston_1.default.format.printf(function (info) { return info.timestamp + " : " + info.level + " : " + info.message; })),
    transports: [
        new winston_1.default.transports.Console({ handleExceptions: true })
    ],
    level: 'verbose'
});
var fileLogger = null;
var Logger = /** @class */ (function () {
    function Logger() {
        this.fileLogger = null;
    }
    Logger.init = function () {
        if (conf_json_1.default.logger.fileEnabled) {
            if (!_.isEmpty(conf_json_1.default.logger.dir)) {
                //create the log dir if it does not already exist.
                try {
                    Logger.debug('Creating log directory:' + conf_json_1.default.logger.dir);
                    fs_1.default.mkdirSync(conf_json_1.default.logger.dir);
                }
                catch (e) {
                    if (e.code === 'EEXIST') {
                        Logger.debug('Log directory already exists. ' + conf_json_1.default.logger.dir);
                    }
                }
                var dateStamp = new Date();
                fileLogger = winston_1.default.createLogger({
                    levels: config.levels,
                    format: winston_1.default.format.combine(winston_1.default.format.simple(), winston_1.default.format.timestamp({ format: 'YY-MM-DD HH:MM:SS' }), winston_1.default.format.printf(function (info) { return info.timestamp + " : " + info.level + " : " + info.message; })),
                    transports: [
                        new winston_1.default.transports.File({
                            filename: path_1.default.join(conf_json_1.default.logger.dir, conf_json_1.default.title + '-' + dateStamp.getDate() + '-' + dateStamp.getMonth() + '-' + dateStamp.getFullYear() + '.log'),
                            maxFiles: 256,
                            maxsize: 4194304,
                            handleExceptions: true
                        })
                    ],
                    level: 'verbose'
                });
                Logger.debug('Log files will be located in:' + conf_json_1.default.logger.dir);
            }
        }
    };
    Logger.debug = function (msg) {
        if (conf_json_1.default.logger.debug === true) {
            consoleLogger.debug(msg);
            if (conf_json_1.default.logger.fileEnabled) {
                fileLogger.debug(msg);
            }
        }
    };
    Logger.info = function (msg) {
        if (conf_json_1.default.logger.info === true) {
            consoleLogger.info(msg);
            if (conf_json_1.default.logger.fileEnabled) {
                fileLogger.info(msg);
            }
        }
    };
    Logger.warn = function (msg) {
        if (conf_json_1.default.logger.warn === true) {
            consoleLogger.warn(msg);
            if (conf_json_1.default.logger.fileEnabled) {
                fileLogger.warn(msg);
            }
        }
    };
    Logger.error = function (msg) {
        if (conf_json_1.default.logger.error === true) {
            consoleLogger.error(msg);
            if (conf_json_1.default.logger.fileEnabled) {
                fileLogger.error(msg);
            }
        }
    };
    return Logger;
}());
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map