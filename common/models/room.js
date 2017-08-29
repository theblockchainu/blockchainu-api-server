'use strict';
var app = require('../../server/server');
// NOTE: This example uses the next generation Twilio helper library - for more
// information on how to download and install this version, visit
// https://www.twilio.com/docs/libraries/node
const apiKeySid = 'SK7fa266013cc50fdefd7fed30d60934a8';
const apiKeySecret = 'sTbOLDkRHG23FzFn9ftXGJ4edM3mWjcK';
const accountSid = 'ACc1c8552004aef409ea9ba6ceb3b3f4a3';
const Twilio = require('twilio');
const Video = require('twilio-video');
const AccessToken = require('twilio').jwt.AccessToken;
var VideoGrant = AccessToken.VideoGrant;

const client = new Twilio(apiKeySid, apiKeySecret, { accountSid: accountSid });

module.exports = function (Room) {



    app.get('/room-connect', function (req, res, next) {

        // var loggedinPeer = req.user;
        // if (loggedinPeer) {

        // Create an access token which we will sign and return to the client,
        // containing the grant we just created
        const token = new AccessToken(accountSid, apiKeySid, apiKeySecret);
        token.identity = 'tausif';//loggedinPeer.id;
        var grant = new VideoGrant();
        token.addGrant(grant);

        res.render('pages/room-connect', {
            token: token.toJwt(),
            name: 'tausif sheikh'
        });
        // }
    });


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
        if (ctx.req.user) {
            var userId = ctx.req.user.id;

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
