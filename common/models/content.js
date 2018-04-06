'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function (Content) {
	
	Content.afterRemote('prototype.__link__packages', function(ctx, packageInstance, next) {
		var contentInstance = ctx.instance;
		console.log('Linking packages to contents');
		contentInstance.__get__availabilities({}, function(err, availabilityInstances) {
			if (!err && availabilityInstances && availabilityInstances.length > 0) {
				contentInstance.__get__peers({"include": "profiles"}, function(err, studentInstances) {
					if (!err && studentInstances && studentInstances.length > 0) {
						contentInstance.__get__collections({"include": "owners"}, function (err, collectionInstances) {
							if (!err) {
								// Send email to teacher about new Session request
								var incomingCollectionInstance = collectionInstances[0];
								var formattedDate = moment(availabilityInstances[0].startDateTime).format('Do MMM');
								var startTime = moment(availabilityInstances[0].startDateTime).format('h:mm a');
								var endTime = moment(availabilityInstances[availabilityInstances.length - 1].startDateTime).add(60, 'minutes').format('h:mm a');
								// Send out notification only if this is a non approved content.
								if (incomingCollectionInstance.type === 'session' && contentInstance.toJSON().sessionIsApproved !== true) {
									// Send email to teacher
									var message = {studentName: studentInstances[0].toJSON().profiles[0].first_name + ' ' + studentInstances[0].toJSON().profiles[0].last_name, formattedDate: formattedDate, hours: availabilityInstances.length};
									var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newSessionRequestTeacher.ejs'));
									var html_body = renderer(message);
									loopback.Email.send({
										to: incomingCollectionInstance.toJSON().owners[0].email,
										from: 'Peerbuds <noreply@mx.peerbuds.com>',
										subject: 'New Session Request',
										html: html_body
									})
											.then(function (response) {
												console.log('email sent! - ');
											})
											.catch(function (err) {
												console.log('email error! - ' + err);
											});
									
									// Create notification
									var Notification = app.models.notification;
									var notifData = {
										type: "action",
										title: "New session request!",
										description: "%username% has requested to join a peer session on %sessionDate% for %sessionHours%. Click to approve / reject.",
										actionUrl: ["console","teaching","sessions"]
									};
									Notification.createNotification(incomingCollectionInstance.toJSON().owners[0].id, studentInstances[0].toJSON().id, notifData, 'content', contentInstance.id, function (err, notificationInstance) {
										if (!err) {
											console.log(notificationInstance);
										}
										else {
											console.log(err);
										}
									});
								}
								next();
							}
							else {
								console.log('Could not send email to teacher for new session');
								next(err);
							}
						});
					} else {
						console.log('Could not get participants for this content');
						next(err);
					}
				});
			} else {
				console.log('Could not find availability instances');
				next(err);
			}
		});
	});
	
	
	Content.afterRemote('prototype.__create__rsvps', function(ctx, rsvpInstance, next) {
		var contentInstance = ctx.instance;
		var loggedinUser = Content.getCookieUserId(ctx.req);
		if (loggedinUser) {
			console.log('Adding RSVP to content');
			contentInstance.__get__collections({"include": "owners"}, function (err, collectionInstances) {
				if (!err) {
					Content.app.models.peer.findById(loggedinUser, {'include': 'profiles'}, function (err, loggedinPeerInstance) {
						if (!err) {
							// Send email to teacher about new RSVP request
							var incomingCollectionInstance = collectionInstances[0];
							// Send email to teacher
							var message = {studentName: loggedinPeerInstance.toJSON().profiles[0].first_name + ' ' + loggedinPeerInstance.toJSON().profiles[0].last_name, contentTitle: contentInstance.toJSON().title, collectionTitle: incomingCollectionInstance.toJSON().title, collectionType: incomingCollectionInstance.toJSON().type, collectionId: incomingCollectionInstance.toJSON().id};
							var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newRsvpTeacher.ejs'));
							var html_body = renderer(message);
							loopback.Email.send({
								to: incomingCollectionInstance.toJSON().owners[0].email,
								from: 'Peerbuds <noreply@mx.peerbuds.com>',
								subject: 'New RSVP for activity',
								html: html_body
							})
									.then(function (response) {
										console.log('email sent! - ');
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							
							// Create notification
							var Notification = app.models.notification;
							var notifData = {
								type: "action",
								title: "New RSVP for activity!",
								description: "%username% has RSVP'd for your in-person activity.",
								actionUrl: [incomingCollectionInstance.toJSON().type,incomingCollectionInstance.toJSON().id]
							};
							Notification.createNotification(incomingCollectionInstance.toJSON().owners[0].id, loggedinPeerInstance.toJSON().id, notifData, 'content', contentInstance.id, function (err, notificationInstance) {
								if (!err) {
									console.log(notificationInstance);
								}
								else {
									console.log(err);
								}
							});
							next();
						} else {
							next(new Error('Could not find peer instance'));
						}
					})
				}
				else {
					console.log('Could not send email to teacher for new session');
					next(err);
				}
			});
		} else {
			next(new Error('Could not find user from cookie'));
		}
	});
	
	Content.afterRemote('prototype.patchAttributes', function(ctx, newInstance, next) {
		var contentInstance = ctx.instance;
		console.log('Updating content to mark it approved or rejected');
		if (newInstance.toJSON().type === 'session' && (ctx.args.data.hasOwnProperty('sessionIsApproved') || ctx.args.data.hasOwnProperty('sessionIsRejected'))) {
			contentInstance.__get__availabilities({}, function(err, availabilityInstances) {
				if (!err && availabilityInstances && availabilityInstances.length > 0) {
					contentInstance.__get__peers({"include": "profiles"}, function(err, studentInstances) {
						if (!err && studentInstances && studentInstances.length > 0) {
							contentInstance.__get__collections({"include": {"owners": "profiles"}}, function (err, collectionInstances) {
								if (!err) {
									// Send email to teacher about new Session request
									var incomingCollectionInstance = collectionInstances[0];
									availabilityInstances = availabilityInstances.sort((a, b) => (moment(a.startDateTime).isAfter(moment(b.startDateTime)) ? 1 : -1));
									var formattedDate = moment(availabilityInstances[0].startDateTime).format('Do MMM');
									var startTime = moment(availabilityInstances[0].startDateTime).format('h:mm a');
									var endTime = moment(availabilityInstances[availabilityInstances.length - 1].startDateTime).add(60, 'minutes').format('h:mm a');
									if (ctx.args.data.hasOwnProperty('sessionIsApproved') && ctx.args.data.sessionIsApproved === true) {
										// Send email to teacher
										var message = {teacherName: incomingCollectionInstance.toJSON().owners[0].profiles[0].first_name + ' ' + incomingCollectionInstance.toJSON().owners[0].profiles[0].last_name, formattedDate: formattedDate, startTime: startTime, endTime: endTime};
										var renderer = loopback.template(path.resolve(__dirname, '../../server/views/sessionRequestApprovedStudent.ejs'));
										var html_body = renderer(message);
										loopback.Email.send({
											to: studentInstances[0].toJSON().email,
											from: 'Peerbuds <noreply@mx.peerbuds.com>',
											subject: 'Peer session request approved!',
											html: html_body
										})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});
										
										// Create notification
										var Notification = app.models.notification;
										var notifData = {
											type: "action",
											title: "Session request approved!",
											description: "%username% has approved your request to start a peer session on %sessionDate% for %sessionHours%.",
											actionUrl: ["console","learning","sessions"]
										};
										Notification.createNotification(studentInstances[0].toJSON().id, incomingCollectionInstance.toJSON().owners[0].id, notifData, 'content', contentInstance.id, function (err, notificationInstance) {
											if (!err) {
												console.log(notificationInstance);
											}
											else {
												console.log(err);
											}
										});
									}
									else if (ctx.args.data.hasOwnProperty('sessionIsRejected') && ctx.args.data.sessionIsRejected === true) {
										// Send email to teacher
										var message = {teacherName: incomingCollectionInstance.toJSON().owners[0].profiles[0].first_name + ' ' + incomingCollectionInstance.toJSON().owners[0].profiles[0].last_name, formattedDate: formattedDate, startTime: startTime, endTime: endTime};
										var renderer = loopback.template(path.resolve(__dirname, '../../server/views/sessionRequestRejectedStudent.ejs'));
										var html_body = renderer(message);
										loopback.Email.send({
											to: studentInstances[0].toJSON().email,
											from: 'Peerbuds <noreply@mx.peerbuds.com>',
											subject: 'Peer session request rejected!',
											html: html_body
										})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});
										
										// Create notification
										var Notification = app.models.notification;
										var notifData = {
											type: "action",
											title: "Session request rejected!",
											description: "%username% has rejected your request to start a peer session on %sessionDate% for %sessionHours%.",
											actionUrl: ["console","learning","sessions"]
										};
										Notification.createNotification(studentInstances[0].toJSON().id, incomingCollectionInstance.toJSON().owners[0].id, notifData, 'content', contentInstance.id, function (err, notificationInstance) {
											if (!err) {
												console.log(notificationInstance);
											}
											else {
												console.log(err);
											}
										});
									}
									next();
								}
								else {
									console.log('Could not send email to student for session status');
									next(err);
								}
							});
						} else {
							console.log('Could not get participants for this content');
							next(err);
						}
					});
				} else {
					console.log('Could not find availability instances');
					next(err);
				}
			});
		}
		else {
			// Update is not for session content. Skip.
			next();
		}
	});
	
	Content.getCookieUserId = function (req) {
		
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
