'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function(Submission) {
	
	Submission.afterRemote('prototype.__create__upvotes', function (ctx, newUpvotesInstance, next) {
		// Send email & notification to owner if upvote received
		var loggedinPeer = Submission.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Submission.findById(ctx.instance.id, {include: [{'peer': 'profiles'}, {'contents': {'collections': 'calendars'}}]}, function (err, submissionInstance) {
				if (!err) {
					Submission.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							// Send email to owner
							var message = { actorName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name, itemType: 'submission',  itemText: submissionInstance.toJSON().description, itemNode: submissionInstance.toJSON().contents[0].collections[0].type, itemId: submissionInstance.toJSON().contents[0].collections[0].id};
							var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newUpvoteToOwner.ejs'));
							var html_body = renderer(message);
							loopback.Email.send({
								to: submissionInstance.toJSON().peer[0].email,
								from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
								subject: 'New upvote on your project submission',
								html: html_body
							})
									.then(function (response) {
										console.log('email sent! - ' + response);
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							
							var actionUrl = [];
							if (submissionInstance.toJSON().contents) {
								actionUrl = [submissionInstance.toJSON().contents[0].collections[0].type, submissionInstance.toJSON().contents[0].collections[0].id, submissionInstance.toJSON().contents[0].collections[0].calendars[0].id, submissionInstance.toJSON().contents[0].id];
							}
							// Create notification
							var Notification = app.models.notification;
							var notifData = {
								type: "action",
								title: "New upvote on project submission!",
								description: "%username% has upvoted your project submission.",
								actionUrl: actionUrl
							};
							Notification.createNotification(submissionInstance.toJSON().peer[0].id, loggedinPeerInstance.id, notifData, 'collection', submissionInstance.toJSON().contents[0].collections[0].id, function (err, notificationInstance) {
								if (!err) {
									console.log(notificationInstance);
								}
								else {
									console.log(err);
								}
							});
							next();
						}
						else {
							next(new Error('Could not find logged in user'));
						}
					});
				}
				else {
					next(new Error('Could not find comment'));
				}
			});
		}
		else {
			next(new Error('Could not find user from cookie'));
		}
	});
	
	Submission.getCookieUserId = function (req) {
		
		var cookieArray = req.headers.cookie.split(';');
		var cookie = '';
		for (var i = 0; i < cookieArray.length; i++) {
			if (cookieArray[i].split('=')[0].trim() === 'userId') {
				cookie = cookieArray[i].split('=')[1].trim();
			}
		}
		console.log('User ID from cookie is: ' + cookie.split(/[ \:.]+/)[0]);
		return cookie.split(/[ \:.]+/)[0];
	};

};
