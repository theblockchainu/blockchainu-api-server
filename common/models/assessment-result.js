'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');
let app = require('../../server/server');
const protocolUrl = app.get('protocolUrl');
let request = require('request');

module.exports = function (Assessmentresult) {
	Assessmentresult.observe('after save', function (ctx, next) {
		var assessment = ctx.instance;
		console.log(assessment);
		assessment.calendars
			.add(assessment.id)
			.then((calendars) => {
				console.log('calendars');
				console.log(calendars);
				return assessment.assessment_rules.add(assessment.assessmentRuleId);
			})
			.then((assessment_rules) => {
				console.log('assessment_rules');
				console.log(assessment_rules);
				return assessment.assessment_na_rules.add(assessment.assessmentEngagementRuleId);
			})
			.then((assessment_na_rules) => {
				console.log('assessment_engagement_rules');
				console.log(assessment_na_rules);
				return assessment.assessment_na_rules.add(assessment.assessmentCommitmentRuleId);
			})
			.then((assessment_na_rules) => {
				console.log('assessment_commitment_rules');
				console.log(assessment_na_rules);
				return assessment.assessees.add(assessment.assesseeId);
			})
			.then((assessees) => {
				console.log('assessees');
				console.log(assessees);
				return Assessmentresult
					.findById(assessment.id, { include: [{ 'assessees': 'profiles' }, { 'assessment_rules': { 'assessment_models': { 'collections': [{ 'owners': 'profiles' }, 'certificate_templates'] } } }] });
			})
			.then((assessmentResultInstance) => {
				// Record assessment on BC
				const assessmentResultInstanceJSON = assessmentResultInstance.toJSON();
				request
					.put({
						url: protocolUrl + 'collections/' + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].id + '/peers/' + assessmentResultInstanceJSON.assessees[0].ethAddress,
						body: {
							assessmentResult: assessmentResultInstanceJSON.assessment_rules[0].value,
							engagementResult: assessmentResultInstanceJSON.assessmentEngagementResult,
							commitmentResult: assessmentResultInstanceJSON.assessmentCommitmentResult,
							hash: // hash
						},
						json: true
					}, function (err, response, data) {
						if (err) {
							console.error(err);
						} else {
							console.log('Recorded assessment on blockchain: ' + data);
						}
					});


				const userName = assessmentResultInstanceJSON.assessees[0].profiles[0].first_name + ' ' + assessmentResultInstanceJSON.assessees[0].profiles[0].last_name;
				const userId = assessmentResultInstanceJSON.assessees[0].id;
				const collectionTitle = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].title;
				const collectionType = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].type;
				const teacherName = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].first_name + ' ' + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].last_name;
				const teacherImage = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].owners[0].picture_url;
				const assessmentStyle = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].style;
				const collectionResult = assessmentResultInstanceJSON.assessment_rules[0].value;
				const gyanEarned = Math.floor(((assessmentResultInstanceJSON.assessment_rules[0].gyan / 100) * assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].academicGyan) + assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan);

				if (assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates && assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates.length > 0) {
					const certificateTemplate = assessmentResultInstanceJSON.assessment_rules[0].assessment_models[0].collections[0].certificate_templates[0];
					sendCertificate(
						userName,
						userId,
						collectionTitle,
						collectionType,
						teacherName,
						teacherImage,
						collectionResult,
						gyanEarned,
						assessmentStyle,
						certificateTemplate
					);
				}
				// Send email to participant about his result
				const message = { userName: userName, userId: userId, collectionTitle: collectionTitle, collectionType: collectionType, teacherName: teacherName, teacherImage: teacherImage, collectionResult: collectionResult, gyanEarned: gyanEarned, assessmentStyle: assessmentStyle };
				var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newResultStudent.ejs'));
				var html_body = renderer(message);
				return loopback.Email.send({
					to: assessmentResultInstanceJSON.assessees[0].email,
					from: 'Peerbuds <noreply@mx.peerbuds.com>',
					subject: 'Your result for ' + collectionType + ': ' + collectionTitle,
					html: html_body
				});
			})
			.then((response) => {
				console.log('email sent! - ');
				next();
			})
			.catch(function (err) {
				console.log(err);
				next(err);
			});
	});

	let sendCertificate = (
		userName,
		userId,
		collectionTitle,
		collectionType,
		teacherName,
		teacherImage,
		collectionResult,
		gyanEarned,
		assessmentStyle,
		certificate_template
	) => {
		console.log(certificate_template.certificateHTML);
	};

};
