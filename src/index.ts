import {Logger} from './logger';
import conf from './conf.json';
import {TagUpdater} from "./tagUpdater";
import {ImageCreator} from "./imageCreator";

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

//Logger.info('--Starting execution--');
//0         //1
//node lib/index.js  -h
//node lib/index.js  -src /foo  -dest /bar (adds images)
//node lib/index.js  -t (updates tags in db)
let srcDir:string = '';
let destDir:string = '';

if(process.argv.length === 6 && process.argv[2] === '-src' && process.argv[4] === '-dest'){
    srcDir = process.argv[3];
    destDir = process.argv[5];
    Logger.info("ImageCreator starting");
    new ImageCreator(srcDir,destDir);
}
else if(process.argv.length === 3 && process.argv[2] === '-h'){
    Logger.info('-- HELP --');
    Logger.info('Add images:  node lib/index.js -src /srcDir -dest /destDir');
    Logger.info('Update image tags: node lib/index.js -t');
    Logger.info('This help menu: node lib/index.js -h');
    process.exit();
}
else if(process.argv.length ===3 && process.argv[2] === '-t'){
    Logger.info("TagUpdater starting");
    new TagUpdater();
}
else{
    process.exit();
}
