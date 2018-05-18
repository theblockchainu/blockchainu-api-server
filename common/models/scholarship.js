'use strict';
var g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Scholarship) {
    Scholarship.validatesInclusionOf('type', { in: ['public', 'private'] });
	
	Scholarship.karmaBalance = function (id, req, cb) {
		// Find the collection by given ID
		Scholarship.findById(id, function (err, scholarshipInstance) {
			if (!err && scholarshipInstance !== null && scholarshipInstance.ethAddress) {
				Scholarship.app.getKarmaContractInstance().balanceOf(scholarshipInstance.ethAddress)
						.then(function (result) {
							cb(null, result);
						})
						.catch(err => {
							console.error(err);
							cb(err);
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
	   const instance = ctx.instance;
	   next();
	});
	
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
