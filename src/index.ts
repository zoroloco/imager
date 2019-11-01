import { App } from "./app";
import {Logger} from './logger';
import conf from './conf.json';

process.title = conf.title;
Logger.init();

//define process handlers
process.on('SIGTERM', function() {
    Logger.info("Got kill signal. Exiting.");
    process.exit();
});

process.on('SIGINT', function() {
    Logger.warn("Caught interrupt signal(Ctrl-C)");
    process.exit();
});

process.on('exit', function(){
    Logger.info("Process exiting...");
    process.exit();
})

process.on('uncaughtException', function (err) {
    var msg="Uncaught Exception ";
    if( err.name === 'AssertionError' ) {
        msg += err.message;
    } else {
        msg += err;
    }

    Logger.error(msg);
});

//Start
new App().run();
