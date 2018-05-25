'use strict';

let loopback = require('../../node_modules/loopback/lib/loopback');
let path = require('path');


module.exports = function (Peerinvite) {
    Peerinvite.observe('after save', (ctx, next) => {
        if (ctx.instance) {
            const peerInviteInstance = ctx.instance;
            const inviteInstance = peerInviteInstance.toJSON();
            let contactInstanceJson;
            Peerinvite.app.models.contact.findById(inviteInstance.contactId)
                .then(contactInstance => {
                    contactInstanceJson = contactInstance.toJSON();
                    return peerInviteInstance.contacts.add(contactInstanceJson.id);
                })
                .then(instanceRelation => {
                    return Peerinvite.app.models.peer.findById(inviteInstance.peerId, { 'include': 'profiles' });
                })
                .then(peerInstance => {
                    const instance = peerInstance.toJSON();
                    console.log(instance);
                    const message = {
                        inviteeName: inviteInstance.name,
                        invitorName: instance.profiles[0].first_name + ' ' + instance.profiles[0].last_name,
                        invitorHeadline: instance.profiles[0].headline,
                        invitationCode: inviteInstance.id,
                        invitorFirstName: instance.profiles[0].first_name,
                        invitorImage: instance.profiles[0].picture_url,
                        invitorContactProvider: contactInstanceJson.provider
                    };
                    let renderer = loopback.template(path.resolve(__dirname, '../../server/views/inviteContactToPlatform.ejs'));
                    let html_body = renderer(message);
                    return loopback.Email.send({
                        to: inviteInstance.email,
                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                        subject: 'You have a been invited to try peerbuds',
                        html: html_body
                    });
                })
                .then(function (response) {
                    console.log('email sent! - ' + response);
                    next();
                })
                .catch(err => {
                    console.log(err);
                    next(err);
                });
        } else {
            next('Instance Not Found');
        }
    });
};
