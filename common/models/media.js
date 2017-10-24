var CONTAINERS_URL = '/api/containers/';
module.exports = function(Media) {

    Media.upload = function (ctx,options,cb) {
        if(!options) options = {};
        ctx.req.params.container = 'peerbuds-dev1290';
        var loggedinPeer = Media.getCookieUserId(ctx.req);
        if(loggedinPeer) {
            Media.app.models.container.upload(ctx.req,ctx.result,options,function (err,fileObj) {
                if(err) {
                    cb(err);
                } else {
                    if(fileObj.files.hasOwnProperty('file'))
                        var fileInfo = fileObj.files.file[0];
                    if(fileObj.files.hasOwnProperty('image'))
                        var fileInfo = fileObj.files.image[0];
                    if(fileObj.files.hasOwnProperty('video'))
                        var fileInfo = fileObj.files.video[0];

                    Media.create({
                        originalFilename: fileInfo.originalFilename,
                        size: fileInfo.size,
                        name: fileInfo.name,
                        type: fileInfo.type,
                        container: fileInfo.container,
                        url: CONTAINERS_URL+fileInfo.container+'/download/'+fileInfo.name
                    },function (err,obj) {
                        if (err !== null) {
                            console.log("Error in creating media node");
                            cb(err);
                        } else {
                            obj.owner.add(loggedinPeer, function(err, addedPeerInstance){
                               if(err) {
                                   cb(err);
                               }
                               else {
                                   console.log(addedPeerInstance);
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

    Media.getCookieUserId = function (req) {

        var cookieArray = req.headers.cookie.split(';');
        var cookie = '';
        for (var i = 0; i < cookieArray.length; i++) {
            if (cookieArray[i].split('=')[0].trim() === 'userId') {
                cookie = cookieArray[i].split('=')[1].trim();
            }
        }
        return cookie.split(/[ \:.]+/)[0].substring(4);
    };

    Media.remoteMethod(
        'upload',
        {
            description: 'Uploads a file',
            accepts: [
                { arg: 'ctx', type: 'object', http: { source:'context' } },
                { arg: 'options', type: 'object', http:{ source: 'query'} }
            ],
            returns: {
                arg: 'fileObject', type: 'object', root: true
            },
            http: {verb: 'post'}
        }
    );

};