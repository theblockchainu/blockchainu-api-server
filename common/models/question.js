'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');
let protocolUrl = app.get('protocolUrl');
let request = require('request');
let _ = require('lodash');

module.exports = function(Question) {
	
	Question.afterRemote('prototype.__create__answers', function (ctx, newAnswerInstance, next) {
		// Send email & notification to owner if upvote received
		let loggedinPeer = Question.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Question.findById(ctx.instance.id, {}, function (err, questionInstance) {
				if (!err) {
					Question.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							
							const body = {
								peerAddress: loggedinPeerInstance.ethAddress,
								hash: 'NA'
							};
							console.log(body);
							request
									.put({
										url: protocolUrl + 'questions/' + questionInstance.id + '/answers/rel/' + newAnswerInstance.id,
										body: body,
										json: true
									}, function (err, response, data) {
										if (err) {
											console.error(err);
										} else {
											console.log('Added answer on blockchain: ' + data);
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
					next(new Error('Could not find community'));
				}
			});
		}
		else {
			next(new Error('Could not find user from cookie'));
		}
	});
	
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
	
	Question.acceptAnswer = function(id, fk, body, req, cb) {
		
		let loggedinPeer = Question.getCookieUserId(req);
		let questionInst;
		let answerInst;
		
		Question.findById(id, {include: ['peer', 'communities']})
				.then(question => {
					questionInst = _.clone(question);
					Question.app.models.answer.findById(fk, {include: 'peer'})
							.then(answer => {
								question.open = false;
								answer.accept = true;
								answerInst = _.clone(answer);
								answer.unsetAttribute('peer');
								console.log(answer.toJSON());
								return answer.save();
							})
							.then(answerInstance => {
								console.log(answerInstance);
								question.unsetAttribute('peer');
								question.unsetAttribute('communities');
								return question.save();
							})
							.then(questionInstance => {
								console.log(questionInstance);
								return Question.app.models.peer.findById(loggedinPeer, {include: ['profiles']});
							})
							.then(loggedinPeerInstance => {
								let message = {
									actorName: loggedinPeerInstance.profiles()[0].first_name + ' ' + loggedinPeerInstance.profiles()[0].last_name,
									itemType: 'answer',
									itemText: answerInst.text,
									gyanAmount: questionInst.gyan
								};
								let renderer = loopback.template(path.resolve(__dirname, '../../server/views/acceptAnswer.ejs'));
								let html_body = renderer(message);
								loopback.Email.send({
									to: answerInst.peer()[0].email,
									from: 'Peerbuds <noreply@mx.peerbuds.com>',
									subject: 'Answer accepted!',
									html: html_body
								})
										.then(function (response) {
											console.log('email sent! - ' + response);
										})
										.catch(function (err) {
											console.log('email error! - ' + err);
										});
								
								let actionUrl = [];
								if (questionInst.communities()) {
									actionUrl = ['community', questionInst.communities()[0].id];
								}
								
								request
										.put({
											url: protocolUrl + 'questions/' + id + '/answers/' + fk,
											body: body,
											json: true
										}, function (err, response, data) {
											if (err) {
												console.error(err);
												cb(err);
											} else {
												console.log('Accepted answer on blockchain: ' + data);
											}
										});
								
								// Create notification
								let Notification = app.models.notification;
								let notifData = {
									type: "action",
									title: "Answer accepted",
									description: "%username% has accepted your answer.",
									actionUrl: actionUrl
								};
								Notification.createNotification(answerInst.peer()[0].id, questionInst.peer()[0].id, notifData, 'community', questionInst.communities()[0].id, function(err, notificationInstance) {
									if (!err) {
										console.log('Notification created for user: ' + notificationInstance);
										cb(null, answerInst);
									} else {
										cb(err);
									}
								});
								
							})
							.catch(err => {
								cb(err);
							});
				})
				.catch(err => {
					cb(err);
				});
	};
	
	Question.remoteMethod(
			'acceptAnswer',
			{
				description: 'Accept an answer of this question',
				accepts: [
					{ arg: 'id', type: 'string', required: true },
					{ arg: 'fk', type: 'string', required: true },
					{ arg: 'body', type: 'object', http: { source: 'body' } },
					{ arg: 'req', type: 'object', http: { source: 'req' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { verb: 'post', path: '/:id/answers/:fk/accept' }
			}
	);
	
	Question.getCookieUserId = function (req) {
		
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
