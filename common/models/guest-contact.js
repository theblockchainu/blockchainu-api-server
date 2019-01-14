'use strict';
let loopback = require('loopback');
let path = require('path');

module.exports = function (Guestcontact) {

    Guestcontact.observe('after save', function sendEmail(ctx, next) {
        if (!ctx.instance && !ctx.data) return next();

        let email = (ctx.instance || ctx.data).email;
        let name = (ctx.instance || ctx.data).first_name + ' ' + (ctx.instance || ctx.data).last_name;

        if (!email) return next();

        let message, subject;
        message = {
            heading: 'Hi ' + name + ', \nWe have received your query and will get back to you with the best possible response at the earliest.'
        };
        subject = 'Thanks for reaching out';

        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
        let html_body = renderer(message);
        loopback.Email.send({
            to: email,
            from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
            subject: subject,
            html: html_body
        })
            .then(function (response) {
                console.log('email sent! - ' + response);
            })
            .catch(function (err) {
                console.log('email error! - ' + err);
            });

        let messageAdmin = {
            userName: ctx.instance.first_name + ' ' + ctx.instance.last_name,
            userEmail: ctx.instance.email,
            message: ctx.instance.message
        };
        let rendererAdmin = loopback.template(path.resolve(__dirname, '../../server/views/newQueryAdmin.ejs'));
        let html_admin_body = rendererAdmin(messageAdmin);
        loopback.Email.send({
            to: 'learn@theblockchainu.com',
            from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
            subject: 'New User Query from ' + ctx.instance.email,
            html: html_admin_body
        })
            .then(function (response) {
                console.log('email sent! - ' + response);
            })
            .catch(function (err) {
                console.log('email error! - ' + err);
            });
        next(null, 'Success');
    });

};
