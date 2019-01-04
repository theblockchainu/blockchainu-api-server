'use strict';

let request = require('request-promise-native');
let moment = require('moment');

module.exports = function (Corestackstudent) {
	
	Corestackstudent.registerStudent = async function (student_id,
	                                                   student_name, student_email, course_id, course_start_date, username,
	                                                   course_end_date, user_script_path) {
		// const user_script_path = await this.getUserScriptPath(githubUrl);
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
		
		console.log('studentData');
		console.log(studentData);
		
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
					console.log('core_stack_add_error');
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
	
	
	Corestackstudent.getUserScriptPath = async function (githubUrl) {
		return null;
	};
	
	Corestackstudent.deregisterStudent = async function (student_id, course_id) {
		return Corestackstudent.app.models.corestack_token.getTokenObject().then(tokenObject => {
			return request.post({
				url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id
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
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id
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
		let access_data;
		return Corestackstudent.app.models.corestack_token.getTokenObject()
				.then(tokenObject => {
					console.log('tokenObjectReceived');
					console.log(tokenObject);
					return request.get({
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id
						+ '/cloudlab/access_details/' + student_id + '/' + course_id,
						json: true,
						headers: {
							'X-Auth-Token': tokenObject.data.token.key,
							'X-Auth-User': Corestackstudent.app.get('corestackUserName')
						}
					});
				}).then((body) => {
					let blockchainKeys;
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
						url: Corestackstudent.app.get('corestackUrl') + '/v1/' + tokenObject.data.projects[0].id + '/student/'
						+ student_id + '/' + course_id,
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
	
	Corestackstudent.updateStudent = async function (student_id, course_id,
	                                                 student_name, course_end_date) {
		// const user_script_path = await this.getUserScriptPath(githubUrl);
		const query = {
			where: {
				student_id: student_id,
				course_id: course_id
			}
		};
		Corestackstudent.find(query).then(corestackstudentInstances => {
			if (corestackstudentInstances && corestackstudentInstances.length > 0) {
				const corestackstudentInstance = corestackstudentInstances[0];
				const studentData = {};
				if (student_name) {
					studentData.student_name = student_name;
				}
				if (course_end_date) {
					studentData.course_end_date = course_end_date;
				}
				
				// if (user_script_path) {
				//     studentData.custom_options = {
				//         user_script_path: user_script_path // provide the path to user script
				//     };
				// }
				
				console.log('studentData');
				console.log(studentData);
				
				return Corestackstudent.app.models.corestack_token.getTokenObject();
			} else {
				return Promise.reject('Corestack student not found!');
			}
		}).then(tokenObject => {
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
	
	Corestackstudent.updateStudentAPI = async function (student_id, course_id, body) {
		return Corestackstudent.updateStudent(student_id, course_id,
				body.student_name, body.course_end_date);
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
