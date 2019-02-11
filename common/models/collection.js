'use strict';
let loopback = require('loopback');
let app = require('../../server/server');
let path = require('path');
let g = require('../../node_modules/loopback/lib/globalize');
let moment = require('moment');
let protocolUrl = app.get('protocolUrl');
let request = require('request');
const Promise = require('bluebird');
const requestPromise = require('request-promise-native');
let _ = require('lodash');
const fs = require('fs');

module.exports = function (Collection) {

	Collection.validatesUniquenessOf('genericId');


	Collection.validatesInclusionOf('subCategory', {
		in:
			['workshop', 'hackathon', 'meetup', 'bootcamp', 'self paced', 'instructor led', 'lab', 'bug', 'competitive', 'hackathon', 'hiring', 'token']
	});
	
	Collection.afterRemote('prototype.__link__participants', function (ctx, participantInstance, next) {
		const participantId = participantInstance.sourceId;
		const calendarId = participantInstance.calendarId;
		const collectionInstance = ctx.instance;
		let scholarshipId;
		if (ctx.req.body.scholarshipId && ctx.req.body.scholarshipId.length > 0) {
			scholarshipId = ctx.req.body.scholarshipId;
		} else {
			scholarshipId = '';
		}
		Collection.addParticipant(collectionInstance, participantId, calendarId, scholarshipId)
				.then((result) => {
					console.log(result);
					next();
				})
				.catch(err => {
					console.log(err);
					next(err);
				});
	});
	
	
	/**
	 *  1. Link all collection topics to peer
	    2. Create a notification for the owner
	    3. Add user to the collection's chat room
	    4. Create a User Joined system message in chat room
	    5. Add user participation on Blockchain
	    6. Send email to user and owner
	    7. If Guide - check if user has an existing corestack course subscription
	    8. If Guide - register user on Corestack for this course
	    9. Send response back to client
	 * @param collectionInstance
	 * @param participantId
	 * @param calendarId
	 * @param scholarshipId
	 * @returns {Promise<T>}
	 */
	Collection.addParticipant = function(collectionInstance, participantId, calendarId, scholarshipId) {
		// New participant added to collection. Notify collection owner.
		let participantUserInstance, notificationInstance, roomInstance, ownerInstance;
		
		const checkAndAddtoCorestack = function (params) {
			// if collection is a guide join participant to corestack
			if (collectionInstance.type === 'guide') {
				
				const registerOnCorestack = function () {
					collectionInstance.__get__calendars({}, (error, calendarInstances) => {
						const participantJSON = participantUserInstance.toJSON();
						let username;
						if (participantJSON.id) {
							username = participantJSON.id;
							if (username.length > 10) {
								username = username.slice(0, 9);
							}
						} else {
							username = '';
						}
						console.log('registering on corestack with username: ');
						console.log(username);
						const calendar = calendarInstances[0].toJSON(); // assuming there's only one calendar in guides
						const student_id = participantJSON.id;
						const student_name = participantJSON.profiles[0].first_name + ' ' + participantJSON.profiles[0].last_name;
						const student_email = participantJSON.email;
						const course_id = collectionInstance.corestackCourseId;
						const course_start_date = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
						const course_end_date = moment(calendar.endDate).add('30', 'days').format('YYYY-MM-DD');
						console.log('EndDate: ' + course_end_date);
						const corestackScriptPath = collectionInstance.corestackScriptPath;
						Collection.app.models.corestack_student.registerStudent(
								student_id,
								student_name,
								student_email,
								course_id,
								course_start_date,
								username,
								course_end_date,
								corestackScriptPath
						).then(corestackStudentInstance => {
							console.log('connecting Corestack student');
							collectionInstance.__link__corestackStudents(corestackStudentInstance.id, (corestackStudentRelationerr, corestackStudentRelation) => {
								if (corestackStudentRelationerr) {
									console.log('corestackStudentRelationerr');
									console.log(corestackStudentRelationerr);
								} else {
									console.log('corestackStudentRelation SUCCESS');
									console.log(corestackStudentRelation);
								}
								participantUserInstance.__link__corestackStudent(corestackStudentInstance.id, (peerCorestackRelationInstanceerr, peerCorestackRelationInstance) => {
									if (peerCorestackRelationInstanceerr) {
										console.log('peerCorestackRelationInstanceErr');
										console.log(peerCorestackRelationInstanceerr);
									} else {
										console.log('peerCorestackRelationInstance SUCCESS');
										console.log(peerCorestackRelationInstance);
									}
								});
							});
							Promise.resolve({'result': 'success'});
						}).catch(err => {
							console.log('registerStudentError');
							console.log(err);
							Promise.reject(err);
						});
					});
				};
				
				const query = {
					where: {
						student_id: participantUserInstance.id
					},
					include: [
						'peer',
						'collections'
					]
				};
				
				Collection.app.models.corestack_student.find(query, (errorcorestackStudents, corestackStudents) => {
					console.log('corestackStudents');
					console.log(corestackStudents);
					if (errorcorestackStudents) {
						console.log('Error in fetching students in DB');
						Promise.reject(errorcorestackStudents);
					} else {
						const studentIsPresent = corestackStudents.find(student => {
							const studentJSON = student.toJSON();
							return studentJSON.peer[0].id === participantUserInstance.id;
						});
						const existingStudent = studentIsPresent ? studentIsPresent.toJSON() : false;
						if (!existingStudent) {
							// If student is not registered on corestack
							registerOnCorestack();
						} else {
							// If student is already registered on corestack
							const hasJoinedThisCollection = existingStudent.collections.some(collection => collection.id === collectionInstance.id);
							if (hasJoinedThisCollection) {
								console.log('student already added to the collection');
								Promise.resolve({'result': 'success'});
							} else {
								console.log('add this collection to the existing student\s record');
								collectionInstance.__link__corestackStudents(existingStudent.id, (corestackStudentRelationerr, corestackStudentRelation) => {
									if (corestackStudentRelationerr) {
										console.log('corestackStudentRelationerr');
										console.log(corestackStudentRelationerr);
									} else {
										console.log('corestackStudentRelation');
										console.log(corestackStudentRelation);
									}
								});
								Promise.resolve({'result': 'success'});
							}
						}
					}
				});
				
			} else {
				Promise.resolve({'result': 'success'});
			}
		};
		
		return Collection.app.models.peer.findById(participantId, { "include": ["profiles", "scholarships_joined"] })
				.then((participantUserInst) => {
					participantUserInstance = participantUserInst;
					// Link all topics of this collection to the participant as topics learning
					return collectionInstance.topics.getAsync();
				})
				.then((topicInstances) => {
					topicInstances.forEach(topicInstance => {
						participantUserInstance.__link__topicsLearning(topicInstance.id, function (err1, linkedTopicInstance) {
							if (!err1) {
								//console.log('Linked topic ' + topicInstance.name + ' to ' + participantUserInstance.toJSON().profiles[0].first_name);
							}
							else {
								console.log(err1);
							}
						});
					});
					return Promise.all(topicInstances);
				})
				.then((topicInstances) => {
					// Get owner instance
					return collectionInstance.owners.getAsync({ "include": "profiles" });
				})
				.then((ownerInstances) => {
					console.log(ownerInstances);
					const inst = ownerInstances[0];
					return collectionInstance.owners.findById(inst.id, {'include': {'profiles' : 'phone_numbers'}});
				})
				.then((collectionOwnerInstance) => {
					ownerInstance = collectionOwnerInstance;
					return ownerInstance.notifications.create({
						type: "action",
						title: "New Participant!",
						description: "%username% joined %collectionTitle%",
						actionUrl: [collectionInstance.type, collectionInstance.id, "calendar", calendarId]
					});
				})
				.then((notificationInst) => {
					notificationInstance = notificationInst;
					return notificationInstance.actor.add(participantId);
				})
				.then((actorInstance) => {
					return notificationInstance.collection.add(collectionInstance.id);
				})
				.then((linkedCollectionInstance) => {
					// Add this participant to the collection's chat room
					return collectionInstance.rooms.getAsync();
				})
				.then((roomInsts) => {
					return collectionInstance.rooms.findById(roomInsts[0].id);
				})
				.then((roomInst) => {
					roomInstance = roomInst;
					return roomInstance.participants.add(participantUserInstance.id);
				})
				.then((linkedChatParticipantInstance) => {
					console.log('Added participant to chat room');
					// Add a new system message about new participant
					let messageObject = {
						text: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " joined ",
						type: 'system'
					};
					return roomInstance.messages.create(messageObject);
				})
				.then((newMessageInstance) => {
					Collection.app.io.in(roomInstance.id).emit('message', newMessageInstance.toJSON());
					
					// Record student participation in an experience on blockchain
					return requestPromise.put({
								url: Collection.app.get('protocolUrl') + 'collections/' + collectionInstance.id + '/peers/rel/' + participantUserInstance.ethAddress,
								body: {
									scholarshipId: scholarshipId
								},
								json: true
							});
				})
				.then((blockchainResponse) => {
					console.log('STUDENT PARTICIPATION ON BLOCKCHAIN IN PROGRESS: ' + blockchainResponse);
					
					// Send email to the student welcoming him to course
					let message = {
						type: collectionInstance.type,
						title: collectionInstance.title,
						owner: ownerInstance.toJSON(),
						collectionId: collectionInstance.id,
						calendarId: calendarId,
					};
					let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newParticipantOnCollectionStudent.ejs'));
					let html_body = renderer(message);
					loopback.Email.send({
						to: participantUserInstance.email,
						from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
						subject: '[Welcome] ' + collectionInstance.title,
						html: html_body
					})
							.then(function (response) {
								console.log('email sent! - ');
							})
							.catch(function (err) {
								console.log('email error! - ' + err);
							});
					
					// Send email to the teacher informing about new student
					message = { type: collectionInstance.type, title: collectionInstance.title, student: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name, collectionId: collectionInstance.id, calendarId: calendarId };
					renderer = loopback.template(path.resolve(__dirname, '../../server/views/newParticipantOnCollectionTeacher.ejs'));
					html_body = renderer(message);
					loopback.Email.send({
						to: ownerInstance.email,
						from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
						subject: 'New Participant for ' + collectionInstance.title,
						html: html_body
					})
							.then(function (response) {
								console.log('email sent! - ');
							})
							.catch(function (err) {
								console.log('email error! - ' + err);
							});
					
					// Add student to CodeLabs and resolve the promise based on that.
					checkAndAddtoCorestack();
					
				})
				.catch((err) => {
					console.log(err);
					Promise.reject(err);
				});
	};
	
	/**
	 * Remote Hook : Add a new comment to a collection
	 * If comment is an announcement, send email to all students
	 */
	Collection.afterRemote('prototype.__create__comments', function (ctx, newCommentInstance, next) {
		// Send email to all students if an announcement is made by the teacher
		if (newCommentInstance.toJSON().isAnnouncement) {
			let loggedinPeer = Collection.getCookieUserId(ctx.req);
			if (loggedinPeer) {
				Collection.findById(ctx.instance.id, { include: [{ 'participants': 'profiles' }, 'owners'] }, function (err, collectionInstance) {
					if (!err) {
						Collection.app.models.peer.findById(collectionInstance.toJSON().owners[0].id, { include: 'profiles' }, function (err, collectionOwnerInstance) {
							if (!err) {
								collectionInstance.toJSON().participants.forEach(participant => {
									// Send email to every participant
									let message = { studentName: participant.profiles[0].first_name, teacherName: collectionOwnerInstance.toJSON().profiles[0].first_name + ' ' + collectionOwnerInstance.toJSON().profiles[0].last_name, announcement: newCommentInstance.description, collectionTitle: collectionInstance.toJSON().title };
									let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newAnnouncementToStudents.ejs'));
									let html_body = renderer(message);
									loopback.Email.send({
										to: participant.email,
										from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
										subject: 'New announcement from teacher',
										html: html_body
									})
										.then(function (response) {
											console.log('email sent! - ' + response);
										})
										.catch(function (err) {
											console.log('email error! - ' + err);
										});
								});
								next();
							}
							else {
								next(new Error('Could not find collection owner'));
							}
						});
					}
					else {
						next(new Error('Could not find collection'));
					}
				});
			}
			else {
				next(new Error('Could not find logged in peer ID'));
			}
		}
		else {
			next();
		}
	});
	
	/**
	 * Remote Hook: Add a new cohort to a collection
	 * Send an email to all users following a course about new cohorts added
	 */
	Collection.afterRemote('prototype.__create__calendars', function (ctx, newCalendarInstances, next) {
		console.log(newCalendarInstances);
		if (newCalendarInstances && newCalendarInstances.length > 0) {
			const calendarObj = newCalendarInstances[0];
			console.log('Created calendar');
			const query = {
				'include': [
					{
						'collection': [
							'calendars',
							{ 'peersFollowing': 'profiles' }
						]
					}
				]
			};
			Collection.app.models.calendar.findById(calendarObj.id, query,
				function (err, calendarInstanceObject) {
					if (err) {
						console.log('err');
						console.log(err);
					} else if (calendarInstanceObject) {
						const calendarInstance = calendarInstanceObject.toJSON();
						const now = moment();
						const upComingCalendars = [];
						calendarInstance.collection[0].calendars.forEach(calendar => {
							const startMoment = moment(calendar.startDate);
							if (startMoment.isAfter(now)) {
								upComingCalendars.push(
									{
										formated: startMoment.format('dddd, MMMM Do YYYY, h:mm a'),
										startDate: calendar.startDate
									});
							}
						});

						if (upComingCalendars.length > 0) {
							upComingCalendars.sort((a, b) => {
								const startMomentA = moment(a.startDate);
								const startMomentB = moment(b.startDate);
								return startMomentA.diff(startMomentB);
							});

							if (calendarInstance.collection[0] && calendarInstance.collection[0].peersFollowing) {
								calendarInstance.collection[0].peersFollowing.forEach((peer) => {
									let message = {
										participantName: peer.profiles[0].first_name + ' ' + peer.profiles[0].last_name,
										calendars: upComingCalendars,
										collectionId: calendarInstance.collection[0].id,
										type: calendarInstance.collection[0].type,
										collectionTitle: calendarInstance.collection[0].title
									};
									console.log(message);
									let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newCohortAdded.ejs'));
									let html_body = renderer(message);
									console.info('fetching peers');

									// console.log(peerInstances);

									loopback.Email.send({
										to: peer.email,
										from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
										subject: 'Announcing new batches for course ' + calendarInstance.collection[0].title + '!',
										html: html_body
									},
										(err, mail) => {
											console.log('email sent to' + peer.email);
										}
									);

								});
							}
						}
					} else {
						console.log('calendar not found');

					}

				});
		}
		next();
	});
	
	/**
	 * Cookie fetch utility function
	 * @param req
	 * @returns {string}
	 */
	Collection.getCookieUserId = function (req) {

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
	
	/**
	 * Remote Hook: Remove a participant from a collection
	 * 1. Create a notification for owner
	 * 2. Drop student participation on Blockchain
	 * 3. Send email to student and owner
	 * 4. Remove user from chat room
	 * 5. Add a 'Dropped User' system message in chat room
	 */
	Collection.afterRemote('prototype.__unlink__participants', function (ctx, participantLinkInstance, next) {
		// Participant canceled collection. Notify collection owner.
		let collectionInstance = ctx.instance;
		let participantId = ctx.args.fk;
		Collection.app.models.peer.findById(participantId, { "include": "profiles" }, function (err, participantUserInstance) {
			if (err) {
				next(err);
			}
			else {
				collectionInstance.__get__owners({ "include": "profiles" }, function (err, ownerInstances) {
					if (err) {
						next(err);
					}
					else {
						let ownerInstance = ownerInstances[0];
						ownerInstance.__create__notifications({
							type: "action",
							title: "Cancelled participation",
							description: "%username% cancelled participation for %collectionTitle%",
							actionUrl: [collectionInstance.type, collectionInstance.id]
						}, function (err, notificationInstance) {
							if (err) {
								next(err);
							}
							else {
								notificationInstance.actor.add(participantId, function (err, actorInstance) {
									if (err) {
										next(err);
									}
									else {
										notificationInstance.collection.add(collectionInstance.id, function (err, linkedCollectionInst) {
											if (err) {
												next(err);
											}
											else {

												// Drop student from collection on blockchain
												request
													.delete({
														url: Collection.app.get('protocolUrl') + 'collections/' + collectionInstance.id + '/peers/rel/' + participantUserInstance.ethAddress,
														body: {
															scholarshipId: ctx.req.body.scholarshipId
														},
														json: true
													}, function (err, response, data) {
														if (err) {
															console.error(err);
														} else if (data && data.error) {
															console.error(data);
														} else {
															console.log('DROPPED STUDENT PARTICIPATION ON BLOCKCHAIN ' + data);
														}
													});

												// Send email to the user confirming cancellation
												let message = { heading: "You have cancelled your participation for - " + collectionInstance.title + ". \n\n If you are eligible for a refund, it'll be credited to your account in 7 working days." };
												let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
												let html_body = renderer(message);
												loopback.Email.send({
													to: participantUserInstance.email,
													from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
													subject: 'Participation cancelled for ' + collectionInstance.title,
													html: html_body
												})
													.then(function (response) {
														console.log('email sent! - ');
													})
													.catch(function (err) {
														console.log('email error! - ' + err);
													});

												// Send email to the teacher informing about cancelled student
												message = { heading: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " has dropped out of " + collectionInstance.title };
												html_body = renderer(message);
												loopback.Email.send({
													to: ownerInstance.email,
													from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
													subject: 'A student un-enrolled from course ' + collectionInstance.title,
													html: html_body
												})
													.then(function (response) {
														console.log('email sent! - ');
													})
													.catch(function (err) {
														console.log('email error! - ' + err);
													});

												// Remove the user from chat room
												collectionInstance.__get__rooms({}, function (err, roomInstances) {
													if (!err) {
														if (roomInstances.length > 0) {
															roomInstances[0].__unlink__participants(participantUserInstance.id, function (err, unlinkedParticipantInstance) {
																if (!err) {
																	console.log('Removed participant from room');
																	// Add a new system message about new participant
																	let messageObject = {
																		text: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " left ",
																		type: 'system'
																	};
																	roomInstances[0].__create__messages(messageObject, function (err, newMessageInstance) {
																		if (!err) {
																			Collection.app.io.in(roomInstances[0].id).emit('message', newMessageInstance.toJSON());
																			ctx.res.json(participantUserInstance);
																		}
																		else {
																			next(new Error('Could not create system message'));
																		}
																	});
																}
																else {
																	next(err);
																}
															});
														}
														else {
															ctx.res.json(participantUserInstance);
														}
													}
													else {
														next(err);
													}
												});
											}
										});
									}
								});
							}
						});
					}
				});

				// if collection is a guide unlink participant from corestack
				// if (collectionInstance.type === 'guide') {
				// 	console.log('deregistering_corestack_student');
				// 	const removeFromCoreStack = (corestackStudent) => {
				// 		const participantJSON = participantUserInstance.toJSON();
				// 		Collection.app.models.corestack_student.deregisterStudent(
				// 			corestackStudent.student_id, 'ETHEREUM'
				// 		).then(corestackStudentInstance => {
				// 			console.log('Email Corestack student the he has been de registered');
				// 			let message = {
				// 				guideUrl: 'https://theblockchainu.com/guide/' + collectionInstance.customUrl,
				// 				guideTitle: collectionInstance.title.toUpperCase()
				// 			};
				// 			let renderer = loopback.template(path.resolve(__dirname, '../../server/views/corestackDeActivated.ejs'));
				// 			let html_body = renderer(message);
				// 			return loopback.Email.send({
				// 				to: participantJSON.email,
				// 				from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
				// 				subject: 'Code Labs DeActivated!',
				// 				html: html_body
				// 			});
				// 		}).then(emailInstance => {
				// 			console.log('Email Sent!');
				// 		}).catch(err => {
				// 			console.log('registerStudentError');
				// 			console.log(err);
				// 		});
				// 		return true;
				// 	};
				// 	const query = {
				// 		where: {
				// 			student_id: participantUserInstance.id
				// 		}
				// 	};
				// 	collectionInstance.__get__corestackStudents(query, (errorcorestackStudents, corestackStudents) => {
				// 		console.log('corestackStudents');
				// 		console.log(corestackStudents);
				// 		if (errorcorestackStudents) {
				// 			// removeFromCoreStack();
				// 			console.log('Error in fetching students in DB');
				// 		} else {
				// 			if (corestackStudents) {
				// 				removeFromCoreStack(corestackStudents[0]);
				// 			} else {
				// 				console.log('Student Not added to the collection');
				// 			}
				// 		}
				// 	});

				// }

			}
		});
	});
	
	/**
	 * Submit a collection for review
	 * @param id : ID of the course
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.submitForReview = (id, req, cb) => {
		// Find the collection by given ID
		Collection.findById(id, (err, collectionInstance) => {
			let loggedinPeer = Collection.app.models.peer.getCookieUserId(req);
			// if collection exists and the user is logged in
			if (!err && collectionInstance !== null) {
				//let ownerEmail = collectionInstance.toJSON().owners[0].email;
				collectionInstance.status = 'submitted';
				collectionInstance.isApproved = false;
				if (collectionInstance.type !== 'session') {
					Collection.checkSetUniqueUrl(collectionInstance)
						.then(res => {
							console.log('collectionInstance updated');
							if (collectionInstance.type === 'guide' && collectionInstance.githubUrl !== undefined) {
								console.log('Setting corestack script');
								setCorestackScriptPath(collectionInstance);
							}
						}).catch(err => {
							console.log(err);
							err = new Error(g.f('Error updating collection.'));
							err.statusCode = 400;
							err.code = 'DB_ERROR';
							cb(err);
						});
				} else {
					collectionInstance.save();
				}
				let message = '', subject = '';
				message = { type: collectionInstance.type };
				switch (collectionInstance.type) {
					case 'class':
						subject = 'Online Course submitted for review';
						break;
					case 'experience':
						subject = 'In-person workshop submitted for review';
						break;
					case 'guide':
						subject = 'Learning Guide submitted for review';
						break;
					case 'session':
						subject = 'Account submitted for mentor session review';
						break;
					default:
						subject = 'Collection submitted for review';
						break;
				}
				let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionSubmitted.ejs'));
				let html_body = renderer(message);

				// Create payout rule for this collection
				Collection.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs"] },
					function (err, peerInstance) {
						loopback.Email.send({
							to: peerInstance.toJSON().email,
							from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
							subject: subject,
							html: html_body
						}).then(function (response) {
							console.log('email sent! - ');
						}).catch(function (err) {
							console.log('email error! - ' + err);
						});

						let peerPayoutAccs = peerInstance.toJSON().payoutaccs;
						if (peerPayoutAccs && peerPayoutAccs.length) {

							peerPayoutAccs.forEach(function (payoutaccs) {

								if (payoutaccs.is_default) {
									let payoutRule = {};
									payoutRule.percentage1 = 100;
									payoutRule.payoutId1 = payoutaccs.id;

									collectionInstance.payoutrules.create(payoutRule,
										function (err, payoutRulesInstance) {
											if (err) {
												payoutRulesInstance.destroy();
												cb(err);
											}
										});
								}
							});
						}
					});
				cb(null, 'Submitted for review. Email sent to user.');
			}
			else {
				err = new Error(g.f('Invalid Collection with ID: %s', id));
				err.statusCode = 400;
				err.code = 'INVALID_COLLECTION';
				cb(err);
			}
		});
	};
	
	/**
	 * Create a new shell script from Corestack template script using custom Github URL
	 * @param collectionId : ID of the collection
	 * @param githubUrl : Github repo URL
	 * @param cb: Callback function
	 */
	const getCorestackScriptPath = (collectionId, githubUrl, cb) => {
		const templateShellFilePath = path.resolve(__dirname, '../../server/scripts/corestack_seed_script.sh');
		fs.readFile(templateShellFilePath, (err, data) => {
			if (err) {
				console.log(err);
				cb(err);
			} else {
				const script_string = data.toString();
				const replaced_script_string = script_string.replace('{{GIT_CLONE_URL}}', githubUrl);
				const new_script_buffer = Buffer.from(replaced_script_string);
				const fileName = collectionId + '.sh';
				Collection.app.models.media.uploadBuffer(fileName, new_script_buffer, (awsError, awsData) => {
					if (awsError) {
						cb(awsError);
					} else {
						console.log(awsData);
						cb(null, awsData.Location);
					}
				});
			}
		});
	};
	
	/**
	 * Update a collection with the new custom shell script URL from AWS S3
	 * @param collectionInstance Collection Instance
	 */
	const setCorestackScriptPath = (collectionInstance) => {
		if (!collectionInstance.corestackScriptPath || collectionInstance.corestackScriptPath.length === 0) {
			getCorestackScriptPath(
				collectionInstance.id,
				collectionInstance.githubUrl,
				(getCorestackScriptPathErr, newPath) => {
					if (getCorestackScriptPathErr) {
						console.log('getCorestackScriptPath');
						console.log(getCorestackScriptPath);
					} else {
						console.log(newPath);
						const obj = { corestackScriptPath: newPath };
						Collection.upsertWithWhere({ id: collectionInstance.id }, obj, (saveErr, savedInstance) => {
							if (saveErr) {
								console.log(saveErr);
							} else {
								console.log('Corestack Script saved');
								console.log(savedInstance);
							}
						});
					}
				});
		} else {
			console.log('Corestack Script alredy present');
			console.log(collectionInstance.corestackScriptPath);
		}
	};
	
	/**
	 * Approve a collection submitted for review
	 * 1. Send email to owner
	 * 2. Create a notification for the owner
	 * 3. Create a new chat room
	 * 4. Add owner to the chat room
	 * 5. Create a new 'User Joined' system message in chat room
	 * 6. Add colleciton to Blockchain
	 * @param id : ID of the collection
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.approve = function (id, req, cb) {
		// Find the collection by given ID
		Collection.findById(id, { "include": [{ "owners": "profiles" }, { "assessment_models": ["assessment_rules", "assessment_na_rules"] }, "topics", { "contents": "schedules" }] }, function (err, collectionInstance) {
			// if collection exists and the user is logged in
			if (!err && collectionInstance !== null) {
				let ownerId = collectionInstance.toJSON().owners[0].id;
				let userId = Collection.app.models.peer.getCookieUserId(req);
				let assessmentRules = collectionInstance.toJSON().assessment_models[0] ? collectionInstance.toJSON().assessment_models[0].assessment_rules : [];
				let assessmentNARules = collectionInstance.toJSON().assessment_models[0] ? collectionInstance.toJSON().assessment_models[0].assessment_na_rules : [];
				let contents = collectionInstance.toJSON().contents;
				let topics = collectionInstance.toJSON().topics;
				collectionInstance.status = 'active';
				collectionInstance.isApproved = true;
				collectionInstance.approvedBy = userId;
				delete collectionInstance.owners;
				delete collectionInstance.assessment_models;
				delete collectionInstance.topics;
				Collection.upsertWithWhere({ id: collectionInstance.id }, collectionInstance, function (err, newCollectionInstance) {
					if (err) {
						console.log(err);
						err = new Error(g.f('Error updating collection.'));
						err.statusCode = 400;
						err.code = 'DB_ERROR';
						cb(err);
					}
					else {
						let message = '', subject = '';
						let title = '', description = '', actionUrl = [];
						let customUrl = collectionInstance.customUrl !== undefined && collectionInstance.customUrl.length > 0 ? collectionInstance.customUrl : collectionInstance.id;
						message = { type: collectionInstance.type, customUrl: customUrl };
						switch (collectionInstance.type) {
							case 'class':
								subject = 'Online course approved';
								title = 'Online course approved!';
								description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "18"];
								break;
							case 'experience':
								subject = 'In-person workshop approved';
								title = 'In-person workshop approved!';
								description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "18"];
								break;
							case 'session':
								subject = 'Account Approved for Mentor Sessions';
								title = 'Account Approved for Mentor Sessions!';
								description = "Your account has been approved for sessions. Add finishing touches and invite students now.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "17"];
								break;
							default:
								subject = 'Collection Approved';
								title = 'Collection Approved!';
								description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "18"];
								break;
						}
						let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionApproved.ejs'));
						let html_body = renderer(message);

						// Send email to owner of this collection
						Collection.app.models.peer.findById(ownerId, { "include": "profiles" }, function (err, ownerInstance) {

							if (!err) {
								// Send notification to owner
								ownerInstance.__create__notifications({
									type: "action",
									title: title,
									description: description,
									actionUrl: actionUrl
								}, function (err, notificationInstance) {
									if (err) {
										cb(err);
									}
									else {
										notificationInstance.actor.add(ownerInstance.id, function (err, actorInstance) {
											if (err) {
												cb(err);
											}
											else {
												notificationInstance.collection.add(collectionInstance.id, function (err, linkedCollectionInst) {
													if (err) {
														cb(err);
													}
													else {
														if (collectionInstance.type === 'session') {
															cb(null, { result: 'Collection approved. Email sent to owner.' });
														}
														else {
															// TODO: check if there is an existing room before creating a new one.
															// Create a new chat room for this collection
															let roomValue = {
																name: collectionInstance.title,
																type: 'group'
															};
															collectionInstance.rooms.create(roomValue, function (err, newRoomInstance) {
																if (!err) {
																	console.log('New chat room created for this collection');
																	// Add teacher to the collection's new chat room
																	newRoomInstance.__link__participants(ownerInstance.id, function (err, linkedParticipantInstance) {
																		if (!err) {
																			console.log('Added teacher to chat room');
																			// Add a new system message about new participant
																			let messageObject = {
																				text: ownerInstance.toJSON().profiles[0].first_name + " " + ownerInstance.toJSON().profiles[0].last_name + " joined ",
																				type: 'system'
																			};
																			newRoomInstance.__create__messages(messageObject, function (err, newMessageInstance) {
																				if (!err) {
																					Collection.app.io.in(newRoomInstance.id).emit('message', newMessageInstance.toJSON());

																					// Add this collection to blockchain.
																					const assessmentRuleKeys = [];
																					const assessmentRuleValues = [];
																					const nonAcademicRules = [];
																					const topicArray = [];
																					let learningHours = 0;
																					if (assessmentRules !== undefined && assessmentRules.length > 0) {
																						assessmentRules.forEach(assessmentRule => {
																							assessmentRuleKeys.push(assessmentRule.value);
																							assessmentRuleValues.push(assessmentRule.gyan);
																						});
																					} else {
																						assessmentRuleKeys.push('pass');
																						assessmentRuleKeys.push('fail');
																						assessmentRuleValues.push(100);
																						assessmentRuleValues.push(1);
																					}
																					if (assessmentNARules !== undefined && assessmentRules.length > 0) {
																						assessmentNARules.forEach(assessmentNARule => {
																							if (assessmentNARule.value === 'engagement') {
																								nonAcademicRules[0] = assessmentNARule.gyan;
																							} else if (assessmentNARule.value === 'commitment') {
																								nonAcademicRules[1] = assessmentNARule.gyan;
																							}
																						});
																					} else {
																						nonAcademicRules[0] = 50;
																						nonAcademicRules[1] = 50;
																					}
																					topics.forEach(topic => {
																						topicArray.push(topic.name);
																					});
																					contents.forEach(content => {
																						if (content.schedules && content.schedules.length > 0) {
																							learningHours += moment(content.schedules[0].endTime).diff(content.schedules[0].startTime, 'hours');
																						}
																					});
																					learningHours = learningHours === 0 ? (collectionInstance.academicGyan + collectionInstance.nonAcademicGyan) : learningHours;    // make sure learning hours is never zero.
																					//console.log('total learning hours are: ' + learningHours);
																					// Add to blockchain
																					request
																						.post({
																							url: Collection.app.get('protocolUrl') + 'collections',
																							body: {
																								uniqueId: collectionInstance.id,
																								teacherAddress: ownerInstance.ethAddress,
																								type: collectionInstance.type,
																								learningHours: learningHours,
																								activityHash: 'NA',
																								academicGyan: collectionInstance.academicGyan,
																								nonAcademicGyan: collectionInstance.nonAcademicGyan,
																								assessmentRuleKeys: assessmentRuleKeys,
																								assessmentRuleValues: assessmentRuleValues,
																								nonAcademicRules: nonAcademicRules,
																								topics: topicArray
																							},
																							json: true
																						}, function (err, response, data) {
																							if (err) {
																								console.error(err);
																							} else if (data && data.error) {
																								console.error(data.error);
																							} else {
																								console.log('Add collection to blockchain: ');
																								console.log(data);
																							}
																						});

																					cb(null, { result: 'Collection approved. Email sent to owner.' });
																				}
																				else {
																					cb(new Error('Could not create system message'));
																				}
																			});
																		}
																		else {
																			cb(err);
																		}
																	});
																}
																else {
																	cb(err);
																}
															});
														}
													}
												});
											}
										});
									}
								});

								loopback.Email.send({
									to: ownerInstance.email,
									from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
									subject: subject,
									html: html_body
								})
									.then(function (response) {
										console.log('email sent! - ');
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							}
							else {
								cb(err);
							}
						});
					}
				});
			}
			else {
				err = new Error(g.f('Invalid Collection with ID: %s', id));
				err.statusCode = 400;
				err.code = 'INVALID_COLLECTION';
				cb(err);
			}
		});
	};
	
	/**
	 * Reject a collection submitted for review
	 * @param id : ID of the collection
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.reject = function (id, req, cb) {
		// Find the collection by given ID
		Collection.findById(id, { "include": { "owners": "profiles" } }, function (err, collectionInstance) {
			// if collection exists and the user is logged in
			if (!err && collectionInstance !== null) {
				let ownerId = collectionInstance.toJSON().owners[0].id;
				let userId = Collection.app.models.peer.getCookieUserId(req);
				collectionInstance.status = 'draft';
				collectionInstance.isApproved = false;
				collectionInstance.approvedBy = '';
				delete collectionInstance.owners;
				Collection.upsertWithWhere({ id: collectionInstance.id }, collectionInstance, function (err, newCollectionInstance) {
					if (err) {
						console.log(err);
						err = new Error(g.f('Error updating collection.'));
						err.statusCode = 400;
						err.code = 'DB_ERROR';
						cb(err);
					}
					else {
						let message = '', subject = '';
						let title = '', description = '', actionUrl = [];
						message = { type: collectionInstance.type };
						switch (collectionInstance.type) {
							case 'class':
								subject = 'Online course rejected';
								title = 'Online course rejected!';
								description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "16"];
								break;
							case 'experience':
								subject = 'In-person workshop rejected';
								title = 'In-person workshop rejected!';
								description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "16"];
								break;
							case 'session':
								subject = 'Account Rejected for Mentor Sessions';
								title = 'Account Rejected for Mentor Sessions!';
								description = "Your account has been rejected for mentor sessions. Edit your details and submit again.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "15"];
								break;
							default:
								subject = 'Collection Rejected';
								title = 'Collection Rejected!';
								description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
								actionUrl = [collectionInstance.type, collectionInstance.id, "edit", "16"];
								break;
						}
						let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionRejected.ejs'));
						let html_body = renderer(message);

						// Send email to owner of this class
						Collection.app.models.peer.findById(ownerId, { "include": "profiles" }, function (err, ownerInstance) {

							if (!err) {
								// Send notification to owner
								ownerInstance.__create__notifications({
									type: "action",
									title: title,
									description: description,
									actionUrl: actionUrl
								}, function (err, notificationInstance) {
									if (err) {
										cb(err);
									}
									else {
										notificationInstance.actor.add(ownerInstance.id, function (err, actorInstance) {
											if (err) {
												cb(err);
											}
											else {
												notificationInstance.collection.add(collectionInstance.id, function (err, linkedCollectionInst) {
													if (err) {
														cb(err);
													}
													else {
														cb(null, { result: 'Collection rejected. Email sent to owner.' });
													}
												});
											}
										});
									}
								});

								loopback.Email.send({
									to: ownerInstance.email,
									from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
									subject: subject,
									html: html_body
								})
									.then(function (response) {
										console.log('email sent! - ');
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							}
							else {
								cb(err);
							}
						});
					}
				});
			}
			else {
				err = new Error(g.f('Invalid Collection with ID: %s', id));
				err.statusCode = 400;
				err.code = 'INVALID_COLLECTION';
				cb(err);
			}
		});
	};
	
	
	/**
	 * Remote Hook : Update values of a collection
	 * If collection is cancelled, send email to all participants
	 * TODO: Initiate refund flow
	 */
	Collection.beforeRemote('prototype.patchAttributes', function (ctx, newInstance, next) {
		let collectionInstance = ctx.instance;
		if (collectionInstance.type === 'learning-path') {
			next();
		} else if (collectionInstance.status === 'draft' || collectionInstance.status === "" || collectionInstance.status === "submitted") {
			next();
		}
		else if (ctx.args.data.status === 'complete') {
			next();
		}
		else if (ctx.args.data.status === 'cancelled') {
			// cancelling a class with participants.
			collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
				if (err) {
					next(err);
				}
				else if (participantInstances !== null && participantInstances.length > 0) {
					//Inform all participants that the class is cancelled.
					participantInstances.forEach((participantInstance) => {
						// Send email to participants
						let message = { heading: "Your " + collectionInstance.type + " : " + collectionInstance.title + " has been cancelled by the teacher. If you are eligible for refund, your account will be credited within 7 working days." };
						let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
						let html_body = renderer(message);
						loopback.Email.send({
							to: participantInstance.email,
							from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
							subject: collectionInstance.type + ' cancelled : ' + collectionInstance.title,
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
				else {
					next();
				}
			});
		} else {

			// ctx.args.data.status = 'draft';
			next();

			// User is trying to update a non draft collection
			// We need to check if this collection is active and if it has any participants.
			// if (collectionInstance.status === 'active') {
			// 	collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
			// 		if (err) {
			// 			next(err);
			// 		}
			// 		else if (participantInstances !== null && participantInstances.length > 0) {
			// 			// This collection has existing participants on it. It cannot be edited without branching out.
			// 			// Create a new collection by copying all the data of this collection
			// 			let newCollection = collectionInstance.toJSON();

			// 			let updatedContentKeys = Object.keys(ctx.args.data);
			// 			updatedContentKeys.forEach(function (updatedContentKey) {
			// 				newCollection[updatedContentKey] = ctx.args.data[updatedContentKey];
			// 			});

			// 			//newCollection.title = '[COPY] ' + newCollection.title;
			// 			newCollection.disableHasOneCreate = true;

			// 			delete newCollection.id;
			// 			delete newCollection.status;
			// 			delete newCollection.isCanceled;
			// 			delete newCollection.createdAt;
			// 			delete newCollection.updatedAt;
			// 			delete newCollection.isApproved;
			// 			delete newCollection.isNewInstance;

			// 			Collection.create(newCollection, function (err, newCollectionInstance) {
			// 				if (err) {
			// 					next(err);
			// 				}
			// 				else {
			// 					delete ctx.args.data;
			// 					ctx.args.data = {};
			// 					newCollectionInstance.isNewInstance = true;

			// 					// Create a relation between logged in user and this new collection node
			// 					collectionInstance.__get__owners(function (err, oldOwnerInstances) {
			// 						if (!err && oldOwnerInstances !== null) {
			// 							oldOwnerInstances.forEach(function (oldOwnerInstance) {
			// 								newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
			// 									if (!err && ownerLinkInstance !== null) {
			// 										console.log('Linked owner to cloned collection.');
			// 									}
			// 									else {
			// 										next(err);
			// 									}
			// 								});
			// 							});
			// 						}
			// 						else {
			// 							next(err);
			// 						}
			// 					});

			// 					// Copy all contents from oldInstance to new instance
			// 					collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
			// 						if (!err && oldContentInstances !== null) {
			// 							oldContentInstances.forEach(function (oldContentInstance) {
			// 								// Link new clone to all existing contents.
			// 								newCollectionInstance.__link__contents(oldContentInstance.id, function (err, newLinkedContentInstance) {
			// 									if (!err && newLinkedContentInstance !== null) {
			// 										console.log('Linked content to collection');
			// 									}
			// 								});
			// 							});
			// 						}
			// 						else {
			// 							console.log(err);
			// 						}
			// 					});

			// 					// Copy calendars from old collection to new collection
			// 					collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
			// 						if (!err && oldCalendarInstances !== null) {
			// 							let hasOneCalendarCopied = false;
			// 							oldCalendarInstances.forEach(function (oldCalendarInstance) {
			// 								let hasParticipant = participantInstances.some(function (participantInstance) {
			// 									return participantInstance.calendarId === oldCalendarInstance.id;
			// 								});
			// 								// If this calendar has no participant signed up
			// 								if (!hasParticipant) {
			// 									hasOneCalendarCopied = true;
			// 									newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
			// 										// Do nothing here.
			// 										console.log('Linked calendar to new collection');
			// 									});
			// 									collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
			// 										console.log('unlinked calendar from old collection');
			// 									});
			// 								}
			// 								else {
			// 									console.log('Skipped moving calendar with participants');
			// 								}
			// 							});
			// 							if (!hasOneCalendarCopied) {
			// 								// If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
			// 								newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
			// 									// Do nothing here.
			// 									console.log('Linked calendar to new collection');
			// 								});
			// 							}
			// 						}
			// 					});

			// 					// Copy topics from old collection to new collection
			// 					collectionInstance.__get__topics(function (err, oldTopicInstances) {
			// 						if (!err && oldTopicInstances !== null) {
			// 							oldTopicInstances.forEach(function (oldTopicInstance) {
			// 								newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied topic for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy payoutrules from old collection to new collection
			// 					collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
			// 						if (!err && oldPayoutInstances !== null) {
			// 							oldPayoutInstances.forEach(function (oldPayoutInstance) {
			// 								newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied payoutrules for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy certificate templates
			// 					collectionInstance.__get__certificate_templates(function (err, oldCertificateTemplates) {
			// 						if (!err && oldCertificateTemplates !== null) {
			// 							oldCertificateTemplates.forEach(function (oldCertificateInstance) {
			// 								newCollectionInstance.__link__certificate_templates(oldCertificateInstance.id, function (err, copiedCertificateInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied certificate template for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy promo codes
			// 					collectionInstance.__get__promoCodes(function (err, oldPromoCodes) {
			// 						if (!err && oldPromoCodes !== null) {
			// 							oldPromoCodes.forEach(function (oldPromoCodeInstance) {
			// 								newCollectionInstance.__link__promoCodes(oldPromoCodeInstance.id, function (err, copiedPromoCodeInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied promo codes for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy rewards
			// 					collectionInstance.__get__rewards(function (err, oldRewards) {
			// 						if (!err && oldRewards !== null) {
			// 							oldRewards.forEach(function (oldRewardInstance) {
			// 								newCollectionInstance.__link__rewards(oldRewardInstance.id, function (err, copiedRewardInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied rewards for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy Assessment models
			// 					collectionInstance.__get__assessment_models(function (err, oldAssessmentModels) {
			// 						if (!err && oldAssessmentModels !== null) {
			// 							oldAssessmentModels.forEach(function (oldAssessmentInstance) {
			// 								newCollectionInstance.__link__assessment_models(oldAssessmentInstance.id, function (err, copiedAssessmentInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied assessment model for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					ctx.res.json(newCollectionInstance.toJSON());
			// 				}
			// 			});
			// 		}
			// 		else {
			// 			// This collection has no participants on it. We can edit it but put it back in draft status.
			// 			ctx.args.data.status = 'draft';
			// 			ctx.args.data.isNewInstance = true;
			// 			next();
			// 		}
			// 	});
			// }
			// else {
			// 	// Collection status is neither draft or active.
			// 	next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
			// }
		}
	});
	
	/**
	 * Remote Hook : Update values of a Content linked to a collection
	 * PASS THROUGH
	 */
	Collection.beforeRemote('prototype.__updateById__contents', function (ctx, newInstance, next) {
		let collectionInstance = ctx.instance;
		/*console.log('received instance is: ' + JSON.stringify(collectionInstance));
		console.log("ctx args are: " + JSON.stringify(ctx.args));
		console.log("ctx method is: " + JSON.stringify(ctx.methodString));*/
		if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
			next();
		}
		else if (ctx.args.data.status === 'complete') {
			next();
		}
		else {

			// ctx.args.data.status = 'draft';
			next();

			// User is trying to update a non draft collection
			// We need to check if this collection is active and if it has any participants.
			// if (collectionInstance.status === 'active') {
			// 	collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
			// 		if (err) {
			// 			next(err);
			// 		}
			// 		else if (participantInstances !== null && participantInstances.length > 0) {

			// 			// This collection has existing participants on it. It cannot be edited without branching out.

			// 			// Create a new collection by copying all the data of this collection
			// 			let newCollection = collectionInstance.toJSON();
			// 			delete newCollection.id;
			// 			delete newCollection.status;
			// 			delete newCollection.isCanceled;
			// 			delete newCollection.createdAt;
			// 			delete newCollection.updatedAt;
			// 			delete newCollection.isApproved;
			// 			delete newCollection.isNewInstance;
			// 			//newCollection.title = '[COPY] ' + newCollection.title;
			// 			newCollection.disableHasOneCreate = true;

			// 			Collection.create(newCollection, function (err, newCollectionInstance) {
			// 				if (err) {
			// 					next(err);
			// 				}
			// 				else {
			// 					newCollectionInstance.isNewInstance = true;

			// 					// Get all owners of this collection and link them to cloned collection
			// 					collectionInstance.__get__owners(function (err, oldOwnerInstances) {
			// 						if (!err && oldOwnerInstances !== null) {
			// 							oldOwnerInstances.forEach(function (oldOwnerInstance) {
			// 								newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
			// 									if (!err && ownerLinkInstance !== null) {
			// 										console.log('Linked owner to cloned collection.');
			// 									}
			// 								});
			// 							});
			// 						}
			// 					});

			// 					let resultContents = [];

			// 					// Copy all contents from oldInstance to new instance
			// 					collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
			// 						if (!err && oldContentInstances !== null) {
			// 							let m = 0;
			// 							for (let i = 0; i < oldContentInstances.length; i++) {
			// 								// If this content is not a dirty content
			// 								if (oldContentInstances[i].id !== ctx.args.fk) {
			// 									// Add content to array to pass in result
			// 									resultContents.push(oldContentInstances[i]);
			// 									// Link new clone to all non-dirty contents.
			// 									newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
			// 										if (!err && newLinkedContentInstance !== null) {
			// 											console.log('Linked non-dirty content to collection');
			// 										}
			// 										m++;
			// 										if (m === oldContentInstances.length) {
			// 											let resultCollectionInstance = newCollectionInstance.toJSON();
			// 											resultCollectionInstance['contents'] = resultContents;
			// 											ctx.res.json(resultCollectionInstance);
			// 										}
			// 									});
			// 								}
			// 								// If this content is a dirty content.
			// 								else {
			// 									let newContent = {};
			// 									newContent = oldContentInstances[i].toJSON();

			// 									let updatedContentKeys = Object.keys(ctx.args.data);
			// 									updatedContentKeys.forEach(function (updatedContentKey) {
			// 										newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
			// 									});

			// 									delete newContent.id;
			// 									delete newContent.schedules;
			// 									delete newContent.locations;
			// 									newContent.disableHasOneCreate = true;
			// 									newContent.isNewInstance = true;

			// 									// Create clone of dirty content for new collection
			// 									newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
			// 										if (!err && newCreatedContentInstance !== null) {
			// 											console.log('Cloned content for collection');
			// 											let oldContentInstance = oldContentInstances[m].__data;

			// 											delete newCreatedContentInstance.isNewInstance;
			// 											// Add content to array to pass in result
			// 											resultContents.push(newCreatedContentInstance);

			// 											// Copy locations from old content to new content
			// 											let newContentLocation = oldContentInstance.locations[0].toJSON();
			// 											if (typeof newContentLocation === 'object' && newContentLocation !== undefined) {
			// 												delete newContentLocation.id;
			// 												newCreatedContentInstance.__create__locations(newContentLocation, function (err, copiedLocationInstance) {
			// 													// Do nothing here.
			// 													console.log('Cloned location for content');
			// 												});
			// 											}


			// 											// Copy schedules from old content to new content
			// 											let newContentSchedule = oldContentInstance.schedules[0].toJSON();
			// 											if (typeof newContentSchedule === 'object' && newContentSchedule !== undefined) {
			// 												delete newContentSchedule.id;
			// 												newCreatedContentInstance.__create__schedules(newContentSchedule, function (err, copiedScheduleInstance) {
			// 													// Do nothing here.
			// 													console.log('Cloned schedule for content');
			// 												});
			// 											}

			// 										}
			// 										m++;
			// 										if (m === oldContentInstances.length) {
			// 											let resultCollectionInstance = newCollectionInstance.toJSON();
			// 											resultCollectionInstance['contents'] = resultContents;
			// 											ctx.res.json(resultCollectionInstance);
			// 										}
			// 									});
			// 								}
			// 							}
			// 						}
			// 						else {
			// 							console.log(err);
			// 							next(new Error(g.f('Cannot update collection. Error: ' + err)));
			// 						}
			// 					});

			// 					// Copy calendars from old collection to new collection
			// 					collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
			// 						if (!err && oldCalendarInstances !== null) {
			// 							let hasOneCalendarCopied = false;
			// 							oldCalendarInstances.forEach(function (oldCalendarInstance) {
			// 								//participantInstances = participantInstances.toJSON();
			// 								let hasParticipant = participantInstances.some(function (participantInstance) {
			// 									return participantInstance.calendarId === oldCalendarInstance.id;
			// 								});
			// 								// If this calendar has no participant signed up
			// 								if (!hasParticipant) {
			// 									hasOneCalendarCopied = true;
			// 									newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
			// 										// Do nothing here.
			// 										console.log('Linked calendar to new collection');
			// 									});
			// 									collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
			// 										console.log('Unlinked calendar from old collection');
			// 									});
			// 								}
			// 								else {
			// 									console.log('Skipped cloning calendar with participants');
			// 								}
			// 							});
			// 							if (!hasOneCalendarCopied) {
			// 								// If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
			// 								newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
			// 									// Do nothing here.
			// 									console.log('Linked calendar to new collection');
			// 								});
			// 							}
			// 						}
			// 					});

			// 					// Copy topics from old collection to new collection
			// 					collectionInstance.__get__topics(function (err, oldTopicInstances) {
			// 						if (!err && oldTopicInstances !== null) {
			// 							oldTopicInstances.forEach(function (oldTopicInstance) {
			// 								newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied topic for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy payoutrules from old collection to new collection
			// 					collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
			// 						if (!err && oldPayoutInstances !== null) {
			// 							oldPayoutInstances.forEach(function (oldPayoutInstance) {
			// 								newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied payoutrules for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy certificate templates
			// 					collectionInstance.__get__certificate_templates(function (err, oldCertificateTemplates) {
			// 						if (!err && oldCertificateTemplates !== null) {
			// 							oldCertificateTemplates.forEach(function (oldCertificateInstance) {
			// 								newCollectionInstance.__link__certificate_templates(oldCertificateInstance.id, function (err, copiedCertificateInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied certificate template for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy promo codes
			// 					collectionInstance.__get__promoCodes(function (err, oldPromoCodes) {
			// 						if (!err && oldPromoCodes !== null) {
			// 							oldPromoCodes.forEach(function (oldPromoCodeInstance) {
			// 								newCollectionInstance.__link__promoCodes(oldPromoCodeInstance.id, function (err, copiedPromoCodeInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied promo codes for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy rewards
			// 					collectionInstance.__get__rewards(function (err, oldRewards) {
			// 						if (!err && oldRewards !== null) {
			// 							oldRewards.forEach(function (oldRewardInstance) {
			// 								newCollectionInstance.__link__rewards(oldRewardInstance.id, function (err, copiedRewardInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied rewards for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy Assessment models
			// 					collectionInstance.__get__assessment_models(function (err, oldAssessmentModels) {
			// 						if (!err && oldAssessmentModels !== null) {
			// 							oldAssessmentModels.forEach(function (oldAssessmentInstance) {
			// 								newCollectionInstance.__link__assessment_models(oldAssessmentInstance.id, function (err, copiedAssessmentInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied assessment model for new collection');
			// 								});

			// 							});
			// 						}
			// 					});
			// 				}
			// 			});
			// 		}
			// 		else {
			// 			// This collection has no participants on it. We can edit it but put it back in draft status.
			// 			ctx.args.data.status = 'draft';
			// 			next();
			// 		}
			// 	});
			// }
			// else {
			// 	// Collection status is neither draft or active.
			// 	next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
			// }
		}
	});
	
	/**
	 * Remote Hook : Add a new Content to a Collection
	 * PASS THROUGH
	 */
	Collection.beforeRemote('prototype.__create__contents', function (ctx, newInstance, next) {
		console.log('***** ADDING NEW CONTENT TO COLLECTION');
		let collectionInstance = ctx.instance;
		if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
			next();
		}
		else if (ctx.args.data.status === 'complete') {
			next();
		}
		else {

			// ctx.args.data.status = 'draft';
			next();

			// User is trying to update a non draft collection
			// We need to check if this collection is active and if it has any participants.
			// if (collectionInstance.status === 'active') {
			// 	collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
			// 		if (err) {
			// 			next(err);
			// 		}
			// 		else if (participantInstances !== null && participantInstances.length > 0) {
			// 			// This collection has existing participants on it. It cannot be edited without branching out.

			// 			// Create a new collection by copying all the data of this collection
			// 			let newCollection = collectionInstance.toJSON();
			// 			delete newCollection.id;
			// 			delete newCollection.status;
			// 			delete newCollection.isCanceled;
			// 			delete newCollection.createdAt;
			// 			delete newCollection.updatedAt;
			// 			delete newCollection.isApproved;
			// 			delete newCollection.isNewInstance;
			// 			newCollection.disableHasOneCreate = true;

			// 			Collection.create(newCollection, function (err, newCollectionInstance) {
			// 				if (err) {
			// 					next(err);
			// 				}
			// 				else {
			// 					newCollectionInstance.isNewInstance = true;

			// 					// Get all owners of this collection and link them to cloned collection
			// 					collectionInstance.__get__owners(function (err, oldOwnerInstances) {
			// 						if (!err && oldOwnerInstances !== null) {
			// 							oldOwnerInstances.forEach(function (oldOwnerInstance) {
			// 								newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
			// 									if (!err && ownerLinkInstance !== null) {
			// 										console.log('Linked owner to cloned collection.');
			// 									}
			// 								});
			// 							});
			// 						}
			// 					});

			// 					let resultContents = [];


			// 					// Copy all contents from oldInstance to new instance
			// 					collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
			// 						if (!err && oldContentInstances !== null) {
			// 							let m = 0;
			// 							for (let i = 0; i < oldContentInstances.length; i++) {
			// 								// Link new clone to all non-dirty contents.
			// 								newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
			// 									if (!err && newLinkedContentInstance !== null) {
			// 										console.log('Linked existing content to collection');
			// 										// Add content to array to pass as result
			// 										resultContents.push(newLinkedContentInstance.toJSON());
			// 									}
			// 									m++;
			// 								});
			// 								if (m === oldContentInstances.length) {

			// 									// Create new content for this collection
			// 									let newContent = {};
			// 									let updatedContentKeys = Object.keys(ctx.args.data);
			// 									updatedContentKeys.forEach(function (updatedContentKey) {
			// 										newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
			// 									});
			// 									newContent.isNewInstance = true;
			// 									// Create new content for this new collection
			// 									newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
			// 										if (!err && newCreatedContentInstance !== null) {
			// 											console.log('Created content for collection');

			// 											delete newCreatedContentInstance.isNewInstance;
			// 											// Add content to array to pass as result
			// 											resultContents.push(newCreatedContentInstance.toJSON());
			// 											// Sent result response
			// 											let resultCollectionInstance = newCollectionInstance.toJSON();
			// 											resultCollectionInstance['contents'] = resultContents;
			// 											ctx.res.json(resultCollectionInstance);
			// 										}
			// 										else {
			// 											next(new Error(g.f('Cannot update collection. Error: ' + err)));
			// 										}
			// 									});
			// 								}
			// 							}
			// 						}
			// 						else {
			// 							console.log(err);
			// 							next(new Error(g.f('Cannot update collection. Error: ' + err)));
			// 						}
			// 					});

			// 					// Copy calendars from old collection to new collection
			// 					collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
			// 						if (!err && oldCalendarInstances !== null) {
			// 							let hasOneCalendarCopied = false;
			// 							oldCalendarInstances.forEach(function (oldCalendarInstance) {
			// 								//participantInstances = participantInstances.toJSON();
			// 								let hasParticipant = participantInstances.some(function (participantInstance) {
			// 									return participantInstance.calendarId === oldCalendarInstance.id;
			// 								});
			// 								// If this calendar has no participant signed up
			// 								if (!hasParticipant) {
			// 									hasOneCalendarCopied = true;
			// 									newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
			// 										// Do nothing here.
			// 										console.log('Linked calendar to new collection');
			// 									});
			// 									collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
			// 										console.log('Unlinked calendar from old collection');
			// 									});
			// 								}
			// 								else {
			// 									console.log('Skipped cloning calendar with participants');
			// 								}
			// 							});
			// 							if (!hasOneCalendarCopied) {
			// 								// If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
			// 								newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
			// 									// Do nothing here.
			// 									console.log('Linked calendar to new collection');
			// 								});
			// 							}
			// 						}
			// 					});

			// 					// Copy topics from old collection to new collection
			// 					collectionInstance.__get__topics(function (err, oldTopicInstances) {
			// 						if (!err && oldTopicInstances !== null) {
			// 							oldTopicInstances.forEach(function (oldTopicInstance) {
			// 								newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied topic for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy payoutrules from old collection to new collection
			// 					collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
			// 						if (!err && oldPayoutInstances !== null) {
			// 							oldPayoutInstances.forEach(function (oldPayoutInstance) {
			// 								newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied payoutrules for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy certificate templates
			// 					collectionInstance.__get__certificate_templates(function (err, oldCertificateTemplates) {
			// 						if (!err && oldCertificateTemplates !== null) {
			// 							oldCertificateTemplates.forEach(function (oldCertificateInstance) {
			// 								newCollectionInstance.__link__certificate_templates(oldCertificateInstance.id, function (err, copiedCertificateInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied certificate template for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy promo codes
			// 					collectionInstance.__get__promoCodes(function (err, oldPromoCodes) {
			// 						if (!err && oldPromoCodes !== null) {
			// 							oldPromoCodes.forEach(function (oldPromoCodeInstance) {
			// 								newCollectionInstance.__link__promoCodes(oldPromoCodeInstance.id, function (err, copiedPromoCodeInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied promo codes for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy rewards
			// 					collectionInstance.__get__rewards(function (err, oldRewards) {
			// 						if (!err && oldRewards !== null) {
			// 							oldRewards.forEach(function (oldRewardInstance) {
			// 								newCollectionInstance.__link__rewards(oldRewardInstance.id, function (err, copiedRewardInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied rewards for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy Assessment models
			// 					collectionInstance.__get__assessment_models(function (err, oldAssessmentModels) {
			// 						if (!err && oldAssessmentModels !== null) {
			// 							oldAssessmentModels.forEach(function (oldAssessmentInstance) {
			// 								newCollectionInstance.__link__assessment_models(oldAssessmentInstance.id, function (err, copiedAssessmentInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied assessment model for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 				}
			// 			});
			// 		}
			// 		else {
			// 			// This collection has no participants on it. We can edit it but put it back in draft status.
			// 			ctx.args.data.status = 'draft';
			// 			next();
			// 		}
			// 	});
			// }
			// else {
			// 	// Collection status is neither draft or active.
			// 	next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
			// }
		}
	});
	
	/**
	 * Remote Hook : Delete a Content linked to a Collection
	 * PASS THROUGH
	 */
	Collection.beforeRemote('prototype.__destroyById__contents', function (ctx, newInstance, next) {
		console.log('***** DELETING CONTENT OF COLLECTION');
		let collectionInstance = ctx.instance;
		if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
			next();
		}
		else {
			// User is trying to delete contents of a non draft collection
			// We need to check if this collection is active and if it has any participants.
			// if (collectionInstance.status === 'active') {
			// 	console.log('***** DELETING CONTENT OF ACTIVE COLLECTION');
			// 	collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
			// 		if (err) {
			// 			next(err);
			// 		}
			// 		else if (participantInstances !== null && participantInstances.length > 0) {
			// 			console.log('***** DELETING CONTENT OF ACTIVE COLLECTION WITH PARTICIPANTS');

			// 			// This collection has existing participants on it. It cannot be edited without branching out.

			// 			// Create a new collection by copying all the data of this collection
			// 			let newCollection = collectionInstance.toJSON();
			// 			delete newCollection.id;
			// 			delete newCollection.status;
			// 			delete newCollection.isCanceled;
			// 			delete newCollection.createdAt;
			// 			delete newCollection.updatedAt;
			// 			delete newCollection.isApproved;
			// 			delete newCollection.isNewInstance;
			// 			newCollection.disableHasOneCreate = true;

			// 			Collection.create(newCollection, function (err, newCollectionInstance) {
			// 				if (err) {
			// 					next(err);
			// 				}
			// 				else {
			// 					newCollectionInstance.isNewInstance = true;

			// 					// Get all owners of this collection and link them to cloned collection
			// 					collectionInstance.__get__owners(function (err, oldOwnerInstances) {
			// 						if (!err && oldOwnerInstances !== null) {
			// 							oldOwnerInstances.forEach(function (oldOwnerInstance) {
			// 								newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
			// 									if (!err && ownerLinkInstance !== null) {
			// 										console.log('Linked owner to cloned collection.');
			// 									}
			// 								});
			// 							});
			// 						}
			// 					});

			// 					let resultContents = [];

			// 					// Copy all contents from oldInstance to new instance
			// 					collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
			// 						if (!err && oldContentInstances !== null) {
			// 							let m = 0;
			// 							for (let i = 0; i < oldContentInstances.length; i++) {

			// 								if (oldContentInstances[i].id !== ctx.args.fk) {
			// 									// Add content to array to pass as result
			// 									// Link new clone to all non-dirty contents.
			// 									newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
			// 										if (!err && newLinkedContentInstance !== null) {
			// 											console.log('Linked existing content to collection');
			// 											resultContents.push(newLinkedContentInstance.toJSON());
			// 										}
			// 										m++;
			// 										if (m === (oldContentInstances.length - 1)) {
			// 											let resultCollectionInstance = newCollectionInstance.toJSON();
			// 											resultCollectionInstance['contents'] = resultContents;
			// 											ctx.res.json(resultCollectionInstance);
			// 										}
			// 									});
			// 								}
			// 							}
			// 						}
			// 						else {
			// 							console.log(err);
			// 							next(new Error(g.f('Cannot update collection. Error: ' + err)));
			// 						}
			// 					});

			// 					// Copy calendars from old collection to new collection
			// 					collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
			// 						if (!err && oldCalendarInstances !== null) {
			// 							let hasOneCalendarCopied = false;
			// 							oldCalendarInstances.forEach(function (oldCalendarInstance) {
			// 								let hasParticipant = participantInstances.some(function (participantInstance) {
			// 									return participantInstance.calendarId === oldCalendarInstance.id;
			// 								});
			// 								// If this calendar has no participant signed up
			// 								if (!hasParticipant) {
			// 									hasOneCalendarCopied = true;
			// 									newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
			// 										// Do nothing here.
			// 										console.log('Linked calendar to new collection');
			// 									});
			// 									collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
			// 										console.log('Unlinked calendar from old collection');
			// 									});
			// 								}
			// 								else {
			// 									console.log('Skipped cloning calendar with participants');
			// 								}
			// 							});
			// 							if (!hasOneCalendarCopied) {
			// 								// If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
			// 								newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
			// 									// Do nothing here.
			// 									console.log('Linked calendar to new collection');
			// 								});
			// 							}
			// 						}
			// 					});

			// 					// Copy topics from old collection to new collection
			// 					collectionInstance.__get__topics(function (err, oldTopicInstances) {
			// 						if (!err && oldTopicInstances !== null) {
			// 							oldTopicInstances.forEach(function (oldTopicInstance) {
			// 								newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied topic for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy payoutrules from old collection to new collection
			// 					collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
			// 						if (!err && oldPayoutInstances !== null) {
			// 							oldPayoutInstances.forEach(function (oldPayoutInstance) {
			// 								newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied payoutrules for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy certificate templates
			// 					collectionInstance.__get__certificate_templates(function (err, oldCertificateTemplates) {
			// 						if (!err && oldCertificateTemplates !== null) {
			// 							oldCertificateTemplates.forEach(function (oldCertificateInstance) {
			// 								newCollectionInstance.__link__certificate_templates(oldCertificateInstance.id, function (err, copiedCertificateInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied certificate template for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy promo codes
			// 					collectionInstance.__get__promoCodes(function (err, oldPromoCodes) {
			// 						if (!err && oldPromoCodes !== null) {
			// 							oldPromoCodes.forEach(function (oldPromoCodeInstance) {
			// 								newCollectionInstance.__link__promoCodes(oldPromoCodeInstance.id, function (err, copiedPromoCodeInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied promo codes for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy rewards
			// 					collectionInstance.__get__rewards(function (err, oldRewards) {
			// 						if (!err && oldRewards !== null) {
			// 							oldRewards.forEach(function (oldRewardInstance) {
			// 								newCollectionInstance.__link__rewards(oldRewardInstance.id, function (err, copiedRewardInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied rewards for new collection');
			// 								});

			// 							});
			// 						}
			// 					});

			// 					// Copy Assessment models
			// 					collectionInstance.__get__assessment_models(function (err, oldAssessmentModels) {
			// 						if (!err && oldAssessmentModels !== null) {
			// 							oldAssessmentModels.forEach(function (oldAssessmentInstance) {
			// 								newCollectionInstance.__link__assessment_models(oldAssessmentInstance.id, function (err, copiedAssessmentInstance) {
			// 									// Do nothing here.
			// 									console.log('Copied assessment model for new collection');
			// 								});

			// 							});
			// 						}
			// 					});
			// 				}
			// 			});
			// 		}
			// 		else {
			// 			// This collection has no participants on it. We can edit it but put it back in draft status.
			// 			next();
			// 		}
			// 	});
			// }
			// else {
			// 	// Collection status is neither draft or active.
			// 	next(new Error(g.f('Cannot delete content in state: ' + collectionInstance.status)));
			// }

			// ctx.args.data.status = 'draft';
			next();
		}
	});
	
	/**
	 * Get details of a collection from Blockchain
	 * @param id : ID of the collection
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.etherInfo = function (id, req, cb) {
		// Get from blockchain
		request
			.get({
				url: protocolUrl + 'collections/' + id,
			}, function (err, response, data) {
				if (err) {
					console.error(err);
					cb(err);
				} else if (data && data.error) {
					cb(data.error);
				} else {
					console.log('Got details of collection: ' + data);
					try {
						cb(null, JSON.parse(data));
					} catch (e) {
						cb(new Error('Failed'));
					}
				}
			});
	};
	
	/**
	 * Add a Collection to Blockchain
	 * @param id : ID of collection
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.addToEthereum = function (id, req, cb) {
		// Find the collection by given ID
		Collection.findById(id, { "include": [{ "owners": "profiles" }, { "assessment_models": ["assessment_rules", "assessment_na_rules"] }, "topics", { "contents": "schedules" }] }, function (err, collectionInstance) {
			// if collection exists and the user is logged in
			if (!err && collectionInstance !== null) {
				let ownerId = collectionInstance.toJSON().owners[0].id;
				let assessmentRules = collectionInstance.toJSON().assessment_models[0].assessment_rules;
				let assessmentNARules = collectionInstance.toJSON().assessment_models[0].assessment_na_rules;
				let contents = collectionInstance.toJSON().contents;
				let topics = collectionInstance.toJSON().topics;

				Collection.app.models.peer.findById(ownerId, { "include": "profiles" }, function (err, ownerInstance) {
					if (!err) {
						// Add this collection to blockchain.
						const assessmentRuleKeys = [];
						const assessmentRuleValues = [];
						const nonAcademicRules = [];
						const topicArray = [];
						let learningHours = 0;
						assessmentRules.forEach(assessmentRule => {
							assessmentRuleKeys.push(assessmentRule.value);
							assessmentRuleValues.push(assessmentRule.gyan);
						});
						assessmentNARules.forEach(assessmentNARule => {
							if (assessmentNARule.value === 'engagement') {
								nonAcademicRules[0] = assessmentNARule.gyan;
							} else if (assessmentNARule.value === 'commitment') {
								nonAcademicRules[1] = assessmentNARule.gyan;
							}
						});
						topics.forEach(topic => {
							topicArray.push(topic.name);
						});
						contents.forEach(content => {
							if (content.schedules && content.schedules.length > 0) {
								learningHours += moment(content.schedules[0].endTime).diff(content.schedules[0].startTime, 'hours');
							}
						});
						
						learningHours = learningHours <= 0 ? (collectionInstance.academicGyan + collectionInstance.nonAcademicGyan) : learningHours;    // make sure learning hours is never zero.
						//console.log('total learning hours are: ' + learningHours);
						const body = {
							uniqueId: collectionInstance.id,
							teacherAddress: ownerInstance.ethAddress,
							type: collectionInstance.type,
							learningHours: learningHours,
							activityHash: 'NA',
							academicGyan: collectionInstance.academicGyan,
							nonAcademicGyan: collectionInstance.nonAcademicGyan,
							assessmentRuleKeys: assessmentRuleKeys,
							assessmentRuleValues: assessmentRuleValues,
							nonAcademicRules: nonAcademicRules,
							topics: topicArray
						};
						console.log(body);
						// Add to blockchain
						request
							.post({
								url: protocolUrl + 'collections',
								body: body,
								json: true
							}, function (err, response, data) {
								if (err) {
									console.error(err);
									cb(err);
								} else if (response.body.error) {
									cb(response.body.error);
								} else if (data && data.error) {
									cb(data.error);
								} else {
									console.log('Add collection to blockchain: ');
									console.log(response);
									cb(null, data);
								}
							});
					}
				});
			}
			else {
				err = new Error(g.f('Invalid Collection with ID: %s', id));
				err.statusCode = 400;
				err.code = 'INVALID_COLLECTION';
				cb(err);
			}
		});
	};

	/**
	 * Add a participant to Blockchain
	 * @param id : ID of collection
	 * @param participantId : EthAddress of the participant
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.addParticipantToEthereum = function (id, participantId, req, cb) {

		Collection.app.models.peer.findById(participantId, { "include": ["profiles", "scholarships_joined"] }, function (err, participantUserInstance) {
			if (err) {
				cb(err);
			}
			else {
				if (participantUserInstance) {
					// Record student participation in an experience on blockchain
					let scholarshipId;
					if (req.body.scholarshipId && req.body.scholarshipId.length > 0) {
						scholarshipId = req.body.scholarshipId;
					} else {
						if (participantUserInstance.scholarships_joined && participantUserInstance.scholarships_joined.length > 0 && participantUserInstance.scholarships_joined[0]) {
							scholarshipId = participantUserInstance.scholarships_joined[0].id;
						} else {
							scholarshipId = '';
						}
					}
					request
						.put({
							url: Collection.app.get('protocolUrl') + 'collections/' + id + '/peers/rel/' + participantUserInstance.ethAddress,
							body: {
								scholarshipId: scholarshipId
							},
							json: true
						}, function (err, response, data) {
							if (err) {
								console.error(err);
							} else if (data && data.error) {
								cb(data.error);
							}
							else {
								console.log('STUDENT PARTICIPATION ON BLOCKCHAIN IN PROGRESS');
								console.log(data);
								cb(null, data);
							}
						});
				} else {
					cb(new Error('Could not find participant with this ID.'));
				}
			}
		});
	};
	
	/**
	 * Announce results for a Reward Bounty
	 * @param id : ID of collection
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.announceResult = function (id, req, cb) {
		const options = {
			'include': [
				{ 'rewards': { 'winners': 'profiles' } },
			]
		};
		Collection.findById(id, options, (err, instance) => {
			if (err) {
				console.log(err);
				cb(err);
			} else {
				const collectionJSON = instance.toJSON();
				console.log(collectionJSON);
				collectionJSON.rewards.forEach(reward => {
					console.log(reward);
					const emailTo = reward.winners[0].email;
					const winnerName = reward.winners[0].profiles[0].first_name + ' ' + reward.winners[0].profiles[0].last_name;
					// Send email to the student informing about won reward
					let message = {
						winnerName: winnerName,
						rewardPosition: reward.title,
						bountyTitle: collectionJSON.title,
						rewardAmount: reward.value + ' ' + reward.currency
					};
					let renderer = loopback.template(path.resolve(__dirname, '../../server/views/wonReward.ejs'));
					let html_body = renderer(message);
					loopback.Email.send({
						to: emailTo,
						from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
						subject: 'You have won a ' + reward.title + ' reward!',
						html: html_body
					}).then((response) => {
						console.log('email sent! ');
					}).catch((err) => {
						console.log('email error! - ' + err);
					});
				});

				Collection.upsertWithWhere({ id: collectionJSON.id }, { resultsAnnounced: true }, (err, model) => {
					if (err) {
						cb(err);
					} else {
						cb(null, model);
					}
				});
			}
		});

	};
	
	/**
	 * Fetch an array of cached trending collections
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.fetchTrending = function (req, cb) {
		const queryObj = req.query;
		let type = queryObj['type'];
		type = (type === 'learning-path') ? 'learningPath' : type;
		const query = {
			fields: {}
		};
		if (type) {
			console.log('trending' + type + ' requested');
			query.fields[type + 'Array'] = true;
		}
		Collection.app.models.trending_cache.find(query, (err, cacheInstances) => {
			if (err) {
				cb(err);
			} else {
				cb(null, cacheInstances[0][type + 'Array']);
			}
		});
	};
	
	/**
	 * Utility function to fix database to CustomUrl for each collection
	 * @param req
	 * @param cb
	 */
	Collection.fixDatabase = function (req, cb) {
		Collection.find((err, collectionInstances) => {
			Promise.each(collectionInstances, (collectionInstance) => {
				if (!collectionInstance.customUrl || collectionInstance.customUrl === undefined) {
					return Collection.setCustomUrl(collectionInstance).then(url => {
						console.log(url);
					});
				} else {
					return Collection.checkSetUniqueUrl(collectionInstance).then(url => {
						console.log(url);
					});
				}
			}).then(result => {
				console.log('all promises completed');
				cb(null, true);
			}).catch(err => {
				console.log(err);
				cb(err);
			});
		});
	};
	
	/**
	 * Check a user's participation in a Collection from Blockchain
	 * @param id : ID of the course
	 * @param fk : EthAddress of user
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.checkParticipantOnBlockchain = function (id, fk, req, cb) {
		// Get from blockchain
		request
			.get({
				url: protocolUrl + 'collections/' + id + '/peers',
			}, function (err, response, data) {
				if (err) {
					console.error(err);
					cb(null, { result: false, participantId: fk.toLowerCase() });
				} else if (data && data.error) {
					cb(null, { result: false, participantId: fk.toLowerCase() });
				} else {
					console.log('Got list of participants for this collection: ' + data);
					const peers = JSON.parse(data);
					if (_.find(peers, (peer) => peer === fk.toLowerCase())) {
						cb(null, { result: true, participantId: fk.toLowerCase() });
					} else {
						cb(null, { result: false, participantId: fk.toLowerCase() });
					}
				}
			});
	};
	
	/**
	 * Get a list of course participants from Blockchain
	 * @param id : ID of the course
	 * @param req : Http request
	 * @param cb : Callback function
	 */
	Collection.getBlockchainParticipants = function (id, req, cb) {
		// Get participants from blockchain
		request
			.get({
				url: protocolUrl + 'collections/' + id + '/peers',
			}, function (err, response, data) {
				if (err) {
					console.error(err);
					cb(null, { result: false, participants: [] });
				} else if (data && data.error) {
					cb(null, { result: false, participants: [] });
				} else {
					console.log('Got list of participants for this collection: ' + data);
					const peers = JSON.parse(data);
					cb(null, { result: true, participants: peers });
				}
			});
	};
	
	/**
	 * Set a CustomUrl for a collection
	 * @param collectionInstance
	 * @returns {Promise<*>}
	 */
	Collection.setCustomUrl = async (collectionInstance) => {
		if (collectionInstance.title) {
			console.log('setting custom url');
			const nospaceTitle = collectionInstance.title.replace(/\s+/g, ' ').trim().toLowerCase();
			const titleUrl = nospaceTitle.replace(/ /g, '-');
			const query = {
				'where': {
					'customUrl': titleUrl
				}
			};
			const data = await Collection.find(query);

			if (!data || data.length === 0) {
				collectionInstance.customUrl = titleUrl;
				collectionInstance.save();
				return collectionInstance.customUrl;
			} else {
				for (let i = 1; i < 100; i++) {
					const testUrl = titleUrl + '-' + i.toString();
					const query = {
						'where': {
							'customUrl': testUrl
						}
					};
					const data = await Collection.find(query);
					if (!data || data.length === 0) {
						collectionInstance.customUrl = testUrl;
						collectionInstance.save();
						return collectionInstance.customUrl;
					}
				}
			}
		} else {
			collectionInstance.customUrl = collectionInstance.id;
			collectionInstance.save();
			return collectionInstance.customUrl;
		}
	};
	
	/**
	 * Check if the customUrl is unique and the update the collection
	 * @param collectionInstance
	 * @returns {Promise<*>}
	 */
	Collection.checkSetUniqueUrl = async (collectionInstance) => {
		console.log('checking if unique');
		if (collectionInstance.customUrl && collectionInstance.customUrl.length > 0) {
			const query = {
				'where': {
					'customUrl': collectionInstance.customUrl
				}
			};
			const data = await Collection.find(query);
			if (data && data.length === 1 && data[0].id === collectionInstance.id) {
				console.log('not unique');
				collectionInstance.save();
				return collectionInstance.customUrl;
			} else {
				console.log('unique. Saving it now!');
				return Collection.setCustomUrl(collectionInstance);
			}
		} else {
			return Collection.setCustomUrl(collectionInstance);
		}
	};
	
	/**
	 * Utility - Delete all loopback inseted properties from an object
	 * @param rawObject
	 * @returns {*}
	 */
	const sanitize = (rawObject) => {
		// delete loopback inserted properties
		delete rawObject.id;
		delete rawObject.createdAt;
		delete rawObject.updatedAt;
		return rawObject;
	};
	
	/**
	 * Create a duplicate copy of an existing collection
	 * @param collectionId
	 * @param body
	 * @returns {Promise<newCollection>}
	 */
	Collection.cloneCollection = async (collectionId, body) => {
		console.log('Cloning Collection' + collectionId);
		let oldCollectionData;
		let newCollectionInstance;
		let oldCollectionInstance;
		const collecitonQuery = {
			include: [
				'owners',
				{ 'contents': ['locations', 'schedules'] },
				'calendars',
				'topics',
				'certificate_templates',
				'payoutrules',
				'promoCodes',
				'rewards',
				{ 'assessment_models': ['assessment_na_rules', 'assessment_rules'] }
			]
		};
		return Collection
			.findById(collectionId, collecitonQuery)
			.then((oldCollectionInstanceData) => {
				oldCollectionInstance = oldCollectionInstanceData;
				oldCollectionData = oldCollectionInstanceData.toJSON();
				let newCollection = oldCollectionData;
				console.log(newCollection);
				newCollection = sanitize(newCollection);
				// assign fresh values to new collection
				newCollection.title = 'Cloned:' + newCollection.title;
				newCollection.status = 'draft';
				newCollection.isCanceled = false;
				newCollection.isApproved = false;
				newCollection.isNewInstance = false;
				return Collection.create(newCollection);
			})
			.then((newCollectionInstanceData) => {
				newCollectionInstance = newCollectionInstanceData;
				// Create a relation between logged in user and this new collection node
				const linkOwnerPromises = [];
				oldCollectionData.owners.forEach((oldOwnerInstance) => {
					linkOwnerPromises.push(
						new Promise((res, rej) => {
							newCollectionInstance.__link__owners(oldOwnerInstance.id, (err, data) => {
								if (err) {
									rej(err);
								} else {
									res(data);
								}
							});
						})
					);
				});
				const linkOwners = Promise.all(linkOwnerPromises).map(linked => {
					console.log('linkedOwner');
					return linked;
				});

				// Copy all contents from oldInstance to new instance
				const contentPromises = [];
				oldCollectionData.contents.forEach(content => {
					content = sanitize(content);
					let schedules = content.schedules;
					let locations = content.locations;
					delete content.schedules;
					delete content.locations;
					const contentPromise = newCollectionInstance.contents.create(content)
						.then(newContentInstance => {
							const relationPromises = [];
							if (schedules && schedules.length > 0) {
								schedules = schedules.map(schedule => sanitize(schedule));
								relationPromises.push(
									newContentInstance.schedules.create(schedules)
								);
							}
							if (locations && locations.length > 0) {
								locations = locations.map(location => sanitize(location));
								relationPromises.push(
									newContentInstance.locations.create(locations)
								);
							}
							return Promise.all(relationPromises);
						});
					contentPromises.push(contentPromise);
				});
				const linkContents = Promise.all(contentPromises)
					.catch((exception) => {
						console.error('linkContents:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('contents linked');
						console.log(linked);
						return linked;
					});

				// link calendars
				const newCalendards = oldCollectionData.calendars.map(calendar => sanitize(calendar));
				const linkCalendars = newCollectionInstance.calendars
					.create(newCalendards)
					.catch((exception) => {
						console.error('linkCalendars:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('Calendars Created');
						console.log(linked);
						return linked;
					});

				// Copy topics from old collection to new collection
				const linkTopics = new Promise((resolve, reject) => {
					oldCollectionInstance.__get__topics((error, oldTopicInstances) => {
						if (error) {
							console.log('linkTopicsError');
							console.log(error);
							reject(error);
						} else {
							const linkTopicPromises = [];
							oldTopicInstances.forEach((oldTopicInstance) => {
								linkTopicPromises.push(
									new Promise((res, rej) => {
										newCollectionInstance.__link__topics(oldTopicInstance.id, (err, data) => {
											if (err) {
												rej(err);
											} else {
												res(data);
											}
										});
									})
								);
							});
							Promise.all(linkTopicPromises)
								.then(result => {
									console.log('linkTopic_copied');
									resolve(result);
								}).catch(err => {
									reject(err);
								});
						}
					});
				});

				// Copy payoutrules from old collection to new collection

				const newPayoutRules = oldCollectionData.payoutrules.map(payoutrule => sanitize(payoutrules));
				const linkPayoutRules = newCollectionInstance.payoutrules
					.create(newPayoutRules)
					.catch((exception) => {
						console.error('linkPayoutRules:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('Payout Rules Created');
						console.log(linked);
						return linked;
					});

				// Copy certificate templates
				const newCertificateTemplates = oldCollectionData.certificate_templates
					.map(certificate_template => sanitize(certificate_template));
				const linkCertificateTemplate = newCollectionInstance
					.certificate_templates.create(newCertificateTemplates)
					.catch((exception) => {
						console.error('certificate_templates:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('Certificate templates linked');
						console.log(linked);
						return linked;
					});

				// Copy Promo Codes
				const newpromoCodes = oldCollectionData.promoCodes.map(promoCode => sanitize(promoCode));
				const linkPromoCodes = newCollectionInstance.promoCodes
					.create(newpromoCodes)
					.catch((exception) => {
						console.error('linkPromoCodes:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('Promocodes linked');
						console.log(linked);
						return linked;
					});

				// Copy rewards
				const newReward = oldCollectionData.rewards.map(reward => sanitize(reward));
				const linkRewards = newCollectionInstance.rewards
					.create(newReward)
					.catch((exception) => {
						console.error('linkRewards:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('Rewards Linked');
						console.log(linked);
					});

				// { 'assessment_models': ['assessment_na_rules', 'assessment_rules'] }

				const assessment_models_promises = [];
				oldCollectionData.assessment_models.forEach(assessment_model => {
					assessment_model = sanitize(assessment_model);
					let assessment_na_rules = assessment_model.assessment_na_rules;
					let assessment_rules = assessment_model.assessment_rules;
					delete assessment_model.assessment_na_rule;
					delete assessment_model.assessment_rules;
					const relationPromises = [];
					const createAssessmentModel = newCollectionInstance.assessment_models
						.create(assessment_model).then(newAssessmentInstance => {
							if (assessment_na_rules && assessment_na_rules.length > 0) {
								assessment_na_rules = assessment_na_rules.map(assessment_na_rule => sanitize(assessment_na_rule));
								relationPromises.push(
									newAssessmentInstance.assessment_na_rules.create(assessment_na_rules)
								);
							}
							if (assessment_rules && assessment_rules.length > 0) {
								assessment_rules = assessment_rules.map(assessment_rule => sanitize(assessment_rule));
								relationPromises.push(
									newAssessmentInstance.assessment_rules.create(assessment_rules)
								);
							}
							return Promise.all(relationPromises);
						});
					assessment_models_promises.push(createAssessmentModel);
				});
				const linkAssessment = Promise.all(assessment_models_promises)
					.catch((exception) => {
						console.error('linkAssessment:', exception);
						return Promise.reject(exception);
					})
					.map(linked => {
						console.log('ASsessments created');
						console.log(linked);
						return linked;
					});

				return Promise.all([
					linkOwners, linkContents, linkCalendars, linkTopics, linkPayoutRules, linkCertificateTemplate,
					linkPromoCodes, linkRewards, linkAssessment
				]);
			}).then((dataCopied => {
				console.log('All data copied successfully sending response');
				return Promise.resolve({
					status: 'success',
					newCollectionId: newCollectionInstance.id
				});
			})).catch(err => {
				console.log('Error in copying data');
				console.log(err);
				return Promise.reject(new Error(g.f(err)));
			});
	};

	
	Collection.remoteMethod(
		'submitForReview',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'string' },
			http: { path: '/:id/submitForReview', verb: 'post' }
		}
	);

	Collection.remoteMethod(
		'approve',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/approve', verb: 'post' }
		}
	);

	Collection.remoteMethod(
		'reject',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/reject', verb: 'post' }
		}
	);

	Collection.remoteMethod(
		'etherInfo',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/ether', verb: 'get' }
		}
	);

	Collection.remoteMethod(
		'addToEthereum',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/ether', verb: 'post' }
		}
	);

	Collection.remoteMethod(
		'fetchTrending',
		{
			accepts: [
				{ arg: 'req', type: 'object', http: { source: 'req' } },
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/trending', verb: 'get' }
		}
	);

	Collection.remoteMethod(
		'announceResult',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/announceResult', verb: 'post' }
		}
	);

	Collection.remoteMethod(
		'fixDatabase',
		{
			accepts: [
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/fixDatabase', verb: 'get' }
		});

	Collection.remoteMethod(
		'checkParticipantOnBlockchain',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'fk', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/peers/:fk/ether', verb: 'get' }
		});

	Collection.remoteMethod(
		'getBlockchainParticipants',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/peers/ether', verb: 'get' }
		});

	Collection.remoteMethod(
		'addParticipantToEthereum',
		{
			accepts: [
				{ arg: 'id', type: 'string', required: true },
				{ arg: 'participantId', type: 'string', required: true },
				{ arg: 'req', type: 'object', http: { source: 'req' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/:id/peers/:participantId/ether', verb: 'post' }
		});

	Collection.remoteMethod(
		'cloneCollection',
		{
			accepts: [
				{ arg: 'collectionId', type: 'string', required: true },
				{ arg: 'body', type: 'object', http: { source: 'body' } }
			],
			returns: { arg: 'result', type: 'object', root: true },
			http: { path: '/clone/:collectionId', verb: 'post' }
		});

};
