
export class FileData {
    public groupId:string;
    public privacyFlag:number;
    public path:string;
    public sourcePath:string;
    public width:number;
    public height:number;
    public format:string;
    public mimeType:string;
    public resolution:string;

    constructor(){
        this.groupId = '';
        this.privacyFlag = 0;
        this.path = '';
        this.sourcePath = '';
        this.width = 0;
        this.height = 0;
        this.format = '';
        this.mimeType = '';
        this.resolution = '';
    }

    toString(){
        return 'sourcePath:'+this.sourcePath+' path:'+this.path;
    }
}
