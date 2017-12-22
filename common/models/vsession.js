'use strict';
var app = require('../../server/server');
var accountSid = app.get('twilioSID');
var apiKeySid = app.get('twilioKey');
var apiKeySecret = app.get('twilioSecret');
const Twilio = require('twilio');
const Video = require('twilio-video');
const AccessToken = Twilio.jwt.AccessToken;
var VideoGrant = AccessToken.VideoGrant;
module.exports = function (Vsession) {

    Vsession.getToken = function (req, cb) {

        var loggedinPeer = Vsession.app.models.peer.getCookieUserId(req);

        //if user is logged in
        if (loggedinPeer) {
            const token = new AccessToken(accountSid, apiKeySid, apiKeySecret);
            token.identity = loggedinPeer;
            var grant = new VideoGrant();
            token.addGrant(grant);
            cb(null, {
                identity: token.identity,
                token: token.toJwt()
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }


    Vsession.remoteMethod('getToken', {
        description: 'Twilio token',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/token' }
    });
};
