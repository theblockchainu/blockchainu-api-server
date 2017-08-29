module.exports = function (Model, options) {
    'use strict';

    options.relationName.forEach(function (element) {

        var methodName = 'prototype.__create__' + element;

        Model.afterRemote(methodName, function (ctx, newInstance, next) {
            //newInstance is the instance of the created relations Model
            if (ctx.req.cookies.userId) {
                var userId = ctx.req.cookies.userId.split(/[ \:.]+/)[1];
                Model.app.models.peer.findById(userId, function (err, instance) {
                    if (err) {
                        console.log("User Not Found");
                    } else {
                        newInstance.peer.add(instance, function (err, addedinstance) {
                            if (err) {
                                console.log("Unable to add peer to " + element);
                            } else {
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