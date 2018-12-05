'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
var moment = require('moment');
var app = require('../../server/server');

module.exports = function(Contentquestion) {
	
	Contentquestion.afterRemote('prototype.__create__answers', function (ctx, newAnswerInstance, next) {
		// Send email & notification to owner if answers received to quiz
		var loggedinPeer = Contentquestion.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Contentquestion.findById(ctx.instance.id, { include: [{'contents': ['questions', {'collections': {'owners': 'profiles'}}]}, {'answers': 'peer'}]}, function (err, questionInstance) {
				if (!err && questionInstance) {
					Contentquestion.app.models.peer.findById(loggedinPeer, { include: 'profiles' }, function (err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							
							let requiredQuestions = 0;
							questionInstance.contents()[0].questions().forEach(question => {
								if (question.isRequired) {
									requiredQuestions++;
								}
							});
							let receivedAnswers = 0;
							if (questionInstance.answers()) {
								questionInstance.answers().forEach(answer => {
									if (answer.peer && answer.peer[0].id === loggedinPeer) {
										receivedAnswers++;
									}
								});
							}
							console.log('requiredQuestions = ' + requiredQuestions);
							console.log('receivedAnswers = ' + receivedAnswers);
							if (receivedAnswers === requiredQuestions) {
								// Send email to owner when all required questions have been answered
								// Send email to owner
								var message = {
									participantName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name,
									ownerName: questionInstance.contents()[0].collections()[0].owners()[0].profiles()[0].first_name,
									quizId: questionInstance.contents()[0].id,
									collectionId: questionInstance.contents()[0].collections()[0].id,
									collectionType: questionInstance.contents()[0].collections()[0].type,
									quizTitle: questionInstance.contents()[0].title,
									collectionTitle: questionInstance.contents()[0].collections()[0].title
								};
								var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newSubmissionForQuiz.ejs'));
								var html_body = renderer(message);
								loopback.Email.send({
									to: questionInstance.contents()[0].collections()[0].owners()[0].email,
									from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
									subject: 'New submission on your quiz',
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
						}
						else {
							next(new Error('Could not find logged in user'));
						}
					});
				}
				else {
					next(new Error('Could not find question'));
				}
			});
		}
		else {
			next(new Error('Could not find user from cookie'));
		}
	});
	
	Contentquestion.getCookieUserId = function (req) {
		
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
