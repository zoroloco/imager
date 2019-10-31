"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var conf_json_1 = __importDefault(require("./conf.json"));
var logger_1 = require("./logger");
var mysql = require("mysql");
/**
 * Provides CRUD to/from a MySQL server database.
 */
var MySqlClient = /** @class */ (function () {
    function MySqlClient() {
        var _this = this;
        this.connection = mysql.createConnection(conf_json_1.default.mysql);
        this.connection.connect(function (err) {
            if (err) {
                logger_1.Logger.error('Error connecting to ' + conf_json_1.default.mysql.host);
                console.error("" + err.stack);
                return;
            }
            logger_1.Logger.info('Connected to ' + conf_json_1.default.mysql.host + ' as id ' + _this.connection.threadId);
        });
    }
    MySqlClient.prototype.shutdown = function () {
        this.connection.end(function (err) {
            if (err) {
                logger_1.Logger.error('Error disconnecting from ' + conf_json_1.default.mysql.host);
                console.error("" + err.stack);
                return;
            }
            logger_1.Logger.info('Database connection terminated successfully.');
        });
    };
    MySqlClient.prototype.query = function (queryStr) {
        var _this = this;
        logger_1.Logger.debug('Executing select query:' + queryStr);
        return new Promise(function (resolve, reject) {
            _this.connection.query({ sql: queryStr, timeout: 60000 }, function (err, rows) {
                if (err && err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                    logger_1.Logger.error('Query timed out:' + queryStr);
                    console.error("" + err.stack);
                    reject(err);
                }
                if (err) {
                    logger_1.Logger.error('Query error.');
                    console.error("" + err.stack);
                    reject(err);
                }
                //Logger.info('Successfully retrieved: '+rows.length+' rows.');
                resolve(rows);
            });
        });
    };
    return MySqlClient;
}());
exports.default = MySqlClient;
//# sourceMappingURL=mysqlClient.js.map