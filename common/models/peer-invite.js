'use strict';

let loopback = require('../../node_modules/loopback/lib/loopback');
let path = require('path');
let _ = require('lodash');
let moment = require('moment');

module.exports = function (Peerinvite) {
    Peerinvite.observe('after save', (ctx, next) => {
        if (ctx.instance) {
            const peerInviteInstance = ctx.instance;
            const inviteInstance = peerInviteInstance.toJSON();
            let contactInstanceJson;
            if (inviteInstance.contactId && inviteInstance.contactId.length > 0) {
	            // Invited peer is an imported social media contact
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
					            from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
					            subject: instance.profiles[0].first_name + ' has invited you to Blockchain University',
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
            }
            else {
                // Invited peer is not a social media contact of the invitor
	            Peerinvite.app.models.peer.findById(inviteInstance.peerId, { 'include': 'profiles' })
			            .then(invitorInstance => {
				            console.log(invitorInstance);
				            if (inviteInstance.collectionId) {
					            // Invite is for a course
					            Peerinvite.app.models.collection.findById(inviteInstance.collectionId, {'include' : 'calendars'})
							            .then((invitedCollectionInstance) => {
							            	const invitedCalendarInstance = _.find(invitedCollectionInstance.calendars(), calendar => calendar.id === inviteInstance.calendarId);
								            const message = {
									            inviteeName: inviteInstance.name,
									            invitorName: invitorInstance.profiles()[0].first_name + ' ' + invitorInstance.profiles()[0].last_name,
									            invitorHeadline: invitorInstance.profiles()[0].headline,
									            invitationCode: inviteInstance.id,
									            invitorFirstName: invitorInstance.profiles()[0].first_name,
									            invitorImage: invitorInstance.profiles()[0].picture_url ? invitorInstance.profiles()[0].picture_url : '/assets/images/user-placeholder.jpg',
									            invitorContactProvider: '',
									            collection: invitedCollectionInstance,
									            calendar: invitedCalendarInstance,
									            moment: moment
								            };
								            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/inviteContactToCourse.ejs'));
								            let html_body = renderer(message);
								            return loopback.Email.send({
									            to: inviteInstance.email,
									            from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
									            subject: 'Claim your Smart Certificate for ' + invitedCollectionInstance.title,
									            html: html_body
								            });
							            });
				            } else {
				            	// Invite is for the platform
					            const message = {
						            inviteeName: inviteInstance.name,
						            invitorName: invitorInstance.profiles()[0].first_name + ' ' + invitorInstance.profiles()[0].last_name,
						            invitorHeadline: invitorInstance.profiles()[0].headline,
						            invitationCode: inviteInstance.id,
						            invitorFirstName: invitorInstance.profiles()[0].first_name,
						            invitorImage: invitorInstance.profiles()[0].picture_url ? invitorInstance.profiles()[0].picture_url : '/assets/images/user-placeholder.jpg',
						            invitorContactProvider: ''
					            };
					            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/inviteContactToPlatform.ejs'));
					            let html_body = renderer(message);
					            return loopback.Email.send({
						            to: inviteInstance.email,
						            from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
						            subject: invitorInstance.profiles()[0].first_name + ' has invited you to Blockchain University',
						            html: html_body
					            });
				            }
			            })
			            .then(function (response) {
				            console.log('email sent! - ' + response);
				            next();
			            })
			            .catch(err => {
				            console.log(err);
				            next(err);
			            });
            }
        } else {
            next('Instance Not Found');
        }
    });
};
