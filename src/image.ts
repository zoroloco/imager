const path = require('path');

export default class Image {
  public groupId: string = '';
  public groupName : string = '';
  public title : string = '';
  public description : string = '';
  public format : string = '';
  public mimeType : string = '';
  public resolution : string = '';
  public width  : string = '';
  public height : string = '';
  public orientation : string = '';
  public cameraModel : string = '';
  public path : string = '';
  public fileName : string = '';
  public thumbFileName : string = '';
  public sourcePath : string = '';
  public sourceName : string = '';
  public createdBy : string = '';
  public createdTime : string = '';
  public deactivationTime : string = '';
  public dateImageTaken : string = '';
  public dateImageCreated : string = '';

  public tags : Array<string> = new Array<string>();

  toString(){
    return this.fileName;
  }

  getAbsolutePath(){
    return path.join(this.path,this.fileName);
  }

  getAbsoluteThumbPath(){
    return path.join(this.path,this.thumbFileName);
  }

  getAbsoluteSourcePath(){
    return path.join(this.sourcePath,this.sourceName);
  }
}



