'use strict';
var g = require('../../node_modules/loopback/lib/globalize');
let app = require('../../server/server');
const protocolUrl = app.get('protocolUrl');
let request = require('request');

module.exports = function (Scholarship) {
    Scholarship.validatesInclusionOf('type', { in: ['public', 'private'] });
	
	Scholarship.karmaBalance = function (id, req, cb) {
		// Find the collection by given ID
		Scholarship.findById(id, function (err, scholarshipInstance) {
			if (!err && scholarshipInstance !== null && scholarshipInstance.ethAddress) {
				request
						.get({
							url: protocolUrl + 'scholarships/' + id + '/karma',
						}, function(err, response, data) {
							if (err) {
								console.error(err);
								cb(err);
							} else {
								console.log('Got karma balance of scholarship: ' + data);
								if (req.query && req.query.convertTo && req.query.convertTo === 'USD') {
									Scholarship.app.models.cache.findById('1', function (err, cacheInstance) {
										if (err) {
											cb(err);
										} else {
											console.log('Got eth rate: ' + cacheInstance.ethRate);
											const dollarPerEther = parseFloat(cacheInstance.ethRate);
											const karmaPerEther = app.get('karmaRate');
											cb(null, (data * (1 / karmaPerEther) * dollarPerEther).toFixed(2));
										}
									});
								} else {
									cb(null, data);
								}
							}
						});
			}
			else {
				err = new Error(g.f('Invalid Scholarship with ID: %s', id));
				err.statusCode = 400;
				err.code = 'INVALID_SCHOLARSHIP';
				cb(err);
			}
			
		});
	};
	
	Scholarship.observe('after save', function (ctx, next) {
	   const instance = ctx.instance || ctx.data;
	   console.log(Object.keys(ctx));
		request
				.post({
					url: protocolUrl + 'scholarships',
					body: {
						uniqueId: instance.id,
						ownerAddress: '0x821aEa9a577a9b44299B9c15c88cf3087F3b5544',
						type: instance.type,
						title: instance.title,
						description: instance.description,
						preRequisite: instance.min_gyan,
						transactionLimit: instance.max_karma,
						walletAddress: instance.ethAddress,
						allowedCollections: ['']
					},
					json: true
				}, function(err, response, data) {
					if (err) {
						console.error(err);
					} else {
						console.log('Created new scholarship on blockchain: ' + data);
					}
				});
	   /*const loggedInUserId = Scholarship.getCookieUserId(ctx.req);*/
		/*Scholarship.app.models.peer.findById(loggedInUserId, function (err, peerUserInstance) {
			if (err) {
				console.log(err);
			} else {
				if (peerUserInstance.ethAddress && peerUserInstance.ethAddress.length > 0) {
					request
							.post({
								url: protocolUrl + 'scholarships',
								body: {
									uniqueId: instance.id,
									ownerAddress: '',
									type: instance.type,
									title: instance.title,
									description: instance.description,
									preRequisite: instance.min_gyan,
									transactionLimit: instance.max_karma,
									walletAddress: instance.ethAddress,
									allowedCollections: ['']
								},
								json: true
							}, function(err, response, data) {
								if (err) {
									console.error(err);
								} else {
									console.log('Created new scholarship on blockchain: ' + data);
								}
							});
				}
			}
		});*/
	   next();
	});
	
	// Record scholarship participation on BC.
	Scholarship.afterRemote('prototype.__link__peers_joined', function(ctx, peerInstance, next) {
		let scholarshipInstance = ctx.instance;
		Scholarship.app.models.peer.findById(peerInstance.sourceId, function (err, peerUserInstance) {
			if (peerUserInstance.ethAddress && peerUserInstance.ethAddress.length > 0) {
				request
						.put({
							url: protocolUrl + 'scholarships/' + scholarshipInstance.id + '/peers/rel/' + peerUserInstance.ethAddress,
							json: true
						}, function(err, response, data) {
							if (err) {
								console.error(err);
							} else {
								console.log('Added participant to scholarship on blockchain: ' + data);
							}
						});
			}
		});
		next();
	});
	
	// Record scholarship participation on BC.
	Scholarship.afterRemote('prototype.__unlink__peers_joined', function(ctx, next) {
		let scholarshipInstance = ctx.instance;
		Scholarship.app.models.peer.findById(ctx.args.fk, function (err, peerUserInstance) {
			if (peerUserInstance.ethAddress && peerUserInstance.ethAddress.length > 0) {
				request
						.delete({
							url: protocolUrl + 'scholarships/' + scholarshipInstance.id + '/peers/rel/' + peerUserInstance.ethAddress,
							json: true
						}, function(err, response, data) {
							if (err) {
								console.error(err);
							} else {
								console.log('Removed participant from scholarship on blockchain: ' + data);
							}
						});
			}
		});
		next();
	});
	
	Scholarship.getCookieUserId = function (req) {
		
		let cookieArray = req.headers.cookie.split(';');
		let cookie = '';
		for (let i = 0; i < cookieArray.length; i++) {
			if (cookieArray[i].split('=')[0].trim() === 'userId') {
				cookie = cookieArray[i].split('=')[1].trim();
			}
		}
		console.log('User ID from cookie is: ' + cookie.split(/[ \:.]+/)[0]);
		return cookie.split(/[ \:.]+/)[0];
	};
	
	Scholarship.remoteMethod(
			'karmaBalance',
			{
				accepts: [
					{ arg: 'id', type: 'string', required: true },
					{ arg: 'req', type: 'object', http: { source: 'req' } }
				],
				returns: { arg: 'result', type: 'object', root: true },
				http: { path: '/:id/karmaBalance', verb: 'get' }
			}
	);
};
