'use strict';
var loopback = require('loopback');
var path = require('path');

module.exports = function (Emailsubscription) {

    Emailsubscription.observe('after save', function sendEmail(ctx, next) {
        if (!ctx.instance && !ctx.data) return next();

        var email = (ctx.instance || ctx.data).email;

        if (!email) return next();

        var message, subject;
        message = { heading: "Thank you for teaching on Peerbuds. We hope you have an enriching experience" };
        subject = 'We have received your workshop submission. Our team is working super hard to change how education is gained and shared. We will keep you notified as our we move closer to sharing this vision with the world. \n\nPeerbuds Team \nSilicon Valley';

        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/welcomeSignupTeacher.ejs'));
        var html_body = renderer(message);
        loopback.Email.send({
            to: email,
            from: 'Peerbuds <noreply@mx.peerbuds.com>',
            subject: subject,
            html: html_body
        })
            .then(function (response) {
                console.log('email sent! - ' + response);
            })
            .catch(function (err) {
                console.log('email error! - ' + err);
            });

    });

};
