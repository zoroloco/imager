import * as _ from 'underscore';
import {Logger} from './logger';
import conf from './conf.json';
import Queue from 'better-queue';
const EventEmitter = require('events').EventEmitter;
const path = require('path');
import MySqlClient from './mysqlClient';
import ElasticClient from './elasticClient';
import {ImagerEvents} from './imagerEvents';
import Image from "./image";
import {query} from "winston";

const mysqlClient: MySqlClient = new MySqlClient();
const elasticClient: ElasticClient = new ElasticClient();
let tagsProcessed:number = 0;
let tagBulkSize:number = 10;

export class TagUpdater {
    private emitter: any;
    private queue: Queue;
    private queueSize: number = 0;

    constructor(){
        this.emitter = new EventEmitter();
        this.queue = new Queue(this.processQueueTask, conf.queueSettings);
        this.start();
    }

    start(){
        Logger.info('UPDATING TAGS');

        this.queryImageCount().then((imageCount)=>{
            let fromIndex:number = 0;

            this.queryTagsFromIndex(0);

        }).catch((err)=>{
            Logger.error(err);
            this.emitter.emit(ImagerEvents.DONE);
        });
    }

    async queryTagsFromIndex(fromIndex:number) {
        //Logger.info('Tags processed:'+tagsProcessed+' out of:'+imageCount+' fromIndex:'+fromIndex+' of size:'+size);
        return await this.queryTags(fromIndex, tagBulkSize);

    }

    /**
     * This method will process a queue task.
     *
     * @param queueBulk
     * @param cb
     */
    processQueueTask(queueBulk:any, cb:any){

    }

    queueUpFiles(){

        let tagBulk: Array<string> = new Array<string>();
        let tagCount:number = 0;

        //traverse ALL files eligible for processing.
        /*
        for(let image of filesToProcess){
            fileCount++;
            fileBulk.push(image);

            //if our bulk array is fat enough for fileBulkSize or if we have exhausted all files to process.
            if(fileCount % conf.fileBulkSize === 0 || fileCount === filesToProcess.length){
                Logger.info('The files to process has now reached the max bulk size of:'+conf.fileBulkSize+' or all files exhausted.');
                Logger.info('Adding bulk to the queue for processing.');
                this.queue.push({"imageGroupId":imageGroupId, "fileBulk":fileBulk},function(){});
                this.queueSize++;
                fileBulk = new Array<Image>();//reset
            }
        }
         */
    }

    queryImageCount(): Promise<any>{
        Logger.info('Querying elastic for a count of all images.');
        return new Promise((resolve,reject)=> {

            elasticClient.count().then((result)=>{
                Logger.info('Elastic query for image count returned '+result.body.count);
                resolve(result.body.count);
            }).catch((err)=>{Logger.error('Error querying elastic for image count with err:'+JSON.stringify(err))});

        });
    }

    /**
     *
     * @param fromIndex
     * @param size
     */
    queryTags(fromIndex:number,size:number): Promise<any>{
        Logger.info('Querying elastic for all tags from index:'+fromIndex+' with size:'+size);

        return new Promise((resolve,reject)=> {

            let searchParams = {
                "_source": {
                    "includes": [ "tags" ]
                }
            };

            elasticClient.search(fromIndex,size,searchParams).then((result)=>{
                Logger.info('Elastic query for tags returned '+JSON.stringify(result.body.hits.hits.length)+' result(s).');
                if(result.body.hits.hits.length<=0){
                    reject('No tags were found in elastic.');
                }
                else{
                    resolve(result.body.hits.hits);
                }
            }).catch((err)=>{Logger.error('Error querying elastic for tags with err:'+JSON.stringify(err))});

        });
    }
}
