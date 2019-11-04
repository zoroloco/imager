"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var FileData = /** @class */ (function () {
    function FileData() {
        this.groupId = '';
        this.privacyFlag = 0;
        this.path = '';
        this.sourcePath = '';
    }
    FileData.prototype.toString = function () {
        return 'sourcePath:' + this.sourcePath + ' path:' + this.path;
    };
    return FileData;
}());
exports.FileData = FileData;
//# sourceMappingURL=fileData.js.map