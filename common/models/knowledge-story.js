'use strict';
const _ = require('lodash');
let loopback = require('loopback');
let path = require('path');
let g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Knowledgestory) {
    Knowledgestory.validatesInclusionOf('status', { in: ['approved', 'pending', 'rejected'] });
    Knowledgestory.validatesInclusionOf('visibility', { in: ['private', 'public'] });
	
	Knowledgestory.beforeRemote('prototype.__link__peer', function (ctx, peerLinkInstance, next) {
		// A new peer was added to knowledge story view list. Send email to owner.
        console.log('New viewer for knowledge story');
		let loggedinPeer = Knowledgestory.getCookieUserId(ctx.req);
		if (loggedinPeer) {
			Knowledgestory.findById(ctx.instance.id, { include: [{'protagonist': 'profiles'}, 'topics'] }, function (err, knowledgeStoryInstance) {
				if (!err) {
                    Knowledgestory.app.models.peer.findById(loggedinPeer, { include: 'profiles' }, function (err, viewerInstance) {
                        if (!err) {
                            // Send email to owner
                            const storyOwnerName = _.upperFirst(knowledgeStoryInstance.protagonist()[0].profiles()[0].first_name) + ' ' +  _.upperFirst(knowledgeStoryInstance.protagonist()[0].profiles()[0].last_name);
                            const storyTopics = _.uniq(knowledgeStoryInstance.topics().map(topic => topic.name)).toString();
                            const storyStatus = knowledgeStoryInstance.status;
                            const storyVisibility = knowledgeStoryInstance.visibility;
                            const storyViewerName = _.upperFirst(viewerInstance.profiles()[0].first_name) + ' ' +  _.upperFirst(viewerInstance.profiles()[0].last_name);
                            const storyViewerImage = viewerInstance.profiles()[0].picture_url;
                            const storyId = knowledgeStoryInstance.id;
                            let message = {
                                storyOwnerName: storyOwnerName,
                                storyTopics: storyTopics,
                                storyStatus: storyStatus,
                                storyVisibility: storyVisibility,
                                storyViewerName: storyViewerName,
                                storyViewerImage: storyViewerImage,
                                storyId: storyId
                            };
                            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newViewerForKnowledgeStory.ejs'));
                            let html_body = renderer(message);
                            loopback.Email.send({
                                to: knowledgeStoryInstance.protagonist()[0].email,
                                from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                subject: storyViewerName + ' has requested to view your knowledge story',
                                html: html_body
                            })
                                    .then(function (response) {
                                        console.log('email sent! - ' + response);
                                    })
                                    .catch(function (err) {
                                        console.log('email error! - ' + err);
                                    });
                            next();
                        }
                        else {
                            next(new Error('Could not find viewer details'));
                        }
                    });
				}
				else {
					next(new Error('Could not find knowledge story details'));
				}
			});
		}
		else {
			next(new Error('Could not find logged in peer ID'));
		}
	});
	
	Knowledgestory.afterRemote('prototype.patchAttributes', function(ctx, newInstance, next) {
	    let knowledgeStoryInstance = ctx.instance;
	    // Story approved. Send email to viewers.
	    if (knowledgeStoryInstance.status === 'pending') {
	        next();
        } else {
		    knowledgeStoryInstance.__get__protagonist({'include': 'profiles'}, function (err, ownerInstance) {
			    if (err) {
				    next(err);
			    } else {
				    knowledgeStoryInstance.__get__peer({'include': 'profiles'}, function(err, viewerInstances) {
					    if (err) {
						    next(err);
					    } else {
						    viewerInstances.forEach(viewInstance => {
							    // Send email to viewers
							    const ownerName = _.upperFirst(ownerInstance[0].profiles()[0].first_name) + ' ' + _.upperFirst(ownerInstance[0].profiles()[0].last_name);
							    const ownerImage = ownerInstance[0].profiles()[0].picture_url;
							    const viewerName = _.upperFirst(viewInstance.profiles()[0].first_name) + ' ' + _.upperFirst(viewInstance.profiles()[0].last_name);
							    const decision = knowledgeStoryInstance.status;
							    const storyId = knowledgeStoryInstance.id;
							    const ownerId = ownerInstance[0].id;
							    let message = {
								    ownerImage: ownerImage,
								    ownerName: ownerName,
								    viewerName: viewerName,
                                    decision: decision,
                                    storyId: storyId,
                                    ownerId: ownerId
							    };
							    let renderer;
							    if (knowledgeStoryInstance.status === 'approved') {
								    renderer = loopback.template(path.resolve(__dirname, '../../server/views/knowledgeStoryApproved.ejs'));
                                } else {
								    renderer = loopback.template(path.resolve(__dirname, '../../server/views/knowledgeStoryRejected.ejs'));
                                }
							    let html_body = renderer(message);
							    loopback.Email.send({
								    to: viewInstance.email,
								    from: 'Peerbuds <noreply@mx.peerbuds.com>',
								    subject: ownerName + ' has ' + knowledgeStoryInstance.status + ' your knowledge story request',
								    html: html_body
							    })
									    .then(function (response) {
										    console.log('email sent! - ');
									    })
									    .catch(function (err) {
										    console.log('email error! - ' + err);
									    });
						    });
						    next();
					    }
				    });
			    }
		    });
        }
    });
	
	Knowledgestory.getCookieUserId = function (req) {
		
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
