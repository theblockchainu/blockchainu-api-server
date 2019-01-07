'use strict';
let loopback = require('../../node_modules/loopback/lib/loopback');
let app = require('../../server/server');
const protocolUrl = app.get('protocolUrl');
let request = require('request');
let _ = require('lodash');
let moment = require('moment');
const qrcode = require('yaqrcode');
var sha256 = require('js-sha256');
var intoStream = require('into-stream');
let path = require('path');
let Promise = require('bluebird');
let requestPromise = require('request-promise-native');

module.exports = function (Assessmentresult) {
	
	Assessmentresult.observe('after save', function (ctx, next) {
		let assessment = ctx.instance;
		let cohortStartDate, cohortEndDate;
		// Link this assessment result to Calendar Node, Assessment Rule Node, 2 Assessment NA Rule Nodes and Peer node.
		// Then get the assessment result object with all the linked nodes and collection
		assessment.calendars.add(assessment.calendarId)
				.then((calendars) => {
					return assessment.assessment_rules.add(assessment.assessmentRuleId);
				})
				.then((assessment_rules) => {
					return assessment.assessment_na_rules.add(assessment.assessmentEngagementRuleId);
				})
				.then((assessment_na_rules) => {
					return assessment.assessment_na_rules.add(assessment.assessmentCommitmentRuleId);
				})
				.then((assessment_na_rules) => {
					return assessment.assessees.add(assessment.assesseeId);
				})
				.then((assessees) => {
					return Assessmentresult
							.findById(assessment.id, {
								include: [
									{ 'assessees': 'profiles' },
									{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } },
									'assessment_na_rules',
									'calendars'
								]
							});
				})
				.then((assessmentResultInstance) => {
					const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
					
					// If there is a certificate template
					if (assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates && assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates.length > 0) {
						// Prepare the certificate template for variable value insertion
						const certificateTemplate = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates[0];
						const template = certificateTemplate.certificateHTML.replace(/\\n/g, '');
						_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;
						var compiled = _.template(template);
						
						// Set start and end date
						if (assessmentResultInstanceJSON.calendars && assessmentResultInstanceJSON.calendars.length > 0) {
							cohortStartDate = moment(assessmentResultInstanceJSON.calendars[0].startDate).format('Do MMM, YYYY');
							cohortEndDate = moment(assessmentResultInstanceJSON.calendars[0].endDate).format('Do MMM, YYYY');
						}
						// Create a string of topics for blockchain
						let topicString = '';
						assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].topics.forEach(topic => {
							topicString.concat(topic.name + ' ');
						});
						topicString = _.trim(topicString);
						// Calculate student's academic and non-academic GYAN earned based on received assessment
						const gyanEarned = Math.floor(((assessmentResultInstanceJSON.assessment_rules[0].gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan) + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan);
						let naGyan = 0;
						assessmentResultInstanceJSON.assessment_na_rules.forEach(naRule => {
							if (naRule.value === 'engagement') {
								naGyan += Math.floor(((naRule.gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan) * (assessmentResultInstanceJSON.assessmentEngagementResult) / 100);
							} else if (naRule.value === 'commitment') {
								naGyan += Math.floor(((naRule.gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan) * (assessmentResultInstanceJSON.assessmentCommitmentResult) / 100);
							}
						});
						// Round off value of GYAN
						const aGyan = Math.floor((assessmentResultInstanceJSON.assessment_rules[0].gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan);
						
						const calendar = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].calendars
								.find((calendarObj) => {
									return calendarObj.id === assessmentResultInstanceJSON.calendarId;
								});
						
						// Get instance of peer who is being assessed
						Assessmentresult.app.models.peer.findById(assessmentResultInstanceJSON.assessees[0].id, (errorPeer, instancePeer) => {
							if (errorPeer) {
								console.log(errorPeer);
								next(new Error('User ID not found. Skipping Certificate Save.'));
							} else {
								// Create a blank certificate node for this user
								instancePeer.certificates.create({}, (err, certificateInstanceObj) => {
									if (err) {
										next(err);
									} else {
										console.log('CENTRALIZED SERVER DONE. NOW COMPILING DISPLAY HTML FOR VARIABLES');
										const certificateInstance = certificateInstanceObj.toJSON();
										const displayHtml = compiled({
											participantName: _.upperFirst(assessmentResultInstanceJSON.assessees[0].profiles[0].first_name) + ' ' + _.upperFirst(assessmentResultInstanceJSON.assessees[0].profiles[0].last_name),
											topics: topicString,
											assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
											cohortStartDate: cohortStartDate,
											cohortEndDate: cohortEndDate,
											issuerName: _.upperFirst(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].first_name) + ' ' + _.upperFirst(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].last_name),
											difficultyLevel: assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].difficultyLevel,
											gyanEarned: gyanEarned,
											issueDate: moment().format('Do MMM, YYYY'),
											expiryDate: moment(certificateTemplate.expiryDate).format('Do MMM, YYYY'),
											QRCode: qrcode('https://theblockchainu.com/certificate/' + certificateInstance.id, {
												size: 125
											})
										});
										console.log('DISPLAY HTML READY');
										console.log('NOW PREPARING CERTIFICATE JSON');
										const certificate = {
											"type": "certificate",
											"id": certificateInstance.id,
											"issuer": {
												"id": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].id,
												"ethAddress": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].ethAddress,
												"profile": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0]
											},
											"recipient": {
												"id": assessmentResultInstanceJSON.assessees[0].id,
												"ethAddress": assessmentResultInstanceJSON.assessees[0].ethAddress,
												"profile": assessmentResultInstanceJSON.assessees[0].profiles[0]
											},
											"collection": {
												"id": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id,
												"blockchainId": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id.replace(/\-/g, ''),
												"type": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].type,
												"title": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].title,
												"language": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].language,
												"headline": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].headline,
												"description": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].description,
												"difficultyLevel": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].difficultyLevel,
												"prerequisites": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].prerequisites,
												"maxSpots": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].maxSpots,
												"videoUrls": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].videoUrls,
												"imageUrls": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].imageUrls,
												"totalHours": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].totalHours,
												"price": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].price,
												"currency": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].currency,
												"cancellationPolicy": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].cancellationPolicy,
												"ageLimit": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].ageLimit,
												"aboutHost": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].aboutHost,
												"notes": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].notes,
												"status": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].status,
												"academicGyan": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan,
												"nonAcademicGyan": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan,
												"createdAt": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].createdAt,
												"assessment": {
													"type": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].type,
													"style": assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].style,
													"result": assessmentResultInstanceJSON.assessment_rules[0].value,
													"academicGyanEarned": aGyan,
													"nonAcademicGyanEarned": naGyan,
												},
												"participation": {
													"calendarId": assessmentResultInstanceJSON.calendarId,
													"cohortStartDateTime": calendar.startDate,
													"cohortEndDateTime": calendar.endDate
												}
											},
											"verification": {
												"type": "sha256"
											},
											"issuedOn": new Date(),
											"displayHtml": displayHtml,
											"universalIdentifier": certificateInstance.id.replace(/\-/g, '')
										};
										
										// Save Certificate JSON without blockchain signature
										certificateInstanceObj.stringifiedJSONWithoutSignature = JSON.stringify(certificate);
										certificateInstanceObj.save((error, updatedTempInstance) => {
											if (error) {
												console.log(error);
												next(error);
											} else {
												
												console.log('HASHING CERTIFICATE JSON');
												const hash = sha256(JSON.stringify(certificate));
												console.log('CERTIFICATE HASH READY: ' + hash);
												
												// *** Check if student has a proper ethereum wallet. If not, create one now
												if (!instancePeer || !instancePeer.ethAddress || instancePeer.ethAddress.substring(0, 2) !== '0x') {
													console.log('STUDENT WALLET NOT FOUND. CREATING A NEW ONE NOW');
													const body = {
														assessmentId: assessment.id,
														collectionId: assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id
													};
													const teacherEthAddress = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].ethAddress;
													Assessmentresult.createWallet(instancePeer, teacherEthAddress, body, hash, certificateInstanceObj, next);
												} else {
													console.log('STUDENT WALLET FOUND. CHECKING PARTICIPATION ON BLOCKCHAIN');
													
													Assessmentresult.checkParticipantOnBlockchain(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id, instancePeer.ethAddress)
															.then((participantStatus) => {
																if (participantStatus && participantStatus.result) {
																	console.log('BLOCKCHAIN PARTICIPATION CONFIRMED. RECORDING HASH ON BLOCKCHAIN');
																	// Assess student on blockchain
																	request.put({
																		url: protocolUrl + 'collections/' + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id + '/peers/' + assessmentResultInstanceJSON.assessees[0].ethAddress,
																		body: {
																			assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
																			engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
																			commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
																			certificateId: certificateInstanceObj.id,
																			hash: hash // hash
																		},
																		json: true
																	}, (err, response, data) => {
																		if (err) {
																			console.error(err);
																			next(err);
																		} else if (data && data.error) {
																			console.error(data.error);
																			next(data.error);
																		} else if (data) {
																			console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
																			console.log(data);
																			next(null, certificate);
																		} else {
																			console.log('transaction Id not found');
																			console.log(data);
																			next(new Error('Blockchain transaction failed'));
																		}
																	});
																} else {
																	console.log('STUDENT NOT A PARTICIPANT. JOINING COLLECTION NOW');
																	Assessmentresult.joinCollection(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id, instancePeer.id)
																			.then((joiningResult) => {
																				console.log('JOINED COLLECTION. RECORDING HASH ON BLOCKCHAIN');
																				// Assess student on blockchain
																				request.put({
																					url: protocolUrl + 'collections/' + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id + '/peers/' + assessmentResultInstanceJSON.assessees[0].ethAddress,
																					body: {
																						assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
																						engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
																						commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
																						certificateId: certificateInstanceObj.id,
																						hash: hash // hash
																					},
																					json: true
																				}, (err, response, data) => {
																					if (err) {
																						console.error(err);
																						next(err);
																					} else if (data && data.error) {
																						console.error(data.error);
																						next(data.error);
																					} else if (data) {
																						console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
																						console.log(data);
																						next(null, certificate);
																					} else {
																						console.log('transaction Id not found');
																						console.log(data);
																						next(new Error('Blockchain transaction failed'));
																					}
																				});
																			})
																			.catch((error) => {
																				console.log('COLLECTION JOINING FAILED. NOTIFY ADMIN');
																				next(error);
																				// TODO: notify admin here.
																			})
																}
															})
															.catch((error) => {
																console.log('STUDENT NOT A PARTICIPANT. JOINING COLLECTION NOW');
																Assessmentresult.joinCollection(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id, instancePeer.id)
																		.then(joinResult => {
																			console.log('COLLECTION JOINED. SAVING NEW HASH ON BLOCKCHAIN');
																			// Assess student on blockchain
																			request.put({
																				url: protocolUrl + 'collections/' + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id + '/peers/' + assessmentResultInstanceJSON.assessees[0].ethAddress,
																				body: {
																					assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
																					engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
																					commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
																					certificateId: certificateInstanceObj.id,
																					hash: hash // hash
																				},
																				json: true
																			}, (err, response, data) => {
																				if (err) {
																					console.error(err);
																					next(err);
																				} else if (data && data.error) {
																					console.error(data.error);
																					next(data.error);
																				} else if (data) {
																					console.log(data);
																					console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
																					next(null, certificate);
																				} else {
																					console.log('Failed to send transaction to blockchain');
																					console.log(data);
																					next(new Error('Failed to send transaction to blockchain'));
																				}
																			});
																		})
																		.catch((error) => {
																			console.log('COLLECTION JOINING FAILED. NOTIFY ADMIN');
																			next(error);
																			// TODO: notify admin here.
																		})
															});
												}
											}
										});
									}
								});
							}
						});
					} else {
						next(new Error('No certificate template available'));
					}
				})
				.catch(function (err) {
					console.log(err);
					next(err);
				});
	});
	
	
	
	Assessmentresult.reissueCertificate = function (body, cb) {
		
		Assessmentresult.app.models.certificate.findById(body.certificateId, {
			include: [{ 'peers': 'profiles' }]
		}).then((certificateInstance) => {
			// If there is a certificate JSON string available
			if (certificateInstance && certificateInstance.stringifiedJSONWithoutSignature && certificateInstance.stringifiedJSONWithoutSignature.length > 0) {
				const certificate = JSON.parse(certificateInstance.stringifiedJSONWithoutSignature);
				const displayHtml = certificate.displayHtml;
				const hash = sha256(JSON.stringify(certificate));
				const peer = certificateInstance.peers()[0];
				console.log('CERTIFICATE HASH READY: ' + hash);
				// If peer has a valid ethereum address
				if (peer.ethAddress && peer.ethAddress.length > 0 && peer.ethAddress.substring(0, 2) === '0x') {
					console.log('STUDENT WALLET FOUND. CHECKING PARTICIPATION ON BLOCKCHAIN');
					
					Assessmentresult.checkParticipantOnBlockchain(body.collectionId, peer.ethAddress)
							.then((participationStatus) => {
								console.log('RECEIVED PARTICIPANT STATUS');
								if (participationStatus && participationStatus.result) {
									console.log('PARTICIPATION CONFIRMED. CHECKING IF HASH EXISTS ON BLOCKCHAIN');
									// check if hash exists on blockchain
									request.get({
										url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress + '/hash',
										json: true
									}, (err, response, data) => {
										// Hash EXISTS on blockchain.
										if (data && data.length > 0) {
											console.log('GOT ASSESSMENT HASH FROM BC ');
											console.log(data);
											const signature = {
												"type": [
													"sha256"
												],
												"targetHash": data,
												"anchors": [
													{
														"sourceId": data,
														"type": "EthData",
														"chain": "ethereumTestnet"
													}
												]
											};
											if (!certificate.signature) {
												certificate.signature = signature;
											}
											certificateInstance.stringifiedJSON = JSON.stringify(certificate);
											certificateInstance.updateAttributes({
												stringifiedJSON: JSON.stringify(certificate)
											}, (error, updatedInstance) => {
												if (error) {
													console.log(error);
													cb(error);
												} else {
													console.log('SAVED CERTIFICATE JSON WITH HASH IN NEO4J DB');
													let html_body = ' <html> <head> <title>The Blockchain University</title></head>  <body> <div> <div style="font-family: Helvetica,sans-serif; padding: 9%; background-color: #ffffff; color: #333333; font-size: 17px;">' +
															'<div style="vertical-align: middle; ">' +
															'<img src="https://theblockchainu.com/assets/images/bu_logo.png" width="auto" height="35px" >  <span style="position: relative; top: -14px; color: #33bd9e"></span>' +
															'</div>' +
															'<div style="font-weight: 800; font-size: 30px; margin-top: 40px; text-transform: capitalize;">' +
															'Congratulations!' +
															'</div>' +
															'<div>' +
															'<div style="font-size: 17px; margin-top: 25px;">' +
															'Hi ' + peer.profiles()[0].first_name +
															'<br><br>' +
															'Your Smart Certificate is ready.' +
															'<br><br>' +
															'You can share your certificate with anyone using this link -' +
															'<a href="https://theblockchainu.com/certificate/' + updatedInstance.id + '" style="white-space: pre-wrap; color: #33bd9e;"><b>https://theblockchainu.com/certificate/' + updatedInstance.id + '</b></a>' +
															'<br><br>' +
															'<div style="line-height: 3.2rem;">' +
															'On this link, you can <b>instantly verify</b> the authenticity of this certificate by clicking the <span style="background: #33bd9e; color: #ffffff; padding: 10px; border-radius: 2px; font-weight:700;">VERIFY</span> button.' +
															'</div><br/><br/>' +
															'We have also attached a PDF copy of your certificate below if you wish to save a backup.' +
															'<br/><br/>' +
															'</div>' +
															'</div>' +
															'<div style="font-size: 17px; margin-top: 30px; line-height: 24px;">' +
															'Cheers,' +
															'<br>' +
															'The Blockchain U Team' +
															'</div>' +
															'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
															'<div style="font-size: 13px; color: #bbbbbb; margin-top: 30px; font-weight: 300">' +
															'Sent with <span style="font-size: 11px;">&hearts;</span> from The Blockchain U' +
															'<br><br>' +
															'Blockchain University, Inc., 4580 Automall Pkwy, Fremont, CA 94538' +
															'</div>' +
															'</div> </div> </body> </html>';
													
													Assessmentresult.generatePdf(displayHtml)
															.then(pdfBuffer => {
																return loopback.Email.send({
																	to: peer.email,
																	from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
																	subject: 'Your Smart Certificate for ' + body.collectionTitle,
																	html: html_body,
																	attachments: [
																		{
																			filename: 'SmartCertificate_' + body.collectionTitle.substring(0, 10) + '.pdf',
																			data: pdfBuffer,
																			contentType: 'application/pdf',
																			knownLength: pdfBuffer.length
																		}
																	]
																});
															})
															.then(function (response) {
																console.log('email sent! - ' + JSON.stringify(response));
															}).catch(function (err) {
														console.log('email error! - ' + err);
													});
													console.log('CERTIFICATE EMAIL SENT');
													cb(null, certificate);
												}
											});
										}
										// Hash DOES NOT EXIST on blockchain
										else {
											console.log('HASH NOT FOUND FOR THIS USER ON THIS COLLECTION. SAVING NEW HASH ON BLOCKCHAIN');
											// Find the assessment result given to user
											Assessmentresult.findById(body.assessmentId, {
												include: [{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } },
													'assessment_na_rules']
											}).then((assessmentResultInstance) => {
												const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
												
												// Make student assessment on blockchain
												request.put({
													url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress,
													body: {
														assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
														engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
														commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
														certificateId: certificateInstance.id,
														hash: hash // hash
													},
													json: true
												}, (err, response, data) => {
													if (err) {
														console.error(err);
														cb(err);
													} else if (data && data.error) {
														console.error(data.error);
														cb(data.error);
													} else if (data) {
														console.log(data);
														console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
														cb(null, certificate);
													} else {
														console.log('Failed to send transaction to blockchain');
														console.log(data);
														cb(new Error('Failed to send transaction to blockchain'));
													}
												});
											});
										}
									});
								}
								else {
									console.log('STUDENT NOT A PARTICIPANT. JOINING COLLECTION NOW');
									Assessmentresult.joinCollection(body.collectionId, peer.id)
											.then(joinResult => {
												console.log(joinResult);
												console.log('COLLECTION JOINED. SAVING NEW HASH ON BLOCKCHAIN');
												// Find the assessment result given to user
												Assessmentresult.findById(body.assessmentId, {
													include: [{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } },
														'assessment_na_rules']
												}).then((assessmentResultInstance) => {
													const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
													
													// Make student assessment on blockchain
													request.put({
														url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress,
														body: {
															assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
															engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
															commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
															certificateId: certificateInstance.id,
															hash: hash // hash
														},
														json: true
													}, (err, response, data) => {
														if (err) {
															console.error(err);
															cb(err);
														} else if (data && data.error) {
															console.error(data.error);
															cb(data.error);
														} else if (data) {
															console.log(data);
															console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
															cb(null, certificate);
														} else {
															console.log('Failed to send transaction to blockchain');
															console.log(data);
															cb(new Error('Failed to send transaction to blockchain'));
														}
													});
												});
											})
											.catch(error => {
												console.log('COLLECTION JOINING FAILED. NOTIFY ADMIN');
												cb(error);
												// TODO: notify admin here.
											});
								}
							})
							.catch(errror => {
								console.log('STUDENT NOT A PARTICIPANT. JOINING COLLECTION NOW');
								Assessmentresult.joinCollection(body.collectionId, peer.id)
										.then(joinResult => {
											console.log('COLLECTION JOINED. SAVING NEW HASH ON BLOCKCHAIN');
											// Find the assessment result given to user
											Assessmentresult.findById(body.assessmentId, {
												include: [{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } },
													'assessment_na_rules']
											}).then((assessmentResultInstance) => {
												const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
												// Make student assessment on blockchain
												request.put({
													url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress,
													body: {
														assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
														engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
														commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
														certificateId: certificateInstance.id,
														hash: hash // hash
													},
													json: true
												}, (err, response, data) => {
													if (err) {
														console.error(err);
														cb(err);
													} else if (data && data.error) {
														console.error(data.error);
														cb(data.error);
													} else if (data) {
														console.log(data);
														console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
														cb(null, certificate);
													} else {
														console.log('Failed to send transaction to blockchain');
														console.log(data);
														cb(new Error('Failed to send transaction to blockchain'));
													}
												});
											});
										}, error => {
											console.log('error');
											cb(error);
										})
										.catch(error => {
											console.log('error');
											cb(error);
										})
							});
				}
				// Create an ethereum account for the user and then re-issue certificate
				else {
					const teacherEthAddress = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].ethAddress;
					Assessmentresult.createWallet(peer, teacherEthAddress, body, hash, certificateInstance, cb);
				}
			} else {
				cb(new Error('No certificate JSON string available. Cannot re-issue certificate.'));
			}
		}).catch(function (err) {
			console.log(err);
			cb(err);
		});
	};
	
	Assessmentresult.checkParticipantOnBlockchain = function (collectionId, participantEthAddress) {
		// Get from blockchain
		return requestPromise.get({
			url: protocolUrl + 'collections/' + collectionId + '/peers',
		}).then((data) => {
			console.log('Got list of participants for this collection: ' + data);
			const peers = JSON.parse(data);
			if (_.find(peers, (peer) => peer === participantEthAddress.toLowerCase())) {
				return Promise.resolve({ result: true, participantId: participantEthAddress.toLowerCase() });
			} else {
				return Promise.resolve({ result: false, participantId: participantEthAddress.toLowerCase() });
			}
		}).catch((err) => {
			console.error(err);
			return Promise.resolve({ result: false, participantId: participantEthAddress.toLowerCase() });
		});
	};
	
	Assessmentresult.joinCollection = (collectionId, participantId) => {
		// Find the peer instance
		return Assessmentresult.app.models.peer.findById(participantId, { "include": ["profiles", "scholarships_joined"] })
				.then((participantUserInstance) => {
					if (participantUserInstance) {
						// Record student participation in an experience on blockchain
						let scholarshipId = participantUserInstance.scholarships_joined && participantUserInstance.scholarships_joined.length > 0 && participantUserInstance.scholarships_joined[0] ? participantUserInstance.scholarships_joined[0].id : '';
						return requestPromise.put({
							url: protocolUrl + 'collections/' + collectionId + '/peers/rel/' + participantUserInstance.ethAddress,
							body: {
								scholarshipId: scholarshipId
							},
							json: true
						}).then((data) => {
							if (data && data.error) {
								return Promise.reject(data.error);
							}
							else {
								return Promise.resolve(data);
							}
						}).catch((err) => {
							return Promise.reject(err);
						});
					} else {
						return Promise.reject(new Error('Could not find participant with this ID.'));
					}
				}).catch((err) => {
					return Promise.reject(err);
				});
	};
	
	/**
	 *
	 * @param peer The peer instance for whom wallet is being created
	 * @param teacherEthAddress
	 * @param body Assessment request body Object{assessmentId, collectionId}
	 * @param hash Computed hash to be saved on blockchain
	 * @param certificateInstance Instance of certificate to be sent as successful response
	 * @param cb The Callback function
	 */
	Assessmentresult.createWallet = (peer, teacherEthAddress, body, hash, certificateInstance, cb) => {
		// Create wallet on blockchain
		request.post({
			url: app.get('protocolUrl') + 'peers',
			body: {
				password: '0C6&7vvvv'
			},
			json: true
		}, function (err, response, data) {
			if (err) {
				console.error(err);
				cb(err);
			} else if (response.body && response.body.error) {
				console.error(response.body.error);
				cb(response.body.error);
			} else if (data && data.error) {
				console.error(data.error);
				cb(data.error);
			}
			else {
				console.log('NEW ETHEREUM WALLET: ' + data);
				Assessmentresult.dataSource.connector.execute(
						"MATCH (p:peer {email: '" + peer.email + "'}) SET p.ethAddress = '" + data + "'",
						function (err, results) {
							console.log('Created ethereum wallet and saved address in DB');
						}
				);
				
				// Add peer to all public scholarships
				app.models.scholarship.find({
					'where': {
						'type': 'public'
					}
				}).then(function (scholarshipInstances) {
					scholarshipInstances.forEach(function (scholarship, i) {
						scholarship.__link__peers_joined(peer.id, function (err, linkedPeerInstance) {
							if (data && data.substring(0, 2) === '0x') {
								console.log('JOINING GLOBAL SCHOLARSHIP FOR NEW USER');
								request.put({
									url: app.get('protocolUrl') + 'scholarships/' + scholarship.id + '/peers/rel/' + data,
									json: true
								}, function (err, response, result) {
									if (err) {
										console.error(err);
									} else if (result && result.error) {
										console.error(result.error);
									} else {
										console.log('Added participant to scholarship on blockchain: ' + result);
									}
								});
							}
						});
					});
					return Promise.all(scholarshipInstances);
				}).then(function (scholarshipRelationInstances) {
					if (!scholarshipRelationInstances || scholarshipRelationInstances.length === 0) {
						return Promise.reject(new Error('Could not join scholarship.'));
					}
					return Assessmentresult.joinCollection(body.collectionId, peer.id);
				}).then(function (collectionJoinResult) {
					if (collectionJoinResult) {
						// SAVE NEW CERTIFICATE HASH ON BLOCKCHAIN
						console.log('SAVING NEW HASH ON BLOCKCHAIN');
						
						// Find the assessment result given to user
						Assessmentresult.findById(body.assessmentId, {include: [{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } }, 'assessment_na_rules']})
								.then((assessmentResultInstance) => {
									const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
									
									// Make student assessment on blockchain
									request.put({
										url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress,
										body: {
											assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
											engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
											commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
											certificateId: certificateInstance.id,
											hash: hash // hash
										},
										json: true
									}, (err, response, data) => {
										if (err) {
											console.error(err);
											cb(err);
										} else if (data && data.error) {
											console.error(data.error);
											cb(data.error);
										} else if (data) {
											console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
											console.log(data);
											cb(null, certificateInstance);
										} else {
											console.log('Failed to Assess student on blockchain');
											console.log(data);
											cb(new Error('Failed to Assess student on blockchain'));
										}
									});
								});
						
						// Send email to user informing him about global scholarship
						const message = {};
						const renderer = loopback.template(path.resolve(__dirname, './views/welcomeGlobalScholarship.ejs'));
						const html_body = renderer(message);
						loopback.Email.send({
							to: peer.email,
							from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
							subject: 'Your KARMA wallet is now ready!',
							html: html_body
						}).then(function (response) {
							console.log('The Blockchain University Global Scholarship email sent! - ' + response);
						}).catch(function (err) {
							console.log('The Blockchain University Global Scholarship email error! - ' + err);
						});
					}
				}).catch(function (err) {
					console.log('Error in joining scholarship');
					console.log(err);
					cb(err);
				});
			}
		});
	};
	
	
	Assessmentresult.signCertificate = function (body, cb) {
		console.log('GOT ASSESSMENT RESPONSE FROM BLOCKCHAIN FOR COLLECTION: ' + body.collectionId);
		if (body && body.certificateId && body.collectionId) {
			Assessmentresult.app.models.certificate.findById(body.certificateId, {
				include: [{
					'peers': [
						'profiles',
						{
							relation: 'collections',
							scope: {
								where: { id: {'eq': body.collectionId } }
							}
						}]
				}]
			}).then((certificateInstance) => {
				// If there is a certificate JSON string available
				if (certificateInstance && certificateInstance.stringifiedJSONWithoutSignature && certificateInstance.stringifiedJSONWithoutSignature.length > 0) {
					const certificate = JSON.parse(certificateInstance.stringifiedJSONWithoutSignature);
					const displayHtml = certificate.displayHtml;
					const peer = certificateInstance.peers()[0];
					// Check if we found a collection linked to this certificate
					if (peer.collections && peer.collections().length > 0) {
						const collection = peer.collections()[0];
						console.log('FETCHED COLLECTION FROM DB IS: ' + collection.id);
						if (body.error) {
							console.error(body.error);
							cb(new Error(body.error));
						} else if (body.result && body.result.tx) {
							console.log('RECORDED ASSESSMENT ON BLOCKCHAIN: ');
							console.log(body.result);
							const signature = {
								"type": [
									"sha256"
								],
								"targetHash": body.hash,
								"anchors": [
									{
										"sourceId": body.result.tx,
										"type": "EthData",
										"chain": "ethereumTestnet"
									}
								]
							};
							certificate.signature = signature;
							certificateInstance.stringifiedJSON = JSON.stringify(certificate);
							certificateInstance.updateAttributes({
								stringifiedJSON: JSON.stringify(certificate)
							}, (error, updatedInstance) => {
								if (error) {
									console.log(error);
									cb(error);
								} else {
									console.log('SAVED CERTIFICATE JSON WITH SIGNATURE IN CENTRAL DB');
									let html_body = ' <html> <head> <title>The Blockchain University</title></head>  <body> <div> <div style="font-family: Helvetica,sans-serif; padding: 9%; background-color: #ffffff; color: #333333; font-size: 17px;">' +
											'<div style="vertical-align: middle; ">' +
											'<img src="https://theblockchainu.com/assets/images/bu_logo.png" width="auto" height="35px" >  <span style="position: relative; top: -14px; color: #33bd9e"></span>' +
											'</div>' +
											'<div style="font-weight: 800; font-size: 30px; margin-top: 40px; text-transform: capitalize;">' +
											'Congratulations!' +
											'</div>' +
											'<div>' +
											'<div style="font-size: 17px; margin-top: 25px;">' +
											'Hi ' + peer.profiles()[0].first_name +
											'<br><br>' +
											'Your Smart Certificate is ready.' +
											'<br><br>' +
											'You can share your certificate with anyone using this link -' +
											'<a href="https://theblockchainu.com/certificate/' + updatedInstance.id + '" style="white-space: pre-wrap; color: #33bd9e;"><b>https://theblockchainu.com/certificate/' + updatedInstance.id + '</b></a>' +
											'<br><br>' +
											'<div style="line-height: 3.2rem;">' +
											'On this link, you can <b>instantly verify</b> the authenticity of this certificate by clicking the <span style="background: #33bd9e; color: #ffffff; padding: 10px; border-radius: 2px; font-weight:700;">VERIFY</span> button.' +
											'</div><br/><br/>' +
											'We have also attached a PDF copy of your certificate below if you wish to save a backup.' +
											'<br/><br/>' +
											'</div>' +
											'</div>' +
											'<div style="font-size: 17px; margin-top: 30px; line-height: 24px;">' +
											'Cheers,' +
											'<br>' +
											'The Blockchain U Team' +
											'</div>' +
											'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
											'<div style="font-size: 13px; color: #bbbbbb; margin-top: 30px; font-weight: 300">' +
											'Sent with <span style="font-size: 11px;">&hearts;</span> from The Blockchain U' +
											'<br><br>' +
											'Blockchain University, Inc., 4580 Automall Pkwy, Fremont, CA 94538' +
											'</div>' +
											'</div> </div> </body> </html>';
									
									Assessmentresult.generatePdf(displayHtml)
											.then(pdfBuffer => {
												return loopback.Email.send({
													to: peer.email,
													from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
													subject: 'Your Smart Certificate for ' + collection.title,
													html: html_body,
													attachments: [
														{
															filename: 'SmartCertificate_' + collection.title.substring(0, 10) + '.pdf',
															data: pdfBuffer,
															contentType: 'application/pdf',
															knownLength: pdfBuffer.length
														}
													]
												});
											})
											.then((response) => {
												console.log('email sent! - ' + response);
											}).catch(function (err) {
										console.log('email error! - ' + err);
									});
								}
							});
						} else {
							console.log('Blockchain transaction failed.');
							cb(new Error('Blockchain transaction failed'));
						}
					} else {
						cb(new Error('Invalid collection ID. No such collection found.'));
					}
					
				} else {
					cb(new Error('No certificate JSON string available. Cannot issue certificate.'));
				}
			})
					.catch(function (err) {
						console.log(err);
						cb(err);
					});
		} else {
			cb(new Error('Invalid arguments for request.'));
		}
		
	};
	
	Assessmentresult.generatePdf = function (html) {
		let page;
		return app.getBrowser().newPage()
				.then(newpage => {
					page = newpage;
					return page.setContent(html);
				}).then(() => {
					const pageBuffer = page.pdf();
					return Promise.resolve(pageBuffer);
				});
	};
	
	Assessmentresult.remoteMethod(
			'reissueCertificate',
			{
				accepts: [
					{ arg: 'body', type: 'object', required: true, http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/reissue-certificate', verb: 'post' }
			}
	);
	
	Assessmentresult.remoteMethod(
			'signCertificate',
			{
				accepts: [
					{ arg: 'body', type: 'object', required: true, http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/sign-certificate', verb: 'post' }
			}
	);
};
