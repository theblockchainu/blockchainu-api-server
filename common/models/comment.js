'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function(Comment) {
	
	Comment.afterRemote('prototype.__create__upvotes', function (ctx, newUpvotesInstance, next) {
		// Send email & notification to owner if upvote received
		var loggedinPeer = Comment.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Comment.findById(ctx.instance.id, {include: [{'peer': 'profiles'}, 'collections', {'contents': {'collections': 'calendars'}}, {'submissions': {'contents': {'collections': 'calendars'}}}, 'communities', {'questions': 'communities'}, {'answers': {'questions': 'communities'}}]}, function (err, commentInstance) {
				if (!err) {
					Comment.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							// Send email to owner
							var message = { actorName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name, itemType: 'comment',  itemText: commentInstance.toJSON().description};
							var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newUpvoteToOwner.ejs'));
							var html_body = renderer(message);
							loopback.Email.send({
								to: commentInstance.toJSON().peer[0].email,
								from: 'Peerbuds <noreply@mx.peerbuds.com>',
								subject: 'New upvote on comment',
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
							if (commentInstance.toJSON().collections) {
								actionUrl = [commentInstance.toJSON().collections[0].type, commentInstance.toJSON().collections[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = commentInstance.toJSON().collections[0].id;
							} else if (commentInstance.toJSON().contents) {
								actionUrl = [commentInstance.toJSON().contents[0].collections[0].type, commentInstance.toJSON().contents[0].collections[0].id, commentInstance.toJSON().contents[0].collections[0].calendars[0].id, commentInstance.toJSON().contents[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = commentInstance.toJSON().contents[0].collections[0].id;
							} else if (commentInstance.toJSON().submissions) {
								actionUrl = [commentInstance.toJSON().submissions[0].contents[0].collections[0].type, commentInstance.toJSON().submissions[0].contents[0].collections[0].id, commentInstance.toJSON().submissions[0].contents[0].collections[0].calendars[0].id, commentInstance.toJSON().submissions[0].contents[0].id];
								notificationConnectedNode = 'collection';
								notificationConnectedNodeId = commentInstance.toJSON().submissions[0].contents[0].collections[0].id;
							} else if (commentInstance.toJSON().communities) {
								actionUrl = ['community', commentInstance.toJSON().communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = commentInstance.toJSON().communities[0].id;
							} else if (commentInstance.toJSON().questions) {
								actionUrl = ['community', commentInstance.toJSON().questions[0].communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = commentInstance.toJSON().questions[0].communities[0].id;
							} else if (commentInstance.toJSON().answers) {
								actionUrl = ['community', commentInstance.toJSON().answers[0].questions[0].communities[0].id];
								notificationConnectedNode = 'community';
								notificationConnectedNodeId = commentInstance.toJSON().answers[0].questions[0].communities[0].id;
							}
							// Create notification
							var Notification = app.models.notification;
							var notifData = {
								type: "action",
								title: "New upvote on comment!",
								description: "%username% has upvoted your comment.",
								actionUrl: actionUrl
							};
							Notification.createNotification(commentInstance.toJSON().peer[0].id, loggedinPeerInstance.id, notifData, notificationConnectedNode, notificationConnectedNodeId, function (err, notificationInstance) {
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
	
	Comment.getCookieUserId = function (req) {
		
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
