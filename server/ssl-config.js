var path = require('path'),
    fs = require("fs");

exports.privateKey = fs.readFileSync(path.join(__dirname, './private/theblockchainu-cert.key')).toString();
exports.certificate = fs.readFileSync(path.join(__dirname, './private/theblockchainu-cert.crt')).toString();