import conf from './conf.json';
import {Logger} from './logger';
import mysql = require('mysql');

/**
 * Provides CRUD to/from a MySQL server database.
 */

export default class MySqlClient{

    private connection: any;

    constructor(){
        this.connection = mysql.createConnection(conf.mysql);

        this.connection.connect((err:any) => {
            if (err) {
                Logger.error('Error connecting to '+conf.mysql.host);
                console.error(`${err.stack}`);
                return;
            }

            Logger.info('Connected to MYSQL db:' + conf.mysql.host + ' as id '+this.connection.threadId);
        });
    }

    shutdown(){
        this.connection.end((err:any) => {
            if (err) {
                Logger.error('Error disconnecting from '+conf.mysql.host);
                console.error(`${err.stack}`);
                return;
            }

            Logger.info('Database connection terminated successfully.');
        });
    }

    query(queryStr:string): Promise<any>{
        Logger.debug('Executing query:'+queryStr);
        return new Promise((resolve,reject)=>{
            this.connection.query({sql: queryStr, timeout: 60000}, (err:any, rows: any) => {
                if (err && err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                    Logger.error('Query timed out:'+queryStr);
                    console.error(`${err.stack}`);
                    reject(err);
                }

                if (err) {
                    Logger.error('Query error.');
                    console.error(`${err.stack}`);
                    reject(err);
                }

                Logger.debug('Successfully retrieved: '+rows.length+' rows.');
                resolve(rows);
            });
        });
    }

}
