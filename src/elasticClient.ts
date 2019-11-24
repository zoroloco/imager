import conf from './conf.json';
import {Logger} from './logger';
import * as _ from 'underscore';
import Image from "./image";

const { Client } = require('@elastic/elasticsearch')

export default class ElasticClient{
    private client = new Client(conf.elastic);

    async indexImage(image: Image) {
        await this.client.index({
            index: conf.elastic.index,
            body: image
        })
    }

    async search(from:number,size:number,searchParams:any){
        const result = await this.client.search({
            index: conf.elastic.index,
            from: from,
            size: size,
            body: searchParams
        }, {
            ignore: [404],
            maxRetries: 3
        });
        return result;
    }
}
