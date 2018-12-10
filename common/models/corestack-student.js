'use strict';

let request = require('request-promise-native');
let moment = require('moment');

module.exports = function (Corestackstudent) {

    Corestackstudent.registerStudent = async function (student_id, student_name, student_email, course_id, course_start_date, username, course_end_date) {
        let studentData = {
            student_id: student_id,
            student_name: student_name,
            student_email: student_email,
            course_id: course_id,
            course_start_date: course_start_date,
            username: username,
            course_end_date: course_end_date
        };
        return Corestackstudent.app.models.corestack_token.getTokenObject()
            .then(tokenObject => {
                return request.post({
                    url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.projects[0].id + '/cloudlab/register_student',
                    json: true,
                    headers: {
                        'X-Auth-Token': tokenObject.data.token.key,
                        'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                    },
                    body: studentData
                });
            })
            .then((body) => {
                if (body.status === 'success') {
                    studentData.student_course_status = 'registered';
                    return Corestackstudent.create(studentData);
                } else {
                    return Promise.reject(body);
                }
            })
            .catch(err => {
                console.log(err);
                return Promise.reject('Error');
            });
    };

    Corestackstudent.deregisterStudent = async function (student_id, course_id) {
        return Corestackstudent.app.models.corestack_token.getTokenObject().then(tokenObject => {
            return request.post({
                url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.projects[0].id
                    + '/cloudlab/deregister_student',
                json: true,
                headers: {
                    'X-Auth-Token': tokenObject.data.token.key,
                    'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                },
                body: {
                    student_id: student_id,
                    course_id: course_id,
                    refund: false
                }
            });
        }).then((body) => {
            if (body.status === 'success') {
                return Corestackstudent.find({
                    where: {
                        student_id: student_id,
                        course_id: course_id
                    }
                }).then(studentInstance => {
                    studentInstance.student_course_status = 'deregistered';
                    studentInstance.save();
                    return studentInstance;
                });
            } else {
                return Promise.reject(body);
            }
        }).catch(err => {
            return Promise.reject(err);
        });



    };

    Corestackstudent.reregisterStudent = async function (student_id, course_id, course_start_date, course_end_date) {
        return Corestackstudent.app.models.corestack_token.getTokenObject()
            .then(tokenObject => {
                return request.post({
                    url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.projects[0].id
                        + '/cloudlab/register_student',
                    json: true,
                    headers: {
                        'X-Auth-Token': tokenObject.data.token.key,
                        'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                    },
                    body: {
                        student_id: student_id,
                        course_id: course_id,
                        course_start_date: course_start_date,
                        course_end_date: course_end_date
                    }
                });
            }).then((body) => {
                if (body.status === 'success') {
                    return Corestackstudent.find({
                        where: {
                            student_id: student_id,
                            course_id: course_id
                        }
                    }).then(studentInstance => {
                        studentInstance.student_course_status = 'registered';
                        studentInstance.save();
                        return studentInstance;
                    });
                } else {
                    return Promise.reject(body);
                }
            }).catch(err => {
                return Promise.reject(err);
            });



    };

    Corestackstudent.getStudentAccessDetails = async function (student_id, course_id) {
        return Corestackstudent.app.models.corestack_token.getTokenObject()
            .then(tokenObject => {
                return request.get({
                    url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.projects[0].id
                        + '/cloudlab/access_details/' + student_id + '/' + course_id,
                    json: true,
                    headers: {
                        'X-Auth-Token': tokenObject.data.token.key,
                        'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                    }
                });
            }).then((body) => {
                if (body.status === 'success') {
                    return body.data;
                } else {
                    return Promise.reject(body);
                }
            }).catch(err => {
                return Promise.reject(err);
            });
    };

    Corestackstudent.getStudentDetails = async function (student_id, course_id) {
        return Corestackstudent.app.models.corestack_token.getTokenObject()
            .then(tokenObject => {
                return request.get({
                    url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.projects[0].id
                        + '/cloudlab/student/' + student_id + '/' + course_id,
                    json: true,
                    headers: {
                        'X-Auth-Token': tokenObject.data.token.key,
                        'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                    }
                });
            }).then((body) => {
                if (body.status === 'success') {
                    return body.data;
                } else {
                    return Promise.reject(body);
                }
            }).catch(err => {
                return Promise.reject(err);
            });
    };

};
