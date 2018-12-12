'use strict';
let app = require('../../server/server');
let protocolUrl = app.get('protocolUrl');
let request = require('request');

module.exports = function(Community) {
	Community.afterRemote('prototype.__create__questions', function (ctx, newQuestionInstance, next) {
		// Send email & notification to owner if upvote received
		let loggedinPeer = Community.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Community.findById(ctx.instance.id, {include: ['topics']}, function (err, communityInstance) {
				if (!err) {
					Community.app.models.peer.findById(loggedinPeer, {include: 'profiles'}, function(err, loggedinPeerInstance) {
						if (!err) {
							loggedinPeerInstance = loggedinPeerInstance.toJSON();
							const topicArray = [];
							communityInstance.topics().forEach(topic => {
								topicArray.push(topic.name);
							});
							const body = {
								uniqueId: newQuestionInstance.id,
								communityId: communityInstance.id,
								peerAddress: loggedinPeerInstance.ethAddress,
								scholarshipId: newQuestionInstance.scholarshipId ? newQuestionInstance.scholarshipId : 'NA',
								hash: 'NA',
								gyan: newQuestionInstance.gyan,
								topics: topicArray
							};
							console.log(body);
							request
									.post({
										url: protocolUrl + 'questions',
										body: body,
										json: true
									}, function (err, response, data) {
										if (err) {
											console.error(err);
										} else if (data && data.error) {
											console.error(data.error);
										} else {
											console.log('Added question on blockchain: ' + data);
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
	
	Community.getCookieUserId = function (req) {
		
		let cookieArray = req.headers.cookie.split(';');
		let cookie = '';
		for (let i = 0; i < cookieArray.length; i++) {
			if (cookieArray[i].split('=')[0].trim() === 'userId') {
				cookie = cookieArray[i].split('=')[1].trim();
			}
		}
		console.log('User ID from cookie is: ' + cookie.split(/[ \:.]+/)[0]);
		return cookie.split(/[ \:.]+/)[0];
	};
};
