var fs = require('fs');
const path = require("path");
var Sharp = require('sharp');
var Streamifier = require('streamifier');
var ALLOWED_RESOLUTIONS = new Set(['100', '300', '500', '750', '1000', '1500']);
module.exports = function(Container) {
	
	Container.downloadSize = function (container, size, file, req, res, cb) {
		req.params.container = 'peerbuds-dev1290';
		var loggedinPeer = Container.getCookieUserId(req);
		var fileWithSize = size + '/' + file;
		
		if(0 !== ALLOWED_RESOLUTIONS.size && !ALLOWED_RESOLUTIONS.has(size) ) {
			cb ({
				code: 'WRONG RESOLUTION',
				statusCode: 403,
				status: 403,
				message: 'This resolution is not allowed'
			});
		}
		
		console.log('Received request to download s3 media of size: ' + size);
		Container.download(container, fileWithSize, req, res, function(err, response) {
			if (err) {
				//console.log('File of this size does not exist. We will create a new file of this size now.');
				var downloadStream = Container.downloadStream(container, file, {});
				var chunks = [];
				downloadStream.on('data', function(chunk) {
					chunks.push(chunk);
				});
				downloadStream.on('end', function() {
					var imageBuffer = Buffer.concat(chunks);
					//console.log('Downloaded the original media. Now resizing it.');
					Sharp(imageBuffer)
							.resize(parseInt(size, 10), null)
							.toBuffer()
							.then(buffer => {
								//console.log('Resize done. Uploading new media');
								var writeStream = Container.uploadStream(container, fileWithSize, {});
								var inputStream = Streamifier.createReadStream(buffer);
								inputStream.on('end', function() {
									writeStream.end();
								});
								writeStream.on('success', function () {
									//console.log('Upload done. Now downloading correct sized media.');
									Container.download(container, fileWithSize, req, res, function(err, response2) {
										if (err) {
											cb (err);
										} else {
											cb (null, response2);
										}
									});
								});
								inputStream.pipe(writeStream, {end: false});
							})
							.catch(err => {
								console.log(err);
							});
				});
			} else {
				cb(null, response);
			}
		});
	};
	
	Container.getCookieUserId = function (req) {
		
		var cookieArray = req.headers.cookie.split(';');
		var cookie = '';
		for (var i = 0; i < cookieArray.length; i++) {
			if (cookieArray[i].split('=')[0].trim() === 'userId') {
				cookie = cookieArray[i].split('=')[1].trim();
			}
		}
		return cookie.split(/[ \:.]+/)[0].substring(4);
	};
	
	Container.remoteMethod(
			'downloadSize',
			{
				description: 'Downloads a file of specific size',
				accepts: [
					{arg: 'container', type: 'string', required: true, 'http': {source: 'path'}},
					{arg: 'size', type: 'string', required: true, 'http': {source: 'path'}},
					{arg: 'file', type: 'string', required: true, 'http': {source: 'path'}},
					{arg: 'req', type: 'object', 'http': {source: 'req'}},
					{arg: 'res', type: 'object', 'http': {source: 'res'}}
				],
				http: {verb: 'get', path: '/:container/download/:file/:size'}
			}
	);

};