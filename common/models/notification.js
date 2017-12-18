'use strict';
var app = require('../../server/server');

module.exports = function (Notification, socket) {

    Notification.prototype.createNotification = function (toId, actorId, notificationData, cb) {

        var User = app.models.peer;

        User.findById(toId, function (err, toPeerInstance) {
            if (err) {
                cb(err);
            } else if (toPeerInstance) {
                toPeerInstance.notifications.create(notificationData, function (err, notificationInstance) {
                    if (err) {
                        notificationInstance.destroy();
                        cb(err);
                    } else {
                        User.findById(actorId, function (err, actorInstance) {
                            if (err) {
                                cb(err);
                            } else if (actorInstance) {
                                notificationInstance.actor.add(actorInstance.id, function(err, addedActorInstance){
                                    if(err){
                                        cb(err);
                                    }
                                    else {
                                        cb(null, notificationInstance);
                                    }
                                });
                            }
                            else {
                                var err = new Error('Actor instance wrong');
                                err.code = 'INVALID_ACCESS';
                                cb(err);
                            }
                        });
                    }
                });
            } else {
                var err = new Error('Invalid access');
                err.code = 'INVALID_ACCESS';
                cb(err);
            }
        });
    }
};
