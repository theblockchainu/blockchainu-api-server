module.exports = function (Model, options) {
    'use strict';

    options.relationName.forEach(function (element) {

        var methodName = 'prototype.__create__' + element;

        Model.afterRemote(methodName, function (ctx, newInstance, next) {
            //newInstance is the instance of the created relations Model
            if (ctx.req.headers.cookie) {
                var cookie = ctx.req.headers.cookie.split(';')[2].split('=')[1].trim();
                var userId = cookie.split(/[ \:.]+/)[0].substring(4);
                console.log('user ID from cookie is: ' + userId);
                Model.app.models.peer.findById(userId, function (err, instance) {
                    if (err) {
                        console.log("User Not Found");
                    } else {
                        newInstance.peer.add(instance.id, function (err, addedinstance) {
                            if (err) {
                                console.log("Unable to add peer to " + element);
                                console.log(err);
                            } else {
                                console.log(addedinstance);
                                console.log("Peer Instance Added to " + element);
                            }
                        });
                    }
                });
            } else {
                console.log("User Not Signed in! Peer Not Added to " + element);
            }
            next();
        });
    }, this);

};