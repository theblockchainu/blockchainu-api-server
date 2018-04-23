var app = require('../server');
module.exports = function(options) {
	
	const getHeaderAccessToken = function (req) {
		if (req.headers && req.headers.hasOwnProperty('access_token') && req.headers.access_token.length > 0) {
			return req.headers.access_token;
		} else {
			return null;
		}
	};
	
	const getSingularName = function(plural) {
		if (plural.substring(plural.length - 3) === 'ies') {
			return plural.slice(0, -3) + 'y';
		} else {
			return plural.slice(0, -1);
		}
	};
	
	const isRESTapi = function(url) {
		if (url.split('/').length > 2 && url.split('/')[1] === 'api') {
			return true;
		} else {
			return false;
		}
	};
	
	return function authenticationHandler(req, res, next) {
		const access_token = getHeaderAccessToken(req);
		if (isRESTapi(req.url)) {
			let urlModel = getSingularName(req.url.split('/')[2].split('?')[0]);
			console.log(urlModel);
			const model = app.models[urlModel];
			if (urlModel !== 'container') {
				console.log('Request for model: ' + model.name + '. Access Token: ' + access_token);
				if (access_token !== null) {
					next();
				} else {
					if (req.method === 'GET') {
						next();
					} else {
						res.status(401).send('Invalid authentication token. Request denied.');
					}
				}
			} else {
				next();
			}
		} else {
			next();
		}
	}
};