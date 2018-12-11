'use strict';
var loopback = require('loopback');
var path = require('path');

module.exports = function(Contentquestion) {
	
	Contentquestion.notifyOwner = function(id, req, cb) {
		// Send email & notification to owner if answers received to quiz
		var loggedinPeer = Contentquestion.getCookieUserId(req);
		if (loggedinPeer) {
			Contentquestion.findById(id, { include: [{'contents': ['questions', {'collections': ['calendars', {'owners': 'profiles'}]}]}, {'answers': 'peer'}]}, function (err, questionInstance) {
				if (!err && questionInstance) {
					Contentquestion.app.models.peer.findById(loggedinPeer, { include: 'profiles' }, function (err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							// Send email to owner when all required questions have been answered
							// Send email to owner
							var message = {
								participantId: loggedinPeerInstance.id,
								participantImage: loggedinPeerInstance.profiles[0].picture_url,
								participantHeadline: loggedinPeerInstance.profiles[0].headline,
								participantName: loggedinPeerInstance.profiles[0].first_name + ' ' + loggedinPeerInstance.profiles[0].last_name,
								ownerName: questionInstance.contents()[0].collections()[0].owners()[0].profiles()[0].first_name,
								quizId: questionInstance.contents()[0].id,
								collectionId: questionInstance.contents()[0].collections()[0].id,
								calendarId: questionInstance.contents()[0].collections()[0].calendars[0].id,
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
							cb(null, {result: 'success'});
						}
						else {
							cb(new Error('Could not find logged in user'));
						}
					});
				}
				else {
					cb(new Error('Could not find question'));
				}
			});
		}
		else {
			cb(new Error('Could not find user from cookie'));
		}
	};
	
	Contentquestion.remoteMethod(
			'notifyOwner',
			{
				accepts: [
					{ arg: 'id', type: 'string', required: true },
					{ arg: 'req', type: 'object', http: { source: 'req' } },
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/:id/notifyOwner', verb: 'post' }
			}
	);
	
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
