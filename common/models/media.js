var CONTAINERS_URL = '/api/containers/';
module.exports = function(Media) {

    Media.upload = function (ctx,options,cb) {
        if(!options) options = {};
        ctx.req.params.container = 'peerbuds-dev1290';
        Media.app.models.container.upload(ctx.req,ctx.result,options,function (err,fileObj) {
            if(err) {
                cb(err);
            } else {
                var fileInfo = fileObj.files.file[0];
                Media.create({
                    name: fileInfo.name,
                    type: fileInfo.type,
                    container: fileInfo.container,
                    url: CONTAINERS_URL+fileInfo.container+'/download/'+fileInfo.name
                },function (err,obj) {
                    if (err !== null) {
                        console.log("Error in creating media node");
                        cb(err);
                    } else {
                        cb(null, obj);
                    }
                });
            }
        });
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