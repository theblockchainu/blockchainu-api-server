var CONTAINERS_URL = '/api/containers/';
var fs = require('fs');
const path = require("path");
const AWS = require('aws-sdk');
const uuid = require('uuid/v4');

const s3 = new AWS.S3({
    accessKeyId: 'AKIAJ2ZSU5G465EDNDLA',
    secretAccessKey: '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',
    signatureVersion: 'v4',
    region: 'us-west-2',

});

module.exports = function (Media) {

    Media.afterRemote('create', function (ctx, newInstance, next) {
        //newInstance is the instance of the created relations Model
        var cookieArray = ctx.req.headers.cookie.split(';');
        var cookie = '';
        for (var i = 0; i < cookieArray.length; i++) {
            if (cookieArray[i].split('=')[0].trim() === 'userId') {
                cookie = cookieArray[i].split('=')[1].trim();
            }
        }
        var userId = cookie.split(/[ \:.]+/)[0];
        if (userId.length > 0) {
            console.log('user ID from cookie is: ' + userId);
            Media.app.models.peer.findById(userId, function (err, instance) {
                if (err) {
                    console.log("User Not Found");
                } else {
                    newInstance.owner.add(instance.id, function (err, addedinstance) {
                        if (err) {
                            console.log("Unable to add peer ");
                            console.log(err);
                        } else {
                            //console.log(addedinstance);
                            console.log("Peer Instance Added");
                        }
                    });
                }
            });
        } else {
            console.log("User Not Signed in! Peer Not Added ");
        }
        next();
    });

    Media.upload = function (ctx, options, cb) {
        if (!options) options = {};
        ctx.req.params.container = 'peerbuds-dev1290';
        var loggedinPeer = Media.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            Media.app.models.container.upload(ctx.req, ctx.result, options, function (err, fileObj) {
                if (err) {
                    cb(err);
                } else {
                    if (fileObj.files.hasOwnProperty('file'))
                        var fileInfo = fileObj.files.file[0];
                    if (fileObj.files.hasOwnProperty('image'))
                        var fileInfo = fileObj.files.image[0];
                    if (fileObj.files.hasOwnProperty('video'))
                        var fileInfo = fileObj.files.video[0];

                    Media.create({
                        originalFilename: fileInfo.originalFilename,
                        size: fileInfo.size,
                        name: fileInfo.name,
                        type: fileInfo.type,
                        container: fileInfo.container,
                        url: CONTAINERS_URL + fileInfo.container + '/download/' + fileInfo.name
                    }, function (err, obj) {
                        if (err !== null) {
                            console.log("Error in creating media node");
                            cb(err);
                        } else {
                            console.log('Adding owner');
                            obj.owner.add(loggedinPeer, function (err, addedPeerInstance) {
                                if (err) {
                                    cb(err);
                                }
                                else {
                                    //console.log(addedPeerInstance);
                                    cb(null, obj);
                                }
                            });
                        }
                    });
                }
            });
        }
        else {
            cb(new Error('Requested API not allowed for unauthenticated requests.'));
        }
    };

    Media.uploadStream = function (ctx, options, cb) {
        if (!options) options = {};
        ctx.req.params.container = 'peerbuds-dev1290';
        var loggedinPeer = Media.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            var uploadStream = Media.app.models.container.uploadStream(ctx.req.params.container, ctx.req.params.filename, options, function () { });
            //console.log(Object.keys(ctx.req));
            var base64Data = ctx.req.body.replace(/^data:([A-Za-z-+/]+);base64,/, '');
            fs.createReadStream(base64Data).pipe(uploadStream);
            console.log('Success with piping read steam to S3');
            cb(null, {});
        }
        else {
            cb(new Error('Requested API not allowed for unauthenticated requests.'));
        }
    };

    Media.getUploadUrl = function (data, ctx, options, cb) {
        console.log('getUploadUrl');
        console.log(data);
        if (!options) options = {};
        const container = 'peerbuds-dev1290';
        var loggedinPeer = Media.getCookieUserId(ctx.req);
        const generatedName = uuid() + '.' + data.ext;
        if (loggedinPeer) {
            var params = { Bucket: container, Key: generatedName };
            console.log('signing');
            s3.getSignedUrl('putObject', params, (err, urlObj) => {
                if (err) {
                    console.log(err);
                    cb(err);
                } else {
                    console.log('The URL is', urlObj);
                    cb(null, {
                        uploadUrl: urlObj,
                        fileName: generatedName,
                        container: container,
                        url: CONTAINERS_URL + container + '/download/' + generatedName
                    });
                }
            });
        }
        else {
            cb(new Error('Requested API not allowed for unauthenticated requests.'));
        }
    };

    Media.getCookieUserId = function (req) {

        var cookieArray = req.headers.cookie.split(';');
        var cookie = '';
        for (var i = 0; i < cookieArray.length; i++) {
            if (cookieArray[i].split('=')[0].trim() === 'userId') {
                cookie = cookieArray[i].split('=')[1].trim();
            }
        }
        console.log('User ID from cookie is: ' + cookie.split(/[ \:.]+/)[0]);
        return cookie.split(/[ \:.]+/)[0];
    };

    Media.remoteMethod(
        'upload',
        {
            description: 'Uploads a file',
            accepts: [
                { arg: 'ctx', type: 'object', http: { source: 'context' } },
                { arg: 'options', type: 'object', http: { source: 'query' } }
            ],
            returns: {
                arg: 'fileObject', type: 'object', root: true
            },
            http: { verb: 'post' }
        }
    );

    Media.remoteMethod(
        'uploadStream',
        {
            description: 'Uploads a file stream',
            accepts: [
                { arg: 'ctx', type: 'object', http: { source: 'context' } },
                { arg: 'options', type: 'object', http: { source: 'query' } }
            ],
            returns: {
                arg: 'fileObject', type: 'object', root: true
            },
            http: { verb: 'post' }
        }
    );


    Media.remoteMethod(
        'getUploadUrl',
        {
            description: 'Get Upload URL',
            accepts: [
                { arg: 'data', type: 'object', http: { source: 'body' } },
                { arg: 'ctx', type: 'object', http: { source: 'context' } },
                { arg: 'options', type: 'object', http: { source: 'query' } }
            ],
            returns: {
                arg: 'fileObject', type: 'object', root: true
            },
            http: { verb: 'post' }
        }
    );

};