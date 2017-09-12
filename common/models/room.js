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
    }

    Room.afterRemote('prototype.__create__messages', function (ctx, newInstance, next) {

        var userId = Room.app.models.peer.getCookieUserId(ctx.req);
        //var userId = ctx.req.cookies.userId.split(/[ \:.]+/)[1];
        if (userId) {
            Room.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    if (!err) {
                        console.log("Room is", ctx.req.params.id);
                        Room.app.io.to(ctx.req.params.id).emit('message', newInstance);
                    }
                    else {
                        newInstance.delete();
                    }
                });
            });
        } else {
            console.log("User Not Signed in!");
            newInstance.delete();
        }
        next();
    });

};
