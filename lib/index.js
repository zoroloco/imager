"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var app_1 = require("./app");
var logger_1 = require("./logger");
var conf_json_1 = __importDefault(require("./conf.json"));
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
//Start
new app_1.App().run();
//# sourceMappingURL=index.js.map