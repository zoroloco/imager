
export class FileData {
    public groupId:string;
    public privacyFlag:number;
    public path:string;
    public thumbPath:string;
    public sourcePath:string;
    public width:number;
    public height:number;
    public format:string;
    public mimeType:string;
    public resolution:string;
    public orientation:string;
    public cameraModel:string;

    constructor(){
        this.groupId = '';
        this.privacyFlag = 0;
        this.path = '';
        this.thumbPath = '';
        this.sourcePath = '';
        this.width = 0;
        this.height = 0;
        this.format = '';
        this.mimeType = '';
        this.resolution = '';
        this.orientation = '';
        this.cameraModel = '';
    }

    toString(){
        return 'sourcePath:'+this.sourcePath+' path:'+this.path+' groupId:'+
            this.groupId+' width:'+this.width+' height:'+this.height+' format:'+this.format+' mimeType:'+
            this.mimeType+' resolution:'+this.resolution+' orientation:'+this.orientation+' cameraModel:'+this.cameraModel+
            ' thumbPath:'+this.thumbPath;
    }
}
