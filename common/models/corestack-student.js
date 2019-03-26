'use strict';

const request = require('request-promise-native');
const moment = require('moment');
let Promise = require('bluebird');

module.exports = function (Corestackstudent) {
	
	Corestackstudent.registerStudent = (student_id,
	                                    student_name, student_email, course_id, course_start_date, username,
	                                    course_end_date, user_script_path) => {
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
		} else {
			studentData.custom_options = {
				user_script_path: 'https://blockchainethereum.blob.core.windows.net/ethereum-blockchain-userdata/ethereum_userdata_script_jan7.sh' // provide the path to user script
			};
		}
		
		console.log('Registering student on corestack with studentData: ');
		console.log(studentData);
		
		return Corestackstudent.app.models.corestack_token.getTokenObject()
				.then(tokenObject => {
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
					console.log('core_stack_added_student');
					console.log(body);
					if (body.status === 'success') {
						studentData.student_course_status = 'registered';
						console.log(studentData);
						studentData.custom_options_stringified = JSON.stringify(studentData.custom_options);
						delete studentData.custom_options;
						return Corestackstudent.create(studentData);
					} else {
						return Promise.reject(body);
					}
				})
				.catch(err => {
					console.log('core_stack_add_student_error');
					console.log(err.error.message);
					// Check existing student in corestack DB, if present create a node in local DB and return the instance else return error
					return Corestackstudent.getStudentDetails(studentData.student_id, studentData.course_id)
							.then(existingCorestackStudent => {
								const existingStudent = existingCorestackStudent.data;
								if (existingStudent) {
									console.log('existingStudent');
									console.log(existingStudent);
									existingStudent.student_course_status = 'registered';
									existingStudent.custom_options_stringified = JSON.stringify(studentData.custom_options);
									delete existingStudent.custom_options;
									return Corestackstudent.create(existingStudent);
								} else {
									return Promise.reject('Error');
								}
							})
							.catch(err => {
								return Promise.reject('Error');
							});
				});
	};
	
	Corestackstudent.deregisterStudent = function (student_id, course_id) {
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/deregister_student',
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
							studentInstance[0].student_course_status = 'deregistered';
							studentInstance[0].save();
							return Promise.resolve(studentInstance[0]);
						});
					} else {
						return Promise.reject(body);
					}
				}).catch(err => {
					if (err.error.message === 'Student has already been de-activated') {
						console.log('student deactivated on corestack. setting status to deregistered.');
						return Corestackstudent.find({
							where: {
								student_id: student_id,
								course_id: course_id
							}
						}).then(studentInstance => {
							console.log(studentInstance);
							studentInstance[0].student_course_status = 'deregistered';
							studentInstance[0].save();
							return Promise.resolve(studentInstance[0]);
						});
					} else {
						return Promise.reject(err);
					}
				});
	};
	
	Corestackstudent.reregisterStudent = function (student_id, course_id, course_start_date, course_end_date) {
		return Corestackstudent.app.models.corestack_token.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/register_student',
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
							studentInstance[0].student_course_status = 'registered';
							studentInstance[0].save();
							return Promise.resolve(studentInstance[0]);
						});
					} else {
						return Promise.reject(body);
					}
				}).catch(err => {
					return Promise.reject(err);
				});
	};
	
	Corestackstudent.getStudentAccessDetails = function (student_id, course_id) {
		let access_data, token_object;
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					token_object = tokenObject;
					return request.get({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/access_details/' + student_id + '/' + course_id,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						}
					});
				}).then((body) => {
					let blockchainPromise;
					if (body.status === 'success') {
						console.log(body);
						access_data = body.data;
						console.log('requesting_keys_file_path');
						access_data.some(accessDetail => {
							if (accessDetail.application_name === 'Additional Information') {
								console.log(accessDetail.keys_file_path);
								blockchainPromise = request.get({
									url: accessDetail.keys_file_path,
									json: false
								});
								return true;
							}
						});
						return blockchainPromise ? blockchainPromise : Promise.resolve(null);
					} else {
						return Promise.reject('CorestackError' + body);
					}
				}).then(keysJSON => {
					if (keysJSON) {
						access_data.map(accessDetail => {
							if (accessDetail.application_name === 'Additional Information') {
								accessDetail.keys = keysJSON;
								return accessDetail;
							} else {
								return accessDetail;
							}
						});
					}
					// Get instance status
					return request.get({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + token_object.data.projects[0].id + '/cloudlab/instance_status/' + student_id + '/' + course_id,
						json: true,
						headers: {
							'X-Auth-Token': token_object.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
					});
				})
				.then((instanceStatus) => {
					console.log('Instance status: ');
					console.log(instanceStatus);
					if (instanceStatus.status === 'success') {
						access_data.map(accessDetail => {
							if (accessDetail.application_name === 'Additional Information') {
								accessDetail.instanceStatus = instanceStatus.data;
								return accessDetail;
							} else {
								return accessDetail;
							}
						});
					}
					return access_data;
				})
				.catch(err => {
					return Promise.reject(err);
				});
	};
	
	Corestackstudent.getStudentDetails = function (student_id, course_id) {
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					return request.get({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/student/' + student_id + '/' + course_id,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
					});
				}).catch(err => {
					console.log('Error in corestack getStudentDetails');
					console.log(err);
				});
	};
	
	Corestackstudent.startInstance = function (body) {
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/start_instance',
						body: body,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
					});
				}).catch(err => {
					console.log('Error in corestack getStudentDetails');
					console.log(err);
				});
	};
	
	Corestackstudent.stopInstance = function (body) {
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/stop_instance',
						body: body,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
					});
				}).catch(err => {
					console.log('Error in corestack getStudentDetails');
					console.log(err);
				});
	};
	
	Corestackstudent.restartInstance = function (body) {
		return Corestackstudent.app.models.corestack_token
				.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/cloudlab/restart_instance',
						body: body,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
					});
				}).catch(err => {
					console.log('Error in corestack getStudentDetails');
					console.log(err);
				});
	};
	
	Corestackstudent.updateStudent = function (student_id, course_id, student_name, course_end_date) {
		// const user_script_path = await this.getUserScriptPath(githubUrl);
		const query = {
			where: {
				student_id: student_id,
				course_id: course_id
			}
		};
		const studentData = {};
		return Corestackstudent.find(query)
				.then(corestackstudentInstances => {
					if (corestackstudentInstances && corestackstudentInstances.length > 0) {
						const corestackstudentInstance = corestackstudentInstances[0];
						if (student_name) {
							studentData.student_name = student_name;
						}
						if (course_end_date) {
							studentData.course_end_date = course_end_date;
						}
						console.log('studentData');
						console.log(studentData);
						
						return Corestackstudent.app.models.corestack_token.getTokenObject();
					} else {
						return Promise.reject('Corestack student not found!');
					}
				}).then(tokenObject => {
					return request.put({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/student/' + student_id + '/' + course_id,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
						body: studentData
					});
				})
				.then((body) => {
					console.log('core_stack_added_updated');
					console.log(body);
					if (body.status === 'success') {
						studentData.student_course_status = 'registered';
						console.log(studentData);
						studentData.custom_options_stringified = JSON.stringify(studentData.custom_options);
						delete studentData.custom_options;
						return Corestackstudent.create(studentData);
					} else {
						return Promise.reject(body);
					}
				})
				.catch(err => {
					console.log('core_stack_add_error');
					console.log(err.error.message);
					// Check existing student in corestack DB, if present create a node in local DB and return the instance else return error
					return Corestackstudent.getStudentDetails(studentData.student_id, studentData.course_id).then(existingCorestackStudent => {
						const existingStudent = existingCorestackStudent.data;
						if (existingStudent) {
							console.log('existingStudent');
							console.log(existingStudent);
							existingStudent.student_course_status = 'registered';
							existingStudent.custom_options_stringified = JSON.stringify(studentData.custom_options);
							delete existingStudent.custom_options;
							return Corestackstudent.create(existingStudent);
						} else {
							return Promise.reject('Error');
						}
					});
				});
	};
	
	Corestackstudent.cloneCourse = (lab_id, new_course_id, new_course_name, new_course_code, course_start_date, course_end_date) => {
		let cloneData = {
			new_course_id: new_course_id,
			new_course_name: new_course_name,
			new_course_code: new_course_code,
			course_start_date: course_start_date,
			course_end_date: course_end_date
		};
		
		console.log('Cloning corestack lab ' + lab_id + ' with data: ');
		console.log(cloneData);
		
		return Corestackstudent.app.models.corestack_token.getTokenObject()
				.then(tokenObject => {
					return request.post({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/lab/configure/clone/' + lab_id,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						},
						body: cloneData
					});
				})
				.then((body) => {
					console.log('core_stack_lab_cloned');
					console.log(body);
					if (body.status === 'success') {
						return Promise.resolve(body.data);
					} else {
						console.error(body);
						return Promise.reject(body);
					}
				})
				.catch(err => {
					console.log('core_stack_lab_clone_error');
					console.log(err);
					// Check existing student in corestack DB, if present create a node in local DB and return the instance else return error
					return Promise.reject(err);
				});
	};
	
	Corestackstudent.updateStudentAPI = async function (student_id, course_id, body) {
		return Corestackstudent.updateStudent(student_id, course_id, body.student_name, body.course_end_date);
	};
	
	Corestackstudent.remoteMethod(
			'getStudentAccessDetails',
			{
				accepts: [
					{ arg: 'student_id', type: 'string', required: true },
					{ arg: 'course_id', type: 'string', required: true },
					{ arg: 'req', type: 'object', http: { source: 'req' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/:student_id/course/:course_id/access_details', verb: 'get' }
			});
	
	Corestackstudent.remoteMethod(
			'startInstance',
			{
				accepts: [
					{ arg: 'body', type: 'object', http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/start_instance', verb: 'post' }
			});
	
	Corestackstudent.remoteMethod(
			'stopInstance',
			{
				accepts: [
					{ arg: 'body', type: 'object', http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/stop_instance', verb: 'post' }
			});
	
	Corestackstudent.remoteMethod(
			'restartInstance',
			{
				accepts: [
					{ arg: 'body', type: 'object', http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/restart_instance', verb: 'post' }
			});
	
	Corestackstudent.remoteMethod(
			'updateStudentAPI',
			{
				accepts: [
					{ arg: 'student_id', type: 'string', required: true },
					{ arg: 'course_id', type: 'string', required: true },
					{ arg: 'body', type: 'object', http: { source: 'body' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/:student_id/course/:course_id/update_details', verb: 'put' }
			});
	
};
