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

module.exports = function (Assessmentresult) {
	Assessmentresult.observe('after save', function (ctx, next) {
		var assessment = ctx.instance;
		assessment.calendars
				.add(assessment.id)
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
								include: [{ 'assessees': 'profiles' },
									{ 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates', 'topics', 'calendars'] } } },
									'assessment_na_rules']
							});
				})
				.then((assessmentResultInstance) => {
					// Record assessment on BC
					const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
					// If there is a certificate template
					if (assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates && assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates.length > 0) {
						const certificateTemplate = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates[0];
						const template = certificateTemplate.certificateHTML.replace(/\\n/g, '');
						_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;
						var compiled = _.template(template);
						let topicString = '';
						assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].topics.forEach(topic => {
							topicString.concat(topic.name + ' ');
						});
						topicString = _.trim(topicString);
						const gyanEarned = Math.floor(((assessmentResultInstanceJSON.assessment_rules[0].gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan) + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan);
						let naGyan = 0;
						assessmentResultInstanceJSON.assessment_na_rules.forEach(naRule => {
							if (naRule.value === 'engagement') {
								naGyan += Math.floor(((naRule.gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan) * (assessmentResultInstanceJSON.assessmentEngagementResult) / 100);
							} else if (naRule.value === 'commitment') {
								naGyan += Math.floor(((naRule.gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan) * (assessmentResultInstanceJSON.assessmentCommitmentResult) / 100);
							}
						});
						
						const aGyan = Math.floor((assessmentResultInstanceJSON.assessment_rules[0].gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan);
						
						const calendar = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].calendars
								.find((calendarObj) => {
									return calendarObj.id === assessmentResultInstanceJSON.calendarId;
								});
						
						Assessmentresult.app.models.peer.findById(assessmentResultInstanceJSON.assessees[0].id, (errorPeer, instancePeer) => {
							if (errorPeer) {
								console.log(errorPeer);
								next(new Error('Could not find a linked user to this assessment.'));
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
											issuerName: _.upperFirst(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].first_name) + ' ' + _.upperFirst(assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].last_name),
											difficultyLevel: assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].difficultyLevel,
											gyanEarned: gyanEarned,
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
												console.log('RECORDING HASH ON BLOCKCHAIN...');
												request
														.put({
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
															} else if (data) {
																console.log('BLOCKCHAIN TRANSACTION IN PROGRESS...');
																console.log(data);
																next(null, certificate)
															} else {
																console.log('transaction Id not found');
																console.log(data);
																next(new Error('Blockchain transaction failed'));
															}
														});
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
			include: [{'peers': 'profiles'}]
		})
				.then((certificateInstance) => {
					// If there is a certificate JSON string available
					if (certificateInstance && certificateInstance.stringifiedJSONWithoutSignature && certificateInstance.stringifiedJSONWithoutSignature.length > 0) {
						const certificate = JSON.parse(certificateInstance.stringifiedJSONWithoutSignature);
						const displayHtml = certificate.displayHtml;
						const hash = sha256(JSON.stringify(certificate));
						const peer = certificateInstance.peers()[0];
						console.log('CERTIFICATE HASH READY: ' + hash);
						console.log('CHECKING IF HASH EXISTS ON BLOCKCHAIN');
						
						// check if hash exists on blockchain
						request
								.get({
									url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress + '/hash',
									json: true
								}, (err, response, data) => {
									if (err) {
										console.error(err);
										cb(err);
									}
									else if (data && data.length > 0) {
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
												let html_body = ' <html> <head> <title>The Blockchain University</title></head>  <body> <div> <div style="font-family: Helvetica; padding: 9%; background-color: #ffffff; color: #333333; font-size: 17px;">' +
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
														'Your certificate is ready.' +
														'<br><br>' +
														'You can share your certificate with anyone using this link -' +
														'<a href="https://theblockchainu.com/certificate/' + updatedInstance.id + '" style="white-space: pre-wrap; color: #33bd9e;"><b>https://theblockchainu.com/certificate/' + updatedInstance.id + '</b></a>' +
														'<br><br>' +
														'<div style="line-height: 3.2rem;">' +
														'On this link, you can <b>instantly verify</b> the authenticity of this certificate by clicking the <span style="background: #33bd9e; color: #ffffff; padding: 10px; border-radius: 2px; font-weight:700;">VERIFY</span> button.' +
														'</div><br/><br/>' +
														'<div style="font-size:12px; color: #777777;">' +
														'Also attached in this email is your certificate backup file which you should save on your local computer. The <b>Smart Certificate_***.json</b> can also be shared with future employers.' +
														'</div>' +
														'</div>' +
														'</div>' +
														'<div style="font-size: 17px; margin-top: 30px; line-height: 24px;">' +
														'Cheers,' +
														'<br>' +
														'The Blockchain U Team' +
														'</div>' +
														'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
														displayHtml +
														'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
														'<div style="font-size: 13px; color: #bbbbbb; margin-top: 30px; font-weight: 300">' +
														'Sent with <span style="font-size: 11px;">&hearts;</span> from The Blockchain U' +
														'<br><br>' +
														'Peerbuds, Inc., 4580 Automall Pkwy, Fremont, CA 94538' +
														'</div>' +
														'</div> </div> </body> </html>';
												const attachment = {
													data: intoStream(updatedInstance.stringifiedJSON),
													filename: 'Smart Certificate_' + body.collectionTitle + '.json',
													knownLength: updatedInstance.stringifiedJSON.length,
													contentType: 'application/json'
												};
												loopback.Email.send({
													from: 'The Blockchain University <noreply@mx.theblockchainu.com>'
													to: peer.email,
													subject: 'Your certificate for ' + body.collectionType + ': ' + body.collectionTitle,
													html: html_body,
													attachments: [attachment]
												}).then(function (response) {
													console.log('email sent! - ' + JSON.stringify(response));
												}).catch(function (err) {
													console.log('email error! - ' + err);
												});
												console.log('CERTIFICATE EMAIL SENT');
												cb(null, certificate);
											}
										});
									}
									else {
										console.log('HASH NOT FOUND FOR THIS USER ON THIS COLLECTION');
										console.log('SAVING NEW HASH ON BLOCKCHAIN');
										Assessmentresult.findById(body.assessmentId, {
											include: [{'assessment_rules': {'assessment_models': {'collections': [{'owners': 'profiles'}, 'certificate_templates', 'topics', 'calendars']}}},
												'assessment_na_rules']
										})
												.then((assessmentResultInstance) => {
													const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
													request
															.put({
																url: protocolUrl + 'collections/' + body.collectionId + '/peers/' + peer.ethAddress,
																body: {
																	assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
																	engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
																	commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
																	hash: hash // hash
																},
																json: true
															}, (err, response, data) => {
																if (err) {
																	console.error(err);
																} else if (data && data.tx) {
																	console.log('RECORDED ASSESSMENT ON BLOCKCHAIN: ');
																	console.log(data);
																	const signature = {
																		"type": [
																			"sha256"
																		],
																		"targetHash": hash,
																		"anchors": [
																			{
																				"sourceId": data.tx,
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
																		} else {
																			console.log('SAVED CERTIFICATE JSON WITH HASH IN CENTRAL DB');
																			let html_body = ' <html> <head> <title>The Blockchain University</title></head>  <body> <div> <div style="font-family: Helvetica; padding: 9%; background-color: #ffffff; color: #333333; font-size: 17px;">' +
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
																					'Your certificate is ready.' +
																					'<br><br>' +
																					'You can share your certificate with anyone using this link -' +
																					'<a href="https://theblockchainu.com/certificate/' + updatedInstance.id + '" style="white-space: pre-wrap; color: #33bd9e;"><b>https://theblockchainu.com/certificate/' + updatedInstance.id + '</b></a>' +
																					'<br><br>' +
																					'<div style="line-height: 3.2rem;">' +
																					'On this link, you can <b>instantly verify</b> the authenticity of this certificate by clicking the <span style="background: #33bd9e; color: #ffffff; padding: 10px; border-radius: 2px; font-weight:700;">VERIFY</span> button.' +
																					'</div><br/><br/>' +
																					'<div style="font-size:12px; color: #777777;">' +
																					'Also attached in this email is your certificate backup file which you should save on your local computer. The <b>certificate.json</b> can also be shared with future employers.' +
																					'</div>' +
																					'</div>' +
																					'</div>' +
																					'<div style="font-size: 17px; margin-top: 30px; line-height: 24px;">' +
																					'Cheers,' +
																					'<br>' +
																					'The Blockchain U Team' +
																					'</div>' +
																					'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
																					displayHtml +
																					'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
																					'<div style="font-size: 13px; color: #bbbbbb; margin-top: 30px; font-weight: 300">' +
																					'Sent with <span style="font-size: 11px;">&hearts;</span> from The Blockchain U' +
																					'<br><br>' +
																					'Peerbuds, Inc., 4580 Automall Pkwy, Fremont, CA 94538' +
																					'</div>' +
																					'</div> </div> </body> </html>';
																			var attachment = {
																				data: intoStream(updatedInstance.stringifiedJSON),
																				filename: 'Smart Certificate_' + data.collectionTitle + '.json',
																				knownLength: updatedInstance.stringifiedJSON.length,
																				contentType: 'application/json'
																			};
																			loopback.Email.send({
																				to: peer.email,
																				from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
																				subject: 'Your certificate for ' + data.collectionType + ': ' + data.collectionTitle,
																				html: html_body,
																				attachments: [attachment]
																			}).then(function (response) {
																				console.log('email sent! - ' + response);
																			}).catch(function (err) {
																				console.log('email error! - ' + err);
																			});
																		}
																	});
																} else {
																	console.log('transaction Id not found');
																	console.log(data);
																}
															});
													cb(null, certificate);
												});
									}
								});
					} else {
						cb(new Error('No certificate JSON string available. Cannot re-issue certificate.'));
					}
				})
				.catch(function (err) {
					console.log(err);
					cb(err);
				});
		
	};
	
	
	Assessmentresult.signCertificate = function (body, cb) {
		
		if (body && body.certificateId && body.collectionId) {
			Assessmentresult.app.models.certificate.findById(body.certificateId, {
				include: [{'peers': ['profiles', {
						'relation': 'collections', 'scope': {
							'where': {'id': body.collectionId}
						}
					}]}]
			})
					.then((certificateInstance) => {
						// If there is a certificate JSON string available
						if (certificateInstance && certificateInstance.stringifiedJSONWithoutSignature && certificateInstance.stringifiedJSONWithoutSignature.length > 0) {
							const certificate = JSON.parse(certificateInstance.stringifiedJSONWithoutSignature);
							const displayHtml = certificate.displayHtml;
							const peer = certificateInstance.peers()[0];
							// Check if we found a collection linked to this certificate
							if (peer.collections && peer.collections().length > 0) {
								const collection = peer.collections()[0];
								console.log('GOT RESPONSE FROM BLOCKCHAIN');
								
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
											let html_body = ' <html> <head> <title>The Blockchain University</title></head>  <body> <div> <div style="font-family: Helvetica; padding: 9%; background-color: #ffffff; color: #333333; font-size: 17px;">' +
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
													'Your certificate is ready.' +
													'<br><br>' +
													'You can share your certificate with anyone using this link -' +
													'<a href="https://theblockchainu.com/certificate/' + updatedInstance.id + '" style="white-space: pre-wrap; color: #33bd9e;"><b>https://theblockchainu.com/certificate/' + updatedInstance.id + '</b></a>' +
													'<br><br>' +
													'<div style="line-height: 3.2rem;">' +
													'On this link, you can <b>instantly verify</b> the authenticity of this certificate by clicking the <span style="background: #33bd9e; color: #ffffff; padding: 10px; border-radius: 2px; font-weight:700;">VERIFY</span> button.' +
													'</div><br/><br/>' +
													'<div style="font-size:12px; color: #777777;">' +
													'Also attached in this email is your certificate backup file which you should save on your local computer. The <b>certificate.json</b> can also be shared with future employers.' +
													'</div>' +
													'</div>' +
													'</div>' +
													'<div style="font-size: 17px; margin-top: 30px; line-height: 24px;">' +
													'Cheers,' +
													'<br>' +
													'The Blockchain U Team' +
													'</div>' +
													'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
													displayHtml +
													'<hr style="margin-top: 40px; background-color: #dbdbdb;">' +
													'<div style="font-size: 13px; color: #bbbbbb; margin-top: 30px; font-weight: 300">' +
													'Sent with <span style="font-size: 11px;">&hearts;</span> from The Blockchain U' +
													'<br><br>' +
													'Peerbuds, Inc., 4580 Automall Pkwy, Fremont, CA 94538' +
													'</div>' +
													'</div> </div> </body> </html>';
											var attachment = {
												data: intoStream(updatedInstance.stringifiedJSON),
												filename: 'Smart Certificate_' + collection.title + '.json',
												knownLength: updatedInstance.stringifiedJSON.length,
												contentType: 'application/json'
											};
											loopback.Email.send({
												to: peer.email,
												from: 'The Blockchain University <noreply@mx.theblockchainu.com>',
												subject: 'Your certificate for ' + collection.type + ': ' + collection.title,
												html: html_body,
												attachments: [attachment]
											}).then(function (response) {
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
