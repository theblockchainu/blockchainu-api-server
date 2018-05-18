'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Assessmentresult) {

    Assessmentresult.observe('after save', function (ctx, next) {
        var assessment = ctx.instance;
        console.log(assessment);
        assessment.calendars.add(assessment.id)
            .then(function (calendars) {
                console.log('calendars');
                console.log(calendars);
                return assessment.assessment_rules.add(assessment.assessmentRuleId);
            })
            .then(function (assessment_rules) {
                console.log('assessment_rules');
                console.log(assessment_rules);
                return assessment.assessees.add(assessment.assesseeId);
            })
            .then(function (assessees) {
                console.log('assessees');
                console.log(assessees);
                Assessmentresult.findById(assessment.id, {include: [{'assessees': 'profiles'}, {'assessment_rules': {'assessment_models': {'collections': {'owners': 'profiles'}}}}]}, function (err, assessmentResultInstance) {
                   if (err) {
                       next(err);
                   } else {
                       Assessmentresult.app.getCollectionContractInstance().assess(assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].id.replace(/-/g, ''), assessmentResultInstance.toJSON().assessees[0].ethAddress, assessmentResultInstance.toJSON().assessment_rules[0].value)
                               .then(function (result) {
                                   console.log('Recorded assessment on blockchain: ' + result);
                               })
                               .catch(err => {
                                  console.error(err);
                               });
                       const userName = assessmentResultInstance.toJSON().assessees[0].profiles[0].first_name + ' ' + assessmentResultInstance.toJSON().assessees[0].profiles[0].last_name;
	                   const userId = assessmentResultInstance.toJSON().assessees[0].id;
                       const collectionTitle = assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].title;
                       const collectionType = assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].type;
                       const teacherName = assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].first_name + ' ' +assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].owners[0].profiles[0].last_name;
                       const teacherImage = assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].owners[0].picture_url;
                       const assessmentStyle = assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].style;
                       const collectionResult = assessmentResultInstance.toJSON().assessment_rules[0].value;
                       const gyanEarned = Math.floor(((assessmentResultInstance.toJSON().assessment_rules[0].gyan / 100) * assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].academicGyan) + assessmentResultInstance.toJSON().assessment_rules[0].assessment_models[0].collections[0].nonAcademicGyan);
	                   // Send email to participant about his result
	                   const message = {userName: userName, userId: userId, collectionTitle: collectionTitle, collectionType: collectionType, teacherName: teacherName, teacherImage: teacherImage, collectionResult: collectionResult, gyanEarned: gyanEarned, assessmentStyle: assessmentStyle};
	                   var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newResultStudent.ejs'));
	                   var html_body = renderer(message);
	                   loopback.Email.send({
		                   to: assessmentResultInstance.toJSON().assessees[0].email,
		                   from: 'Peerbuds <noreply@mx.peerbuds.com>',
		                   subject: 'Your result for ' + collectionType + ': ' + collectionTitle,
		                   html: html_body
	                   })
			                   .then(function (response) {
				                   console.log('email sent! - ');
			                   })
			                   .catch(function (err) {
				                   console.log('email error! - ' + err);
			                   });
                       next();
                   }
                });
            })
            .catch(function (err) {
                console.log(err);
                next(err);
            });
    });
};
