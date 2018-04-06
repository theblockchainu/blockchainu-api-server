'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function(Question) {
	
	Question.afterRemote('prototype.__create__upvotes', function (ctx, newUpvotesInstance, next) {
		// Send email & notification to owner if upvote received
		var loggedinPeer = Question.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Question.findById(ctx.instance.id, {include: [{'peer': 'profiles'}, 'communities']}, function (err, questionInstance) {
				if (!err) {
					Question.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							// Send email to owner
							var message = { actorName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name, itemType: 'question',  itemText: questionInstance.toJSON().text};
							var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newUpvoteToOwner.ejs'));
							var html_body = renderer(message);
							loopback.Email.send({
								to: questionInstance.toJSON().peer[0].email,
								from: 'Peerbuds <noreply@mx.peerbuds.com>',
								subject: 'New upvote on question',
								html: html_body
							})
									.then(function (response) {
										console.log('email sent! - ' + response);
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							
							var actionUrl = [];
							if (questionInstance.toJSON().communities) {
								actionUrl = ['community', questionInstance.toJSON().communities[0].id];
							}
							// Create notification
							var Notification = app.models.notification;
							var notifData = {
								type: "action",
								title: "New upvote on question!",
								description: "%username% has upvoted your question.",
								actionUrl: actionUrl
							};
							Notification.createNotification(questionInstance.toJSON().peer[0].id, loggedinPeerInstance.id, notifData, 'community', questionInstance.toJSON().communities[0].id, function (err, notificationInstance) {
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
	
	Question.getCookieUserId = function (req) {
		
		var cookieArray = req.headers.cookie.split(';');
		var cookie = '';
		for (var i = 0; i < cookieArray.length; i++) {
			if (cookieArray[i].split('=')[0].trim() === 'userId') {
				cookie = cookieArray[i].split('=')[1].trim();
			}
		}
		return cookie.split(/[ \:.]+/)[0].substring(4);
	};
};
