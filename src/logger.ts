/**
 * A custom console and file logger.
 */
import pathUtil from 'path';
import fs from 'fs';
import * as _ from 'underscore';

import conf from './conf.json';
import winston from 'winston';
import { levels } from 'logform';

//
// Logging levels
//
const config = {
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

winston.addColors(config.colors);

const consoleLogger = winston.createLogger({
    levels: config.levels,
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.timestamp({format:'YY-MM-DD HH:MM:SS'}),
        winston.format.printf(
            info => `${info.timestamp} : ${info.level} : ${info.message}`
        )
    ),
    transports: [
        new winston.transports.Console({handleExceptions: true})
    ],
    level: 'verbose'
});

let fileLogger:any = null;

export class Logger{
    private fileLogger:any;

    constructor(){
        this.fileLogger = null;
    }

    static init(){
        if(conf.logger.fileEnabled){
            if(!_.isEmpty(conf.logger.dir)){
                //create the log dir if it does not already exist.
                try {
                    Logger.debug('Creating log directory:'+conf.logger.dir);
                    fs.mkdirSync(conf.logger.dir);
                }
                catch(e) {
                    if ( e.code === 'EEXIST'){
                        Logger.debug('Log directory already exists. '+conf.logger.dir);
                    }
                }

                let dateStamp = new Date();

                fileLogger = winston.createLogger({
                    levels: config.levels,
                    format: winston.format.combine(
                        winston.format.simple(),
                        winston.format.timestamp({format:'YY-MM-DD HH:MM:SS'}),
                        winston.format.printf(
                            info => `${info.timestamp} : ${info.level} : ${info.message}`
                        )
                    ),
                    transports: [
                        new winston.transports.File({
                            filename: pathUtil.join(conf.logger.dir,conf.title+'-'+dateStamp.getDate()+'-'+dateStamp.getMonth()+'-'+dateStamp.getFullYear()+'.log'),
                            maxFiles: 256,
                            maxsize:4194304,
                            handleExceptions: true})
                    ],
                    level: 'verbose'
                });

                Logger.debug('Log files will be located in:'+conf.logger.dir);
            }
        }
    }

    static debug(msg:string){
        if(conf.logger.debug===true){
            consoleLogger.debug(msg);
            if(conf.logger.fileEnabled){
                fileLogger.debug(msg);
            }
        }
    }

    static info(msg:string){
        if(conf.logger.info===true){
            consoleLogger.info(msg);
            if(conf.logger.fileEnabled){
                fileLogger.info(msg);
            }
        }
    }

    static warn(msg:string){
        if(conf.logger.warn===true){
            consoleLogger.warn(msg);
            if(conf.logger.fileEnabled){
                fileLogger.warn(msg);
            }
        }
    }

    static error(msg:string){
        if(conf.logger.error===true){
            consoleLogger.error(msg);
            if(conf.logger.fileEnabled){
                fileLogger.error(msg);
            }
        }
    }
}
