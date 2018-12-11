'use strict';

let request = require('request-promise-native');
let moment = require('moment');

module.exports = function (Corestackstudent) {

    Corestackstudent.registerStudent = async function (student_id,
        student_name, student_email, course_id, course_start_date, username,
        course_end_date, githubUrl) {
        const user_script_path = await this.getUserScriptPath(githubUrl);
        let studentData = {
            student_id: student_id,
            student_name: student_name,
            student_email: student_email,
            course_id: course_id,
            course_start_date: course_start_date,
            username: username,
            course_end_date: course_end_date,
        };
        if (user_script_path) {
            studentData.custom_options = {
                user_script_path: user_script_path // provide the path to user script
            };
        }
        return Corestackstudent.app.models.corestack_token.getTokenObject()
            .then(tokenObject => {
                console.log('tokenObject');
                console.log(tokenObject);
                // a sample response
                /*
                const sampleToken = {
                    status: 'success',
                    message: 'Authentication Successful',
                    data: {
                        auth_type: 'Corestack',
                        cost_unit: '/hour',
                        is_full_access: false,
                        subscription_details: {
                            subscription_mode: 'open',
                            valid_upto: 700,
                            is_trial: false,
                            payment_type: 'offline',
                            account_status: 'active',
                            subscription_id: '5ad5aa4f3df48d6c4ee4e6f8',
                            expired_at: '2020-11-08T23:59:59.999000'
                        },
                        workflow: { url: '', enabled: false },
                        is_account_admin: false,
                        payment: [[Object], [Object]],
                        is_product_admin: false,
                        token: {
                            issued_at: '2018-12-10T16:21:12.537121',
                            expires_at: '2018-12-10T17:21:12.537125',
                            key: '115acbe7-7a24-403f-a810-d40cfdff3469'
                        },
                        audit: { enabled: true, level: 'basic' },
                        require_access_key: true,
                        zendesk_chat_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1NDQ0NTg4NzIsImp0aSI6IjY2MjEyMDI2NS4xNzEiLCJuYW1lIjoiYmxvY2tjaGFpbl9wb2NAY29yZXN0YWNrLmlvIiwiZW1haWwiOiJibG9ja2NoYWluX3BvY0Bjb3Jlc3RhY2suaW8ifQ.PEHN_qfGpBmA7K0u_l18Fw7eNUJuzgIdOzIs3asbkNI',
                        cost_currency: 'USD',
                        auth_method: 'password',
                        projects: [[Object]],
                        user: {
                            name: 'blockchain_poc@corestack.io',
                            id: '5bd1cb8426f5e6093608af34',
                            timezone: [Object],
                            active_tenant_id: '5bd1cb8326f5e6093608af2d',
                            project_master_id: '5bd1cb8326f5e6093608af2c',
                            email: 'blockchain_poc@corestack.io'
                        }
                    }
                };
                */
                return request.post({
                    url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/register_student',
                    json: true,
                    headers: {
                        'X-Auth-Token': tokenObject.data.token.key,
                        'X-Auth-User': Corestackstudent.app.get('corestackUserName')
                    },
                    body: studentData
                });
            })
            .then((body) => {
                console.log('Student Rceived from corestack');
                console.log(body);
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

    Corestackstudent.getUserScriptPath = async function (githubUrl) {
        return null;
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
