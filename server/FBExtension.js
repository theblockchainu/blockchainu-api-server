let request = require('request');

let bignumJSON = require('json-bignum');

let async = require('async');

let Q = require('q');

let queryString = require('querystring');


let getCookies = function (cs) {
    let cookies = {};           // The object we will return
    let all = cs;  // Get all cookies in one big string
    if (all === "")             // If the property is the empty string
        return cookies;         // return an empty object
    let list = all.split("; "); // Split into individual name=value pairs
    for (let i = 0; i < list.length; i++) {  // For each cookie
        let cookie = list[i];
        let p = cookie.indexOf("=");        // Find the first = sign
        let name = cookie.substring(0, p);   // Get cookie name
        let value = cookie.substring(p + 1);  // Get cookie value
        value = decodeURIComponent(value);  // Decode the value
        cookies[name] = value;              // Store name and value in object
    }
    return cookies;
};


let FBExtension = function (fb_app_id, fb_app_secret) {
    require('events').EventEmitter.call(this);
    this.fb_app_id = fb_app_id;
    this.fb_app_secret = fb_app_secret;
    this.graph_api_host = 'https://graph.facebook.com/';
    this.graph_api_version = '2.5';
    this.graph_api_url = this.graph_api_host.concat('v'.concat(this.graph_api_version)).concat('/');
};

require('util').inherits(FBExtension, require('events').EventEmitter);


FBExtension.prototype.permissionsGiven = function (uid, accessToken, cb) {
    let deferred = Q.defer();
    let method = 'permissions';
    let url = this.graph_api_url.concat(uid).concat('/'.concat(method)).concat('?access_token='.concat(accessToken));
    request(url, function (e, res, body) {
        if (!e) {
            if (res.statusCode === 200) {
                let bodyJSON = bignumJSON.parse(body);
                deferred.resolve(bodyJSON.data);
            } else {
                deferred.reject({
                    error: {
                        statusCode: res.statusCode
                    }
                });
            }
        } else {
            deferred.reject({
                error: e
            });
        }


    });

    deferred.promise.nodeify(cb);
    return deferred.promise;
};

FBExtension.prototype.friendsUsingApp = function (uid, accessToken, cb) {
    let deferred = Q.defer();
    let method = 'friends';
    let url = this.graph_api_url.concat(uid).concat('/'.concat(method)).concat('?fields=cover,email,name&access_token='.concat(accessToken));
    request(url, function (e, res, body) {
        if (e) {
            deferred.reject({
                error: e
            });
        } else {
            if (res.statusCode === 200) {
                let bodyJSON = bignumJSON.parse(body);

                if (!bodyJSON.error) {
                    deferred.resolve(bodyJSON.data);
                } else {
                    deferred.reject({
                        error: bodyJSON.error
                    });
                }

            } else {
                deferred.reject({
                    error: {
                        statusCode: res.statusCode
                    }
                });
            }
        }
    });

    deferred.promise.nodeify(cb);
    return deferred.promise;
};


FBExtension.prototype.extendShortToken = function (accessToken, cb) {
    let deferred = Q.defer();
    let method = 'access_token';
    let url = this.graph_api_host.concat('oauth/').concat(method).concat('?grant_type=fb_exchange_token&client_id='.concat(this.fb_app_id))
        .concat('&client_secret='.concat(this.fb_app_secret)).concat('&fb_exchange_token='.concat(accessToken));


    request(url, function (e, res, body) {
        if (e) {
            deferred.reject({
                error: e
            });
        } else {
            if (res.statusCode === 200) {
                let resContentType = res.headers['content-type'];
                let contentType = getCookies(resContentType)[''];

                if (contentType === 'text/plain') {
                    let bodyJSON = queryString.parse(body);
                    deferred.resolve(bodyJSON);

                } else if (contentType === 'application/json') {

                    let bodyJSON = bignumJSON.parse(body);
                    deferred.reject(bodyJSON);
                } else {
                    deferred.reject({
                        error: {
                            message: 'Uknown error.'
                        }
                    });
                }
            } else {
                deferred.reject({
                    error: {
                        statusCode: res.statusCode
                    }
                });
            }
        }
    });

    deferred.promise.nodeify(cb);
    return deferred.promise;
};

module.exports = FBExtension;