import * as _ from 'underscore';
import {Logger} from './logger';
import conf from './conf.json';
import MySqlClient from './mysqlClient';
const fs = require('fs');
const path = require('path');

/**
 * Traverses conf.rootDir files and for each filename not found in the database,
 * it will backup the file in conf.rootDir_BAK and then create a thumbnail of the file
 * and then save the file meta-data to the db.
 */

export class App {

    private mysqlClient: MySqlClient;

    constructor(){
        this.mysqlClient = new MySqlClient();

    }

    processFile(file:string): Promise<any>{
        return new Promise((resolve,reject)=>{
            //Logger.info("Processing file:"+file);
            let query = "select * from image i where groupId = (select id from image where path='/"+path.basename(conf.rootDir)+ "') and path = '/"+file+"'";
            //Logger.info("Executing mysql query:"+query);

            this.mysqlClient.query(query).then(results=>{
                resolve(results);
            }).catch(err=>{
                Logger.error('Error searching for file:'+file);
                reject(err);
            });
        });
    }

    /**
     * Creates a dir called rootDir_BAK if it does not already exist. Will save a copy
     * of this original file in the BAK directory. This is done because the creation of
     * the thumbnails will deteriorate the original file.
     *
     * @param file
     */
    backupFile(file:string): Promise<any>{
        return new Promise((resolve,reject)=>{

        });
    }

    /**
     * Makes a shell call to imagemagick to create a thumbnail file that is better tuned for the web.
     * @param file
     */
    createThumbnails(file:string): Promise<any>{
        return new Promise((resolve,reject)=>{

        });
    }

    /**
     * Saves the file meta-data to the database so subsequent runs of this rootDir won't
     * work on the same files again.
     *
     * @param file
     */
    saveFile(file:string): Promise<any>{
        return new Promise((resolve,reject)=>{

        });
    }

    /**
     * Main app execution point.
     */
    run(){
        Logger.info('--Starting execution--');

        Logger.info("Scanning directory:"+conf.rootDir);
        fs.readdir(conf.rootDir, (err :any, files :Array<string>)=>{
            Logger.info(files.length+" files found.");
            if(!_.isEmpty(files)){
                for(let file of files){
                    if(file){
                        this.processFile(file)
                            .then((results)=>{
                                if(!_.isEmpty(results)){
                                    Logger.info(file+" found in db.");
                                }
                                else{
                                    Logger.info(file+" not found in db.");
                                    this.backupFile(file)
                                        .then(()=>{
                                            this.createThumbnails(file)
                                                .then(()=>{
                                                    this.saveFile(file)
                                                        .then(()=>{

                                                        })
                                                })
                                        })
                                }
                            });
                    }
                }
            }

            if(err){
                Logger.error(err);
            }
        });

        //process.exit();
    }//run
}
