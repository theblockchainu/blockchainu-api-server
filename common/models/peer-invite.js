'use strict';

module.exports = function (Peerinvite) {
    Peerinvite.observe('after save', (ctx, next) => {
        if (ctx.instance) {
            const inviteInstance = ctx.instance;
            const message = {
                invitedPeerName: inviteInstance.toJSON().profiles[0].first_name,
                invitedByName: inviteInstance.toJSON().profiles[0].first_name + ' ' + inviteInstance.toJSON().profiles[0].last_name,
            };
            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newInvitebyPeer.ejs'));
            let html_body = renderer(message);
            loopback.Email.send({
                to: inviteInstance.email,
                from: 'Peerbuds <noreply@mx.peerbuds.com>',
                subject: 'You have a been invited to try peerbuds',
                html: html_body
            })
                .then(function (response) {
                    console.log('email sent! - ' + response);
                })
                .catch(function (err) {
                    console.log('email error! - ' + err);
                });
        }
        next();
    });
};
