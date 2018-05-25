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


let GoogleExtension = function (google_app_id, google_app_secret) {
    require('events').EventEmitter.call(this);
    this.google_app_id = google_app_id;
    this.google_app_secret = google_app_secret;
    this.graph_api_host = 'https://people.googleapis.com/';
    this.graph_api_version = '1';
    this.graph_api_url = this.graph_api_host.concat('v'.concat(this.graph_api_version)).concat('/');
};

require('util').inherits(GoogleExtension, require('events').EventEmitter);


GoogleExtension.prototype.getContacts = function (accessToken, cb) {
    let deferred = Q.defer();
    let method = 'connections';
    //console.log(accessToken);
    let url = this.graph_api_url.concat('people/me').concat('/'.concat(method)).concat('?personFields=names,photos,emailAddresses&access_token='.concat(accessToken));
    request(url, function (e, res, body) {
        if (e) {
            deferred.reject({
                error: e
            });
        } else {
            if (res.statusCode === 200) {
                let bodyJSON = bignumJSON.parse(body);
                //console.log(bodyJSON);
                if (!bodyJSON.error) {
                    if(bodyJSON.hasOwnProperty('connections'))
                        deferred.resolve(bodyJSON.connections);
                    else deferred.resolve([]);
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

module.exports = GoogleExtension;