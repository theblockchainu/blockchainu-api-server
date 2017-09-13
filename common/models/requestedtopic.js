'use strict';
var passcode = require("passcode");
var loopback = require('../../node_modules/loopback/lib/loopback');
var path = require('path');

module.exports = function (Requestedtopic) {

    Requestedtopic.requestTopic = function (req, topic, cb) {

        //var loggedinPeer = req.cookies.userId.split(/[ \:.]+/)[1];
        var loggedinPeer = Requestedtopic.app.models.peer.getCookieUserId(req);
        //if user is logged in
        if (loggedinPeer) {

            Requestedtopic.app.models.peer.findById(loggedinPeer, function (err, peerInstance) {

                // Generate new verificationToken
                var verificationToken = passcode.hotp({
                    secret: "0C6&7vvvv",
                    counter: Date.now()
                });

                // Send token in email to user.
                var text = peerInstance.username + " has requested to add new topic " + topic.name;
                var message = { heading: text };
                var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                var html_body = renderer(message);
                loopback.Email.send({
                    to: 'Peerbuds <noreply@mx.peerbuds.com>',
                    from: peerInstance.email,
                    subject: 'New Topic Request - ' + topic.name,
                    html: html_body
                }).then(function (response) {
                    console.log('email sent! - ' + response);
                }).catch(function (err) {
                    console.log('email error! - ' + err);
                });
                topic.peerId = loggedinPeer;
                Requestedtopic.create(topic, function (err, topicInstance) {
                    if (err) {
                        topicInstance.destroy();
                        cb(err);
                    } else {
                        cb(null, topicInstance);
                    }
                });
            });

        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    };

    // Request Topic methods
    Requestedtopic.remoteMethod('requestTopic', {
        description: 'Request a new Topic',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } }, {
            arg: 'data', type: 'object', http: { source: 'body' },
            description: "Request a new topic", required: true
        }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/request-topic' }
    }
    );
};
