'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function(Reply) {
	
	Reply.afterRemote('prototype.__create__upvotes', function (ctx, newUpvotesInstance, next) {
		// Send email & notification to owner if upvote received
		var loggedinPeer = Reply.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Reply.findById(ctx.instance.id, {include: [{'peer': 'profiles'}, {'comments' : ['collections', {'contents': {'collections': 'calendars'}}, {'submissions': {'contents': {'collections': 'calendars'}}}, 'communities', {'questions': 'communities'}, {'answers': {'questions': 'communities'}} ]}]}, function (err, replyInstance) {
				if (!err) {
					Reply.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							// Send email to owner
							var message = { actorName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name, itemType: 'reply',  itemText: replyInstance.toJSON().description};
							var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newUpvoteToOwner.ejs'));
							var html_body = renderer(message);
							loopback.Email.send({
								to: replyInstance.toJSON().peer[0].email,
								from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
								subject: 'New upvote on reply',
								html: html_body
							})
									.then(function (response) {
										console.log('email sent! - ' + response);
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							
							var actionUrl = [];
							var notificationConnectedNode, notificationConnectedNodeId;
							if (replyInstance.toJSON().comments[0].collections) {
								actionUrl = [replyInstance.toJSON().comments[0].collections[0].type, replyInstance.toJSON().comments[0].collections[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].collections[0].id;
							} else if (replyInstance.toJSON().comments[0].contents) {
								actionUrl = [replyInstance.toJSON().comments[0].contents[0].collections[0].type, replyInstance.toJSON().comments[0].contents[0].collections[0].id, replyInstance.toJSON().comments[0].contents[0].collections[0].calendars[0].id, replyInstance.toJSON().comments[0].contents[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].contents[0].collections[0].id;
							} else if (replyInstance.toJSON().comments[0].submissions) {
								actionUrl = [replyInstance.toJSON().comments[0].submissions[0].contents[0].collections[0].type, replyInstance.toJSON().comments[0].submissions[0].contents[0].collections[0].id, replyInstance.toJSON().comments[0].submissions[0].contents[0].collections[0].calendars[0].id, replyInstance.toJSON().comments[0].submissions[0].contents[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].submissions[0].contents[0].collections[0].id;
							} else if (replyInstance.toJSON().comments[0].communities) {
								actionUrl = ['community', replyInstance.toJSON().comments[0].communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].communities[0].id;
							} else if (replyInstance.toJSON().comments[0].questions) {
								actionUrl = ['community', replyInstance.toJSON().comments[0].questions[0].communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].questions[0].communities[0].id;
							} else if (replyInstance.toJSON().comments[0].answers) {
								actionUrl = ['community', replyInstance.toJSON().comments[0].answers[0].questions[0].communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = replyInstance.toJSON().comments[0].answers[0].questions[0].communities[0].id;
							}
							// Create notification
							var Notification = app.models.notification;
							var notifData = {
								type: "action",
								title: "New upvote on reply!",
								description: "%username% has upvoted your reply to a comment.",
								actionUrl: actionUrl
							};
							Notification.createNotification(replyInstance.toJSON().peer[0].id, loggedinPeerInstance.id, notifData, notificationConnectedNode, notificationConnectedNodeId, function (err, notificationInstance) {
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
					next(new Error('Could not find reply'));
				}
			});
		}
		else {
			next(new Error('Could not find user from cookie'));
		}
	});
	
	Reply.getCookieUserId = function (req) {
		
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
