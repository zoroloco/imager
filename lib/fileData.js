"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var FileData = /** @class */ (function () {
    function FileData() {
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
    FileData.prototype.toString = function () {
        return 'sourcePath:' + this.sourcePath + ' path:' + this.path + ' groupId:' +
            this.groupId + ' width:' + this.width + ' height:' + this.height + ' format:' + this.format + ' mimeType:' +
            this.mimeType + ' resolution:' + this.resolution + ' orientation:' + this.orientation + ' cameraModel:' + this.cameraModel +
            ' thumbPath:' + this.thumbPath;
    };
    return FileData;
}());
exports.FileData = FileData;
//# sourceMappingURL=fileData.js.map