'use strict';
let CronJob = require('cron').CronJob;
let moment = require('moment-timezone');
let client = require('../esConnection.js');
let bulk = [];
let app = require('../server');
let request = require('request');
let loopback = require('../../node_modules/loopback/lib/loopback');
let path = require('path');
const _ = require('lodash');
const protocolUrl = app.get('protocolUrl');
var imageRequest = require('request').defaults({ encoding: null });
let host = app.get('host');
let port = app.get('port');
let restApiRoot = app.get('restApiRoot');
const Promise = require('bluebird');
let requestPromise = require('request-promise-native');

module.exports = function setupCron(server) {

	let makebulk = function (modelInstances, modelName, typeDifferentiator, callback) {
		bulk = [];
		for (let current in modelInstances) {
			let typeValue = typeDifferentiator === 'none' ? modelName : modelInstances[current][typeDifferentiator];
			bulk.push(
				// {action: {metadata}}
				{ index: { _index: app.get('uniqueDeveloperCode') + '_' + modelName, _type: typeValue, _id: modelInstances[current].id } },
				modelInstances[current]
			);
		}
		callback(bulk);
	};

	let indexall = function (madebulk, modelName, callback) {
		client.bulk({
			maxRetries: 5,
			body: madebulk
		}, function (err, resp, status) {
			if (err) {
				console.log(err);
			}
			else {
				callback(resp.items);
			}
		});
	};

	/*let tempJob = new CronJob('*!/20 * * * * *', function() {
				
				server.models.peer.find({include: 'profiles'}, function(err, peerInstances) {
					if (err) {
						console.log(err);
					} else {
						peerInstances.forEach(peerInstance => {
							if (peerInstance.profiles().length > 1) {
								console.log('Found multiple profiles for: ' + peerInstance.id);
								server.models.profile.destroyById(peerInstance.profiles()[1].id, function(err, resp) {
									if (err) {
										console.log(err);
									} else {
										console.log('Deleted profile id: ' + peerInstance.profiles()[1].id + '. With result: ' + JSON.stringify(resp));
									}
								});
							}
						});
					}
				});
			}, function() {
				// Callback function when job ends.
			},
			true,
			'UTC'
	);*/

	// Setup cron to index data on ES
	//let indexingJob = new CronJob('*/20 * * * * *', function() {
	let indexingJob = new CronJob('00 00 * * * *', function () {

		console.info("\n\n************\nRunning hourly cron job. Functions: \n- Index all new models to elastic search server.\n**********\n\n");

		// Index all peers
		server.models.peer.find({ include: ['profiles', 'scholarships_joined'] }, function (err, peerInstances) {
			makebulk(peerInstances, 'peer', 'none', function (response) {
				//console.log("Indexing Peers: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'peer', function (response) {
						console.log(response[0].index.error);
					});
				}
			});
		});

		// Index all collections
		server.models.collection.find({ include: 'topics', where: { status: 'active' } }, function (err, collectionInstances) {
			makebulk(collectionInstances, 'collection', 'none', function (response) {
				//console.log("Indexing Collections: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'collection', function (response) {
						console.log(response);
					});
				}
			});
		});

		// Index all contents
		server.models.content.find(function (err, contentInstance) {
			makebulk(contentInstance, 'content', 'none', function (response) {
				//console.log("Indexing Contents: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'content', function (response) {
						console.log(response);
					});
				}
			});
		});

		// Index all topics
		server.models.topic.find(function (err, topicInstances) {
			makebulk(topicInstances, 'topic', 'none', function (response) {
				//console.log("Indexing Topics: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'topic', function (response) {
						console.log(response);
					});
				}
			});
		});

		// Index all communities
		server.models.community.find(function (err, communityInstances) {
			makebulk(communityInstances, 'community', 'none', function (response) {
				//console.log("Indexing Community: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'community', function (response) {
						console.log(response);
					});
				}
			});
		});

		// Index all contacts
		server.models.contact.find(function (err, contactInstances) {
			makebulk(contactInstances, 'contact', 'none', function (response) {
				//console.log("Indexing Contacts: " + JSON.stringify(response));
				if (response.length > 0) {
					indexall(response, 'contact', function (response) {
						console.log(response);
					});
				}
			});
		});

		// Index all questions
		server.models.question.find(function (err, questionInstances) {
			makebulk(questionInstances, 'question', 'none', function (response) {
				if (response.length > 0) {
					indexall(response, 'question', function (response) {
						console.log(response);
					});
				}
			});
		});

	}, function () {
		// Callback function when job ends.
	},
		true,
		'UTC'
	);

	// Runs once every 24 hours
	const collectionCompleteCron = new CronJob('00 00 00 * * *',
		/*const collectionCompleteCron = new CronJob('*!/20 * * * * *',*/
		function () {
			console.info('\n\n********\nRunning midnight cron job. Functions: \n- Check for completed cohorts - mark them complete - send summary and reminders\n- Check upcoming cohorts and send reminder emails to student and teacher\n**********\n\n');

			// Try Karma Rewards
			request
				.post({
					url: protocolUrl + 'karma/mintRewards',
					json: true
				}, function (err, response, data1) {
					if (err) {
						console.error(err);
					} else if (data1 && data1.error) {
						console.error(data1.error);
					} else {
						console.log('Tried karma minting: ' + JSON.stringify(data1));
					}
					// Send email to admin about status
					let message = {
						result: JSON.stringify(data1),
						error: err || data1.error
					};
					let renderer = loopback.template(path.resolve(__dirname, '../../server/views/karmaRewardStatus.ejs'));
					let html_body = renderer(message);
					loopback.Email.send({
						to: 'aakash@theblockchainu.com',
						from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
						subject: 'Attempted Karma rewards',
						html: html_body
					})
						.then(function (response) {
							console.log('email sent! - ');
						})
						.catch(function (err) {
							console.log('email error! - ' + err);
						});
				});

			server.models.collection.find({ 'where': { 'and': [{ 'status': 'active' }, { 'type': { 'neq': 'session' } }] }, 'include': ['calendars', { 'contents': 'schedules' }, 'topics', { 'comments': 'peer' }, 'participants', { 'owners': 'profiles' }] }, function (err, collectionInstances) {
				collectionInstances.forEach(collection => {
					if (collection.calendars() !== undefined) {
						collection.calendars().forEach(calendar => {
							const collectionCalendarEndDate = moment(calendar.endDate);
							const collectionCalendarStartDate = moment(calendar.startDate);
							const now = moment();
							if (calendar.status !== 'complete' && collectionCalendarEndDate.add(1, 'days').diff(now) <= 0) {
								// Mark the calendar as complete
								const newCalendar = calendar;
								newCalendar.status = 'complete';
								server.models.calendar.upsertWithWhere({ id: calendar.id }, newCalendar, function (err, updatedCalendarInstance) {
									if (err) {
										console.log('Could not mark calendar as complete. Error: ' + err);
									}
									else {
										console.log('Marked calendar as complete');
									}
								});

								// Get all students of this calendar
								collection.__get__participants({ 'relWhere': { 'calendarId': calendar.id }, 'include': 'profiles' }, function (err, participantInstances) {
									if (!err && participantInstances.length > 0) {
										let totalHours = 0;
										collection.contents().forEach(content => {
											if (content.schedules() && content.schedules().length > 0) {
												totalHours += moment(content.schedules()[0].endTime).diff(content.schedules()[0].startTime, 'hours');
											}
										});
										participantInstances.forEach(participantInstance => {
											// Send email to student asking to review the teacher
											let message = {
												type: collection.type,
												owner: _.upperFirst(collection.owners()[0].profiles()[0].first_name) + ' ' + _.upperFirst(collection.owners()[0].profiles()[0].last_name),
												collectionId: collection.id, calendarId: calendar.id
											};
											let renderer = loopback.template(path.resolve(__dirname, '../../server/views/reviewReminderEmailStudent.ejs'));
											let html_body = renderer(message);
											loopback.Email.send({
												to: participantInstance.email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Write a review for ' + collection.owners()[0].profiles()[0].first_name + ' ' + collection.owners()[0].profiles()[0].last_name,
												html: html_body
											})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});
											// Send completion summary to student
											let myCommentCountStudent = 0;
											collection.comments().forEach(comment => {
												if (comment.peer() && comment.peer().length > 0 && comment.peer()[0].id === participantInstance.id) {
													myCommentCountStudent++;
												}
											});
											message = {
												type: collection.type,
												collectionImage: collection.imageUrls[0],
												collectionTitle: _.upperFirst(collection.title),
												collectionStartDate: moment(calendar.startDate).format('Do MMM'),
												collectionEndDate: moment(calendar.endDate).format('Do MMM, YYYY'),
												academicGyan: collection.academicGyan,
												nonAcademicGyan: collection.nonAcademicGyan,
												viewTime: totalHours,
												days: moment(calendar.endDate).diff(calendar.startDate, 'days'),
												contentCount: collection.contents().length,
												contentSplit: _.uniq(collection.contents().map(content => content.type)).toString(),
												totalCommentCount: collection.comments() ? collection.comments().length : 0,
												personalCommentCount: myCommentCountStudent,
												topics: _.uniq(collection.topics().map(topic => topic.name)).toString(),
												collectionId: collection.id,
												calendarId: calendar.id
											};
											renderer = loopback.template(path.resolve(__dirname, '../../server/views/cohortCompletionSummaryStudent.ejs'));
											html_body = renderer(message);
											loopback.Email.send({
												to: participantInstance.email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Your summary for ' + _.upperFirst(collection.title),
												html: html_body
											})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});
											// Send notification to student asking to review teacher

										});

										// Send email to teacher asking to assess all students
										let message = {
											collectionId: collection.id,
											collectionTitle: _.upperFirst(collection.title),
											collectionType: collection.type,
											collectionImage: collection.imageUrls[0],
											academicGyan: collection.academicGyan,
											nonAcademicGyan: collection.nonAcademicGyan,
											collectionCalendarId: calendar.id,
											participantCount: participantInstances.length,
											collectionStartDate: moment(calendar.startDate).format('Do MMM'),
											collectionEndDate: moment(calendar.endDate).format('Do MMM, YYYY')
										};
										let renderer = loopback.template(path.resolve(__dirname, '../../server/views/assessmentReminderEmailTeacher.ejs'));
										let html_body = renderer(message);
										loopback.Email.send({
											to: collection.owners()[0].email,
											from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
											subject: 'Assess performance of your students',
											html: html_body
										})
											.then(function (response) {
												console.log('email sent! - ');
											})
											.catch(function (err) {
												console.log('email error! - ' + err);
											});

										// Send cohort completion summary to teacher
										let myCommentCount = 0;
										collection.comments().forEach(comment => {
											if (comment.peer() && comment.peer().length > 0 && comment.peer()[0].id === collection.owners()[0].id) {
												myCommentCount++;
											}
										});
										message = {
											type: collection.type,
											collectionImage: collection.imageUrls[0],
											collectionTitle: _.upperFirst(collection.title),
											collectionStartDate: moment(calendar.startDate).format('Do MMM'),
											collectionEndDate: moment(calendar.endDate).format('Do MMM, YYYY'),
											academicGyan: collection.academicGyan,
											nonAcademicGyan: collection.nonAcademicGyan,
											viewTime: totalHours,
											days: moment(calendar.endDate).diff(calendar.startDate, 'days'),
											participantCount: participantInstances.length,
											participantCompletionRatio: 100,
											contentCount: collection.contents().length,
											contentSplit: _.uniq(collection.contents().map(content => content.type)).toString(),
											totalCommentCount: collection.comments() ? collection.comments().length : 0,
											personalCommentCount: myCommentCount,
											topics: _.uniq(collection.topics().map(topic => topic.name)).toString(),
											collectionId: collection.id,
											calendarId: calendar.id
										};
										renderer = loopback.template(path.resolve(__dirname, '../../server/views/cohortCompletionSummaryTeacher.ejs'));
										html_body = renderer(message);
										loopback.Email.send({
											to: collection.owners()[0].email,
											from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
											subject: 'Your summary for ' + _.upperFirst(collection.title),
											html: html_body
										})
											.then(function (response) {
												console.log('email sent! - ');
											})
											.catch(function (err) {
												console.log('email error! - ' + err);
											});
										// TODO: Send notification to teacher asking to review students
										// TODO: Initiate payouts to teacher
									}
								});
							}

							// Get upcoming cohorts starting the next day
							if (calendar.status !== 'complete' && collectionCalendarStartDate.isBetween(now, collectionCalendarStartDate.add(1, 'days'))) {

								// Get all students of this calendar
								collection.__get__participants({ 'relWhere': { 'calendarId': calendar.id }, 'include': 'profiles' }, function (err, participantInstances) {
									if (!err && participantInstances.length > 0) {
										participantInstances.forEach(participantInstance => {
											const participantTimezone = participantInstance.profiles[0].timezone ? participantInstance.profiles[0].timezone.toUpperCase() : 'PST';
											// Send email to student reminding of upcoming cohort
											const message = {
												type: collection.type,
												title: _.upperFirst(collection.title),
												startDate: (participantInstance.profiles[0].timezone) ?
													collectionCalendarStartDate.tz(participantTimezone).format('DD MMM') :
													collectionCalendarStartDate.format('DD MMM'),
												endDate: (participantInstance.profiles[0].timezone) ?
													collectionCalendarEndDate.tz(participantTimezone).format('DD MMM') :
													collectionCalendarEndDate.format('DD MMM'),
												owner: _.upperFirst(collection.owners()[0].profiles()[0].first_name) + ' ' + _.upperFirst(collection.owners()[0].profiles()[0].last_name),
												collectionId: collection.id, calendarId: calendar.id
											};
											const renderer = loopback.template(path.resolve(__dirname, '../../server/views/upcomingCohortReminderStudent.ejs'));
											const html_body = renderer(message);
											loopback.Email.send({
												to: participantInstance.email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Upcoming ' + collection.type + ' -- ' + _.upperFirst(collection.title),
												html: html_body
											})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});

										});
									}
								});

								// Send email to teacher reminding of upcoming cohort
								const message = {
									type: collection.type,
									title: _.upperFirst(collection.title),
									startDate: collectionCalendarStartDate.format('DD MMM'),
									endDate: collectionCalendarEndDate.format('DD MMM'),
									owner: _.upperFirst(collection.owners()[0].profiles()[0].first_name) + ' ' + _.upperFirst(collection.owners()[0].profiles()[0].last_name),
									collectionId: collection.id,
									calendarId: calendar.id
								};
								const renderer = loopback.template(path.resolve(__dirname, '../../server/views/upcomingCohortReminderTeacher.ejs'));
								const html_body = renderer(message);
								loopback.Email.send({
									to: collection.owners()[0].email,
									from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
									subject: 'Upcoming ' + collection.type + ' cohort -- ' + _.upperFirst(collection.title),
									html: html_body
								})
									.then(function (response) {
										console.log('email sent! - ');
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});
							}
						});
					}
				});
			});
		},
		function () {

		},
		true,
		'UTC'
	);

	const calculateCollectionRating = function (collectionId, reviewArray) {
		let reviewScore = 0;
		for (const reviewObject of reviewArray) {
			if (reviewObject.collectionId !== undefined && reviewObject.collectionId === collectionId) { reviewScore += reviewObject.score; }
		}
		return (reviewScore / (reviewArray.length * 5)) * 5;
	};

	const calculateCollectionRatingCount = function (collectionId, reviewArray) {
		let reviewCount = 0;
		for (const reviewObject of reviewArray) {
			if (reviewObject.collectionId !== undefined && reviewObject.collectionId === collectionId) { reviewCount++; }
		}
		return reviewCount;
	};


	const saveCollectionCache = (type) => {
		const today = moment();
		// const trendingLearningPathIds = [
		// 	'e022bacb-15a8-422a-82d5-b02ceaa2c0b5',
		// 	'643c9bdd-744b-4c39-8996-1f06143b90de',
		// 	'c5011060-8cec-4d28-a883-2e635de8536b',
		// 	'5885afc8-15e2-42fa-b75f-3260f69d6f99',
		// ];

		// prod paths
		const trendingLearningPathIds = [
			'a1b0b2f4-db47-4792-a300-afc1fe26a4fe',
			'4166c51a-4cb5-447d-bbaf-7d3539773182',
			'2224b149-fb86-4946-b93b-8d7f03dcc556',
			'e89ee13b-5eea-4313-beaa-dc9cda1ada77',
		];

		let query;

		if (type === 'learning-path') {
			query = {
				'include': [
					'topics',
					{ 'owners': ['profiles', 'topicsTeaching'] },
					{
						'relation': 'contents',
						'scope': {
							'include': [{ 'courses': [{ 'owners': ['profiles'] }] }],
							'order': 'contentIndex ASC'
						}
					},
				],
				'order': 'createdAt DESC',
				'where': {
					'type': type,
					'id': { 'inq': trendingLearningPathIds }
				}
			};
		} else {
			query = {
				'include': [
					'calendars',
					'views',
					{ 'owners': ['reviewsAboutYou', 'profiles'] },
					'participants',
					{ 'bookmarks': 'peer' },
					{
						'contents':
							['schedules', 'locations']
					},
					'rewards',
					'topics'
				],
				'order': 'createdAt DESC',
				'where': {
					'type': type
				}
			};
		}
		let resultArray = [];
		return server.models.collection.find(query)
			.then((allCollectionInstances) => {
				if (type === 'learning-path') {
					resultArray = allCollectionInstances.map(collectionInstances => {
						return JSON.stringify(collectionInstances);
					});
				} else {
					let collectionInstances = [];
					allCollectionInstances.forEach(collectionInstance => {
						const collection = collectionInstance.toJSON();
						if (collection.status === 'active') {
							let hasActiveCalendar = false;
							if (collection.type === 'experience' && collection.contents) {
								let experienceLocation = 'Unknown location';
								let lat = 37.5293864;
								let lng = -122.008471;
								collection.contents.forEach(content => {
									if (content.locations && content.locations.length > 0
										&& content.locations[0].city !== undefined
										&& content.locations[0].city.length > 0
										&& content.locations[0].map_lat !== undefined
										&& content.locations[0].map_lat.length > 0) {
										experienceLocation = content.locations[0].city;
										lat = parseFloat(content.locations[0].map_lat);
										lng = parseFloat(content.locations[0].map_lng);
									}
								});
								collection.location = experienceLocation;
								collection.lat = lat;
								collection.lng = lng;
							}
							if (collection.calendars) {
								collection.calendars.some(calendar => {
									if (moment(calendar.endDate).diff(today, 'days') >= -1) {
										hasActiveCalendar = true;
										return;
									}
								});
							}
							if (collection.owners && collection.owners.length > 0 && collection.owners[0].reviewsAboutYou) {
								collection.rating = calculateCollectionRating(collection.id, collection.owners[0].reviewsAboutYou);
								collection.ratingCount = calculateCollectionRatingCount(collection.id, collection.owners[0].reviewsAboutYou);
							}
							if (hasActiveCalendar || collection.type === 'guide') {
								collectionInstances.push(collection);
							}
						}
					});

					const latestCollections = [];

					for (let i = 0; i < collectionInstances.length && latestCollections.length < 2; i++) {
						latestCollections.push(JSON.stringify(collectionInstances[i]));
					}
					const popularCollections = [];
					collectionInstances = collectionInstances.slice(2);
					collectionInstances.sort((a, b) => {
						if (a.views.length > b.views.length) {
							return -1;
						} else if (a.views.length < b.views.length) {
							return 1;
						} else {
							return 0;
						}
					});
					for (let i = 0; i < collectionInstances.length && popularCollections.length < 3; i++) {
						popularCollections.push(JSON.stringify(collectionInstances[i]));
					}
					resultArray = popularCollections.concat(latestCollections);
				}
				return server.models.trending_cache.find();
			})
			.then((cacheInstance) => {
				if (cacheInstance && cacheInstance.length > 0) {
					return Promise.resolve(cacheInstance[0]);
				} else {
					return server.models.trending_cache.create();
				}
			})
			.then((cacheInstance) => {
				switch (type) {
					case 'class':
						cacheInstance.classArray = resultArray;
						break;
					case 'guide':
						cacheInstance.guideArray = resultArray;
						break;
					case 'experience':
						cacheInstance.experienceArray = resultArray;
						break;
					case 'bounty':
						cacheInstance.bountyArray = resultArray;
						break;
					case 'learning-path':
						cacheInstance.learningPathArray = resultArray;
						break;
					default:
						break;
				}
				return cacheInstance.save();
			});
	};

	// const trendingCollectionCron = new CronJob('*/5 * * * * *', function (params) {
	const trendingCollectionCron = new CronJob('00 00 * * * *', function (params) {
		const collectionTypes = ['guide', 'experience', 'class', 'bounty', 'learning-path'];
		//set trending collections for 24 hours

		Promise.each(collectionTypes, (type) => {
			return saveCollectionCache(type).then(val => {
				console.log(type + 'saved');
			});
		}).then(res => {
			console.log('trending saved');
		}).catch(err => {
			console.log('Error in saving trending collections');
			console.log(err);
		});
	}, function () {
		console.log('Cron over');
	}, true,
		'UTC'
	);


	// const testCron = new CronJob('*/5 * * * * *',
	// 	function (params) {

	// 	},
	// 	function () {
	// 	},
	// 	true,
	// 	'UTC'
	// );

	// Runs once every 10 minutes
	const tenMinuteCron = new CronJob('00 */10 * * * *',
		// const upcomingActivityCron = new CronJob('*/5 * * * * *',

		function () {

			// delete slots booked in last 10 mins but payment not yet done

			const now = moment();
			const query = {
				where: {
					type: 'session'
				},
				include: [
					{
						'contents': [
							'availabilities',
							{ 'peers': 'profiles' },
							'packages',
							'payments'
						]
					}
				]
			};
			server.models.collection.find(query).then((results) => {
				const promisesArray = [];
				results.forEach(collection => {
					const collectionJSON = collection.toJSON();
					collectionJSON.contents.forEach(content => {
						if (content.packages[0].price !== 0 && (!content.payments || content.payments.length < 1)) {
							const timeDifference = now.diff(moment(content.createdAt), 'minute') > 10;
							if (timeDifference) {
								promisesArray.push(
									server.models.content.destroyById(content.id)
								);
							}
						}
					});
				});
				return Promise.all(promisesArray);
			}).then(res => {
				console.log(res.length + 'deleted');
			}).catch(err => {
				console.log(err);
			});

			console.info('\n\n***********\nRunning 10 minute cron job. Functions: \n- Check if any upcoming activities in the next hour and send reminder emails to student and teacher\n**********\n\n');

			request
				.get({
					url: 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
					json: true
				}, function (err, response, data1) {
					if (err) {
						console.error(err);
					} else {
						console.log('Got eth rate: ' + data1.USD);
						const cacheData = {
							id: '1',
							ethRate: data1.USD
						};
						server.models.cache.upsert(cacheData, function (err, cacheInstance) {
							if (err) {
								console.log(err);
							} else {
								console.log('Updated cache with ethRate - ' + JSON.stringify(cacheInstance));
							}
						});
					}
				});

			request
				.get({
					url: protocolUrl + 'karma/mintRate',
					json: true
				}, function (err, response, data1) {
					if (err) {
						console.error(err);
					} else if (data1 && data1.error) {
						console.error(data1.error);
					} else {
						console.log('Got karma mint rate: ' + data1);
						const cacheData = {
							id: '1',
							karmaMintRate: data1
						};
						server.models.cache.upsert(cacheData, function (err, cacheInstance) {
							if (err) {
								console.log(err);
							} else {
								console.log('Updated cache with karma mint rate - ' + JSON.stringify(cacheInstance));
							}
						});
					}
				});

			request
				.get({
					url: protocolUrl + 'gyan/earnRate',
					json: true
				}, function (err, response, data1) {
					if (err) {
						console.error(err);
					} else if (data1 && data1.error) {
						console.error(data1.error);
					} else {
						console.log('Got gyan earn rate: ' + data1);
						const cacheData = {
							id: '1',
							gyanEarnRate: data1
						};
						server.models.cache.upsert(cacheData, function (err, cacheInstance) {
							if (err) {
								console.log(err);
							} else {
								console.log('Updated cache with gyan mint rate - ' + JSON.stringify(cacheInstance));
							}
						});
					}
				});

			// server.models.collection.find({ 'where': { 'and': [{ 'status': 'active' }, { 'type': { 'neq': 'session' } }] }, 'include': [{ 'contents': ['schedules', 'locations', 'submissions'] }, 'calendars', { 'owners': ['profiles', 'topicsTeaching', 'wallet', 'topicsTeaching'] }] }, function (err, collectionInstances) {
			// 	collectionInstances.forEach(collection => {
			// 		try {
			// 			if (collection.calendars() !== undefined) {
			// 				collection.calendars().forEach(calendar => {
			// 					let collectionCalendarStartDate = moment(calendar.startDate);
			// 					let collectionCalendarEndDate = moment(calendar.endDate);
			// 					let now = moment();
			// 					// console.log(collection.customUrl + ' ' + collectionCalendarStartDate.toString() + ' ' + collectionCalendarEndDate.toString());
			// 					if (calendar.status !== 'complete' && now.isBetween(collectionCalendarStartDate.subtract(1, 'days'), collectionCalendarEndDate)) {
			// 						// This collection has a currently running calendar
			// 						// Check if it has any upcoming activity
			// 						collection.contents().forEach(content => {
			// 							let schedules = content.schedules();
			// 							let scheduleData = schedules[0];
			// 							if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
			// 								let startDate = moment(calendar.startDate).add(scheduleData.startDay, 'days');
			// 								let endDate = moment(calendar.startDate).add(scheduleData.endDay, 'days');
			// 								if (scheduleData.startTime && scheduleData.endTime) {
			// 									const startTimeMoment = moment(scheduleData.startTime);
			// 									const endTimeMoment = moment(scheduleData.endTime);

			// 									startTimeMoment.set('date', startDate.get('date'));
			// 									startTimeMoment.set('month', startDate.get('month'));
			// 									startTimeMoment.set('year', startDate.get('year'));

			// 									endTimeMoment.set('date', endDate.get('date'));
			// 									endTimeMoment.set('month', endDate.get('month'));
			// 									endTimeMoment.set('year', endDate.get('year'));

			// 									if ((content.type !== 'video') && startTimeMoment.diff(now, 'minutes') >= 60 && startTimeMoment.diff(now, 'minutes') < 70) {
			// 										console.log('in it');
			// 										const teacherTimezone = collection.owners()[0].profiles()[0].timezone ? collection.owners()[0].profiles()[0].timezone.toUpperCase() : 'PST';
			// 										// Upcoming activity starts in 1 hour. Send notification and email to all participants
			// 										collection.__get__participants({ 'relWhere': { 'calendarId': calendar.id }, 'include': 'profiles' }, function (err, participantInstances) {
			// 											if (!err && participantInstances.length > 0) {
			// 												const activityTitle = _.upperFirst(content.title);
			// 												const collectionTitle = _.upperFirst(collection.title);
			// 												const collectionId = collection.id;
			// 												const collectionCalendarId = calendar.id;
			// 												const calendarId = calendar.id;
			// 												const activityId = content.id;
			// 												const collectionType = _.upperFirst(collection.type);
			// 												const activityImage = content.imageUrl ? content.imageUrl : '/assets/images/no-image.jpg';
			// 												const activityAddress = content.locations() && content.locations().length > 0 ? '#' + content.locations()[0].apt_suite + ', ' + content.locations()[0].street_address + ', ' + content.locations()[0].city + ', ' + content.locations()[0].state + ', ' + content.locations()[0].country + ' ' + content.locations()[0].zip : '';
			// 												const teacherImage = collection.owners()[0].profiles()[0].picture_url ? collection.owners()[0].profiles()[0].picture_url : '/assets/images/user-placeholder.jpg';
			// 												const teacherName = _.upperFirst(collection.owners()[0].profiles()[0].first_name) + ' ' + _.upperFirst(collection.owners()[0].profiles()[0].last_name);
			// 												const teacherHeadline = _.upperFirst(collection.owners()[0].profiles()[0].headline);
			// 												const teacherTopics = _.uniq(collection.owners()[0].topicsTeaching().map(topic => topic.name)).toString();
			// 												const teacherGyan = collection.owners()[0].wallet() ? collection.owners()[0].wallet()[0].gyan_balance : '0';
			// 												const participantCount = participantInstances.length;
			// 												participantInstances.forEach(participantInstance => {
			// 													const studentTimezone = participantInstance.profiles()[0].timezone ? participantInstance.profiles()[0].timezone.toUpperCase() : 'PST';
			// 													const startTime = startTimeMoment.tz(studentTimezone).format('h:mm a');
			// 													const endTime = endTimeMoment.tz(studentTimezone).format('h:mm a');
			// 													const studentName = _.upperFirst(participantInstance.profiles()[0].first_name) + ' ' + _.upperFirst(participantInstance.profiles()[0].last_name);
			// 													// Send email to student
			// 													let message = {
			// 														startTime: startTime,
			// 														endTime: endTime,
			// 														activityTitle: activityTitle,
			// 														collectionTitle: collectionTitle,
			// 														collectionId: collectionId,
			// 														calendarId: calendarId,
			// 														collectionCalendarId: collectionCalendarId,
			// 														activityId: activityId,
			// 														collectionType: collectionType,
			// 														activityImage: activityImage,
			// 														activityAddress: activityAddress,
			// 														teacherImage: teacherImage,
			// 														teacherName: teacherName,
			// 														teacherHeadline: teacherHeadline,
			// 														teacherTopics: teacherTopics,
			// 														teacherGyan: teacherGyan,
			// 														studentName: studentName
			// 													};
			// 													let renderer;
			// 													if (content.type === 'online') {
			// 														renderer = loopback.template(path.resolve(__dirname, '../../server/views/liveSessionReminderStudent.ejs'));
			// 													}
			// 													else if (content.type === 'project') {
			// 														renderer = loopback.template(path.resolve(__dirname, '../../server/views/projectSubmissionReminderStudent.ejs'));
			// 													}
			// 													else {
			// 														renderer = loopback.template(path.resolve(__dirname, '../../server/views/inpersonSessionReminderStudent.ejs'));
			// 													}
			// 													let html_body = renderer(message);
			// 													loopback.Email.send({
			// 														to: participantInstance.email,
			// 														from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
			// 														subject: 'Upcoming ' + content.type + ' activity',
			// 														html: html_body
			// 													})
			// 														.then(function (response) {
			// 															console.log('email sent! - ');
			// 														})
			// 														.catch(function (err) {
			// 															console.log('email error! - ' + err);
			// 														});
			// 												});
			// 												let renderer;
			// 												const startTime = startTimeMoment.tz(teacherTimezone).format('h:mm a');
			// 												const endTime = endTimeMoment.tz(teacherTimezone).format('h:mm a');
			// 												let message = {
			// 													startTime: startTime,
			// 													endTime: endTime,
			// 													activityTitle: activityTitle,
			// 													collectionTitle: collectionTitle,
			// 													collectionId: collectionId,
			// 													calendarId: calendarId,
			// 													collectionCalendarId: collectionCalendarId,
			// 													activityId: activityId,
			// 													collectionType: collectionType,
			// 													activityImage: activityImage,
			// 													activityAddress: activityAddress,
			// 													teacherImage: teacherImage,
			// 													teacherName: teacherName,
			// 													teacherHeadline: teacherHeadline,
			// 													teacherTopics: teacherTopics,
			// 													teacherGyan: teacherGyan,
			// 													participantCount: participantCount
			// 												};
			// 												// send email to teacher
			// 												if (content.type === 'online') {
			// 													renderer = loopback.template(path.resolve(__dirname, '../../server/views/liveSessionReminderTeacher.ejs'));
			// 												}
			// 												else if (content.type === 'project') {
			// 													renderer = loopback.template(path.resolve(__dirname, '../../server/views/projectSubmissionReminderTeacher.ejs'));
			// 												}
			// 												else {
			// 													renderer = loopback.template(path.resolve(__dirname, '../../server/views/inpersonSessionReminderTeacher.ejs'));
			// 												}
			// 												let html_body = renderer(message);
			// 												loopback.Email.send({
			// 													to: collection.owners()[0].email,
			// 													from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
			// 													subject: 'Upcoming ' + content.type + ' activity',
			// 													html: html_body
			// 												})
			// 													.then(function (response) {
			// 														console.log('email sent! - ');
			// 													})
			// 													.catch(function (err) {
			// 														console.log('email error! - ' + err);
			// 													});
			// 											}
			// 										});
			// 									}
			// 								} else {
			// 									console.log("Time Unavailable !");
			// 								}
			// 							} else {
			// 								console.log("Schedule Days Unavailable");
			// 							}
			// 						});
			// 					}
			// 				});
			// 			}
			// 		} catch (err) {
			// 			console.log(err);
			// 		}
			// 	});
			// });

			// upcoming session cron

			server.models.collection.find({ 'where': { 'and': [{ 'status': 'active' }, { 'type': 'session' }] }, 'include': [{ 'contents': [{ 'peers': ['profiles', 'topicsLearning', 'wallet'] }, 'availabilities', 'packages'] }, { 'owners': ['profiles', 'topicsTeaching', 'wallet'] }] }, function (err, collectionInstances) {
				collectionInstances.forEach(collection => {
					if (collection !== undefined && typeof collection === 'object') {
						// For every session instance
						try {
							collection.contents().forEach(sessionInstance => {
								let availabilities = sessionInstance.availabilities();
								let packages = sessionInstance.packages();
								let sessionParticipants = sessionInstance.peers();
								if (sessionInstance.sessionIsApproved && availabilities !== undefined && availabilities.length > 0 && packages !== undefined && packages.length > 0 && sessionParticipants !== undefined && sessionParticipants.length > 0) {
									availabilities = availabilities.sort((calEventa, calEventb) => (moment(calEventa.startDateTime).isAfter(moment(calEventb.startDateTime)) ? 1 : -1));
									const studentTimezone = sessionParticipants[0].profiles()[0].timezone ? sessionParticipants[0].profiles()[0].timezone.toUpperCase() : 'PST';
									const teacherTimezone = collection.owners()[0].profiles()[0].timezone ? collection.owners()[0].profiles()[0].timezone.toUpperCase() : 'PST';
									const startDateTime = moment.utc(availabilities[0].startDateTime).tz(teacherTimezone);
									const endDateTime = moment.utc(availabilities[availabilities.length - 1].startDateTime).tz(teacherTimezone).add(30, 'minutes');
									let now = moment.tz(teacherTimezone);
									console.log(teacherTimezone);

									if (startDateTime && endDateTime) {
										// check if it starts in the next 10 minutes??
										//console.log('Comparing session time: ' + startDateTime.format() + ' with current time: ' + now.format());
										console.log('startDateTime.diff ' + startDateTime.diff(now, 'minutes'));
										if (startDateTime.diff(now, 'minutes') >= 0 && startDateTime.diff(now, 'minutes') < 11) {
											// Upcoming mentor session starts in 10 minutes. Send notification and email to student and teacher
											//console.log('Sending notification to participant ' + sessionParticipants[0].profiles[0].first_name + ' ' + sessionParticipants[0].profiles[0].last_name + ' of session : ' + startDateTime.format('Do MMM h:mm a') + ' to ' + endDateTime.format('h:mm a') + ' with ' + collection.toJSON().owners[0].profiles[0].first_name);
											// Send email to student
											const teacherImage = collection.owners()[0].profiles()[0].picture_url ? collection.owners()[0].profiles()[0].picture_url : '/assets/images/user-placeholder.jpg';
											const teacherHeadline = collection.owners()[0].profiles()[0].headline;
											const teacherTopics = _.uniq(collection.owners()[0].topicsTeaching().map(topics => topics.name)).toString();
											const teacherGyan = collection.owners()[0].wallet() ? collection.owners()[0].wallet()[0].gyan_balance : '0';
											const studentImage = sessionParticipants[0].profiles()[0].picture_url ? sessionParticipants[0].profiles()[0].picture_url : '/assets/images/user-placeholder.jpg';
											const studentHeadline = sessionParticipants[0].profiles()[0].headline;
											const studentTopics = sessionParticipants[0].topicsTeaching() ? _.uniq(sessionParticipants[0].topicsTeaching().map(topics => topics.name)).toString() : [];
											const studentGyan = sessionParticipants[0].wallet() ? sessionParticipants[0].wallet()[0].gyan_balance : '0';
											console.log(startDateTime.toDate());
											console.log(availabilities[0].startDateTime);
											console.log(now.toDate());

											let message = {
												date: startDateTime.tz(studentTimezone).format('Do MMM, YYYY'),
												// startTime: startDateTime.format('h:mm a'),
												// endTime: endDateTime.format('h:mm a'),
												startingIn: startDateTime.diff(now, 'minutes'),
												teacherName: collection.owners()[0].profiles()[0].first_name + ' ' + collection.owners()[0].profiles()[0].last_name,
												studentName: sessionParticipants[0].profiles()[0].first_name + ' ' + sessionParticipants[0].profiles()[0].last_name,
												teacherImage: teacherImage,
												teacherHeadline: teacherHeadline,
												teacherTopics: teacherTopics,
												teacherGyan: teacherGyan,
												studentImage: studentImage,
												studentHeadline: studentHeadline,
												studentTopics: studentTopics,
												studentGyan: studentGyan
											};
											let renderer = loopback.template(path.resolve(__dirname, '../../server/views/peerSessionReminderStudent.ejs'));
											let html_body = renderer(message);
											loopback.Email.send({
												to: sessionParticipants[0].email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Upcoming mentor session with ' + collection.owners()[0].profiles()[0].first_name,
												html: html_body
											})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});

											renderer = loopback.template(path.resolve(__dirname, '../../server/views/peerSessionReminderTeacher.ejs'));
											html_body = renderer(message);
											loopback.Email.send({
												to: collection.owners()[0].email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Upcoming mentor session with ' + sessionParticipants[0].profiles()[0].first_name,
												html: html_body
											})
												.then(function (response) {
													console.log('email sent! - ');
												})
												.catch(function (err) {
													console.log('email error! - ' + err);
												});
										}
									} else {
										console.log("Time Unavailable !");
									}
								} else {
								}
							});
						} catch (err) {
							console.log(err);
						}
					}
				});
			});

			// check corestack student enrollment status
			console.log('check corestack student enrollment status');
			const corestack_student_query = {
				where: {
					'student_course_status': 'registered'
				},
				include: ['collections']
			};
			let tokenObject;
			app.models.corestack_token
				.getTokenObject()
				.then(tokenObjectInstance => {
					tokenObject = tokenObjectInstance;
					return server.models.corestack_student.find(corestack_student_query);
				})
				.then(corestack_students => {
					console.log('corestack_students');
					console.log(corestack_students);
					corestack_students.forEach(corestack_student => {
						console.log('corestack_student');
						console.log(corestack_student);
						const promise = requestPromise.get({
							url: app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/student/'
								+ corestack_student.student_id + '/' + corestack_student.course_id,
							json: true,
							headers: {
								'X-Auth-Token': tokenObject.data.token.key,
								'X-Auth-User': app.get('corestackUserName')
							},
						}).then(student_detail => {
							console.log('student details for ' + corestack_student.student_email);
							console.log(student_detail);
							if (student_detail.data.student_course_status === 'active') {
								console.log('saving data');
								const updatedData = { student_course_status: 'active' };
								const corestack_student_json = corestack_student.toJSON();
								app.models.corestack_student.upsertWithWhere({ id: corestack_student.id }, updatedData)
									.then(savedinstance => {
										console.log('Updated ' + corestack_student.student_email);
										console.log(savedinstance);
										let message = {
											guideUrl: 'https://theblockchainu.com/guide/' + corestack_student_json.collections[0].customUrl,
											guideTitle: corestack_student_json.collections[0].title.toUpperCase()
										};
										let renderer = loopback.template(path.resolve(__dirname, '../../server/views/corestackActivated.ejs'));
										let html_body = renderer(message);
										return loopback.Email.send({
											to: corestack_student_json.student_email,
											from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
											subject: 'Code Labs Activated!',
											html: html_body
										});
									}).then(function (response) {
										console.log('email sent! - ');
									})
									.catch(function (err) {
										console.log('email error! - ' + err);
									});

							}
						}).catch(err => {
							console.log('Error in processing ' + corestack_student.student_email);
							console.log(err);
						});
					});
				})
				.catch(err => {
					console.log('Error in corestack student cron');
					console.log(err);
				});


		},
		function () {

		},
		true,
		'UTC'
	);



	// Runs once every 7 days
	const weeklyCron = new CronJob('0 0 0 * * Sun',
		/*const collectionCompleteCron = new CronJob('*!/20 * * * * *',*/
		function () {
			console.info('Running Weekly Cron');
			const query = {
				'where': {
					'status': 'active'
				},
				'include': [
					'views',
					'calendars',
					{ 'contents': ['schedules', 'locations'] },
					'topics',
					{ 'comments': 'peer' },
					'participants',
					{ 'owners': 'profiles' }]
				,
				'order': 'createdAt DESC'
			};
			const newPrograms = [];
			let trendingPrograms = [];
			const upcomingPrograms = [];
			server.models.collection
				.find(query,
					(err, collectionInstances) => {
						let html_body;
						const now = moment();
						const weekAgo = moment().subtract(7, 'days');
						const weekAfter = moment().add(7, 'days');
						collectionInstances.forEach(collection => {
							if (err) {
								console.log(err);
							} else {
								if (collection.calendars() !== undefined && collection.status === 'active') {
									let trendingProgramAdded = false;
									let upcomingProgramAdded = false;

									if (collection.imageUrls && collection.imageUrls.length > 0) {
										collection.imageUrl = 'https://theblockchainu.com:3002' + collection.imageUrls[0];
									} else {
										collection.imageUrl = 'https://theblockchainu.com/assets/images/collection-placeholder.jpg';
									}
									collection.programLink = 'https://theblockchainu.com/' + collection.type + '/' + collection.customUrl;

									collection.title = _.upperFirst(collection.title);
									collection.type = _.upperFirst(collection.type);
									collection.subCategory = _.upperFirst(collection.subCategory);
									collection.location = '';
									if (collection.price === 0) {
										collection.price = 'FREE';
										collection.currency = ' ';
									}
									if (collection.type === 'experience' && collection.contents) {
										let experienceLocation = '';
										collection.contents.forEach(content => {
											if (content.locations && content.locations.length > 0
												&& content.locations[0].city !== undefined
												&& content.locations[0].city.length > 0) {
												experienceLocation = content.locations[0].city;
											}
										});
										collection.location = _.upperFirst(experienceLocation);
									}
									collection.calendars().some(calendar => {
										const collectionCalendarEndDate = moment(calendar.endDate);
										const collectionCalendarStartDate = moment(calendar.startDate);

										collection.startDate = collectionCalendarStartDate.format('dddd, Do MMMM');

										if (calendar.status !== 'complete' && collectionCalendarEndDate.isAfter(now.subtract(1, 'days'))) {
											if (trendingProgramAdded && upcomingProgramAdded) {
												return true;
											}
											if (collectionCalendarStartDate.isBetween(now.subtract(1, 'days'), weekAfter)
												&& !upcomingProgramAdded && upcomingPrograms.length < 3) {
												upcomingPrograms.push(collection);
												upcomingProgramAdded = true;
											}
											if (!trendingProgramAdded) {
												trendingPrograms.push(collection);
												trendingProgramAdded = true;
											}
										}
									});
									const createdAt = moment(collection.createdAt);
									if (createdAt.isBetween(weekAgo, now.add(1, 'days')) && newPrograms.length < 3) {
										newPrograms.push(collection);
									}
								}
							}

						});

						trendingPrograms = trendingPrograms.sort((a, b) => {
							if (a.views.length > b.views.length) {
								return 1;
							} else if (a.views.length < b.views.length) {
								return -1;
							} else {
								return 0;
							}
						});

						trendingPrograms = trendingPrograms.slice(0, 3);

						if (newPrograms.length > 2 || trendingPrograms.length > 2 || upcomingPrograms.length > 2) {
							// Send emails
							let message = {
								newPrograms: newPrograms,
								trendingPrograms: trendingPrograms,
								upcomingPrograms: upcomingPrograms
							};
							const renderer = loopback.template(path.resolve(__dirname, '../../server/views/weeklyDigest.ejs'));
							html_body = renderer(message);
							console.info('fetching peers');
							server.models.peer.find(function (err, peerInstances) {
								peerInstances.forEach(peer => {
									console.info('Sending weekly digest to' + peer.email);
									loopback.Email.send({
										to: peer.email,
										from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
										subject: 'This Week\'s Highlights',
										html: html_body
									},
										(err, mail) => {
											if (err) {
												console.log(err);
											} else {
												console.log('email sent to' + peer.email);
											}

										}
									);
								});
							});
						} else {
							console.log('Not enough developments to send email');
						}
					}
				);
		},
		function () {
			console.log('Cron Over');
		},
		true,
		'UTC'
	);
};
