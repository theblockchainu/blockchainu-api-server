'use strict';
var app = require('../../server/server');
// NOTE: This example uses the next generation Twilio helper library - for more
// information on how to download and install this version, visit
// https://www.twilio.com/docs/libraries/node

var accountSid = app.get('twilioSID');
var apiKeySid = app.get('twilioKey');
var apiKeySecret = app.get('twilioSecret');

const Twilio = require('twilio');
const Video = require('twilio-video');
const AccessToken = require('twilio').jwt.AccessToken;
var VideoGrant = AccessToken.VideoGrant;

const client = new Twilio(apiKeySid, apiKeySecret, { accountSid: accountSid });

module.exports = function (Room) {

    Room.createTwilioRoom = function (room, cb) {
        client.video.rooms.create({
            uniqueName: room.name,
            type: 'group',
            recordParticipantsOnConnect: 'true',
            statusCallback: 'http://example.org'
        }).then((room) => {
            console.log(room.sid);
            cb(room);
        });
    };

    Room.afterRemote('create', function (ctx, newInstance, next) {
        // Room was created, add a new system message about it
        var loggedinPeer = Room.app.models.peer.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            var messageText = 'Room ' + newInstance.name + ' was created';
            var message = {
                text: messageText,
                type: 'system'
            };
            newInstance.__create__messages(message, function(err, newMessageInstance) {
                if (!err) {
                    Room.app.io.in(newInstance.id).emit('message', message);
                    next();
                }
                else {
                    next(new Error('Could not create a system message'));
                }
            });
        }
        else {
            next(new Error('Could not find logged in peer ID'));
        }
    });

    Room.afterRemote('prototype.__create__messages', function (ctx, newInstance, next) {
        // New message received. Send on socket to room.
        Room.app.io.in(ctx.req.params.id).emit('message', newInstance);
        next();
    });

    Room.afterRemote('prototype.__delete__participants', function (ctx, unlinkInstance, next) {
        // On removing a participant, add a new system message that the user left
        var loggedinPeer = Room.app.models.peer.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            Room.app.models.peer.findById(unlinkInstance.sourceId, {'include': 'profiles'}, function(err, participantInstance) {
                if (!err) {
                    var messageText = '';
                    if (loggedinPeer === ctx.req.params.fk) {
                        // User is deleting himself
                        messageText = participantInstance.toJSON().profiles[0].first_name + ' ' + participantInstance.toJSON().profiles[0].last_name + ' left';
                    }
                    else {
                        // User was removed by teacher
                        messageText = 'Teacher removed ' + participantInstance.toJSON().profiles[0].first_name + ' ' + participantInstance.toJSON().profiles[0].last_name;
                    }
                    var message = {
                        text: messageText,
                        type: 'system'
                    };
                    var roomInstance = ctx.instance;
                    roomInstance.__create__messages(message, function(err, newMessageInstance) {
                        if (!err) {
                            Room.app.io.in(ctx.req.params.id).emit('message', newMessageInstance.toJSON());
                            next();
                        }
                        else {
                            next(new Error('Could not create system message'));
                        }
                    });
                }
                else {
                    next(err);
                }
            });
        }
        else {
            next(new Error('Could not find logged in peer ID'));
        }
    });

    Room.afterRemote('prototype.__link__participants', function (ctx, linkInstance, next) {
        console.log('************Inside add participant hook');
        // On adding a participant, add a new system message that the user joined
        var loggedinPeer = Room.app.models.peer.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            var messagePeer = linkInstance.sourceId;
            Room.app.models.peer.findById(messagePeer, {'include': 'profiles'}, function(err, participantInstance) {
                if (!err) {
                    var messageText = '';
                    if (loggedinPeer === ctx.req.params.fk) {
                        // User is deleting himself
                        messageText = participantInstance.toJSON().profiles[0].first_name + ' ' + participantInstance.toJSON().profiles[0].last_name + ' joined';
                    }
                    else {
                        // User was removed by teacher
                        messageText = 'Teacher added ' + participantInstance.toJSON().profiles[0].first_name + ' ' + participantInstance.toJSON().profiles[0].last_name;
                    }
                    var message = {
                        text: messageText,
                        type: 'system'
                    };
                    var roomInstance = ctx.instance;
                    roomInstance.__create__messages(message, function(err, newMessageInstance) {
                        if (!err) {
                            Room.app.io.in(ctx.req.params.id).emit('message', newMessageInstance.toJSON());
                            next();
                        }
                        else {
                            next(new Error('Could not create system message'));
                        }
                    });
                }
                else {
                    next(err);
                }
            });
        }
        else {
            next(new Error('Could not find logged in peer ID'));
        }
    });

};
