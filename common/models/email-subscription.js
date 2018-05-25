'use strict';
let loopback = require('loopback');
let path = require('path');

module.exports = function(Emailsubscription) {

    Emailsubscription.observe('after save', function sendEmail(ctx, next) {
        if (!ctx.instance && !ctx.data) return next();

        let email = (ctx.instance || ctx.data).email;

        if (!email) return next();

        let message, subject;
        message = {
        	heading: "We have received your request to be notified about peerbuds's platform updates.\n\nOur team is working super hard to change how knowledge is shared and recognized.\n\nWe will keep you notified as we move closer to sharing this vision with the world."
        };
        subject = 'Thank you for subscribing to peerbuds';

        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
        let html_body = renderer(message);
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
	
	    message = { heading: "New email subscription from " + email};
	    subject = 'New email subscription';
	
	    html_body = renderer(message);
	    loopback.Email.send({
		    to: 'aakash@peerbuds.com',
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
	    
	    next();

    });

};
