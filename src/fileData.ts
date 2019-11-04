
export class FileData {
    public groupId:string;
    public privacyFlag:number;
    public path:string;
    public sourcePath:string;

    constructor(){
        this.groupId = '';
        this.privacyFlag = 0;
        this.path = '';
        this.sourcePath = '';
    }

    toString(){
        return 'sourcePath:'+this.sourcePath+' path:'+this.path;
    }
}
