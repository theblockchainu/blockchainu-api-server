'use strict';
var loopback = require('loopback');
var path = require('path');

module.exports = function(Guestcontact) {

    Guestcontact.observe('after save', function sendEmail(ctx, next) {
        if (!ctx.instance && !ctx.data) return next();

        var email = (ctx.instance || ctx.data).email;
        var name = (ctx.instance || ctx.data).first_name + ' ' + (ctx.instance || ctx.data).last_name;

        if (!email) return next();

        var message, subject;
        message = { heading: 'Hi '+ name +', \nWe have received your query and will get back to you with the best possible response at the earliest. \n\nPeerbuds Team \nSilicon Valley'};
        subject = 'Thanks for reaching out';

        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
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
