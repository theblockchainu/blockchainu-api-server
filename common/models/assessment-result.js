'use strict';

module.exports = function (Assessmentresult) {

    Assessmentresult.observe('after save', function (ctx, next) {
        var assessment = ctx.instance;
        console.log(assessment);
        assessment.calendars.add(assessment.id)
            .then(function (calendars) {
                console.log('calendars');
                console.log(calendars);
                //     return assessment.assessers.add(assessment.assesserId);
                // })
                // .then(function (assesser) {
                //     console.log('assesser');
                //     console.log(assesser);
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
                next();
            })
            .catch(function (err) {
                console.log(err);
                next(err);
            });
    });
};
