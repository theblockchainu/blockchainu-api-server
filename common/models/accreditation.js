'use strict';

module.exports = function (Accreditation) {
    Accreditation.afterRemote('prototype.__link__subscribedBy', function (ctx, peerInstance, next) {
        let accreditationInstance = ctx.instance;
        console.log('inside the join hook of accreditation');

        // const message = {};
        // var renderer = loopback.template(path.resolve(__dirname, '../../server/views/newResultStudent.ejs'));
        // var html_body = renderer(message);
        // loopback.Email.send({
        //     to: assessmentResultInstance.toJSON().assessees[0].email,
        //     from: 'Peerbuds <noreply@mx.theblockchainu.com>',
        //     subject: 'Your result for ' + collectionType + ': ' + collectionTitle,
        //     html: html_body
        // })
        //     .then(function (response) {
        //         console.log('email sent! - ');
        //     })
        //     .catch(function (err) {
        //         console.log('email error! - ' + err);
        //     });
        console.log(accreditationInstance);
        next();
    });

    // Record accreditation participation on BC.
    Accreditation.afterRemote('prototype.__unlink__subscribedBy', function (ctx, peerInstance, next) {
        let accreditationInstance = ctx.instance;
        console.log(accreditationInstance);
        next();
    });

};
