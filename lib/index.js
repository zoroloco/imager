"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var logger_1 = require("./logger");
var conf_json_1 = __importDefault(require("./conf.json"));
var tagUpdater_1 = require("./tagUpdater");
var imageCreator_1 = require("./imageCreator");
process.title = conf_json_1.default.title;
logger_1.Logger.init();
//define process handlers
process.on('SIGTERM', function () {
    logger_1.Logger.info("Got kill signal. Exiting.");
    process.exit();
});
process.on('SIGINT', function () {
    logger_1.Logger.warn("Caught interrupt signal(Ctrl-C)");
    process.exit();
});
process.on('exit', function () {
    logger_1.Logger.info("Process exiting...");
    process.exit();
});
process.on('uncaughtException', function (err) {
    var msg = "Uncaught Exception ";
    if (err.name === 'AssertionError') {
        msg += err.message;
    }
    else {
        msg += err;
    }
    logger_1.Logger.error(msg);
});
//Logger.info('--Starting execution--');
//0         //1
//node lib/index.js  -h
//node lib/index.js  -src /foo  -dest /bar (adds images)
//node lib/index.js  -t (updates tags in db)
var srcDir = '';
var destDir = '';
if (process.argv.length === 6 && process.argv[2] === '-src' && process.argv[4] === '-dest') {
    srcDir = process.argv[3];
    destDir = process.argv[5];
    logger_1.Logger.info("ImageCreator starting");
    new imageCreator_1.ImageCreator(srcDir, destDir);
}
else if (process.argv.length === 3 && process.argv[2] === '-h') {
    logger_1.Logger.info('-- HELP --');
    logger_1.Logger.info('Add images:  node lib/index.js -src /srcDir -dest /destDir');
    logger_1.Logger.info('Update image tags: node lib/index.js -t');
    logger_1.Logger.info('This help menu: node lib/index.js -h');
    process.exit();
}
else if (process.argv.length === 3 && process.argv[2] === '-t') {
    logger_1.Logger.info("TagUpdater starting");
    new tagUpdater_1.TagUpdater();
}
else {
    process.exit();
}
//# sourceMappingURL=index.js.map