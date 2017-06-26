var request = require('request');
var bignumJSON = require('json-bignum');

var async = require('async');

var Q = require('q');

var queryString = require('querystring');


var getCookies = function (cs) {
    var cookies = {};           // The object we will return
    var all = cs;  // Get all cookies in one big string
    if (all === "")             // If the property is the empty string
        return cookies;         // return an empty object
    var list = all.split("; "); // Split into individual name=value pairs
    for (var i = 0; i < list.length; i++) {  // For each cookie
        var cookie = list[i];
        var p = cookie.indexOf("=");        // Find the first = sign
        var name = cookie.substring(0, p);   // Get cookie name
        var value = cookie.substring(p + 1);  // Get cookie value
        value = decodeURIComponent(value);  // Decode the value
        cookies[name] = value;              // Store name and value in object
    }
    return cookies;
}


var GoogleExtension = function (google_app_id, google_app_secret) {
    require('events').EventEmitter.call(this);
    this.google_app_id = google_app_id;
    this.google_app_secret = google_app_secret;
    this.graph_api_host = 'https://people.googleapis.com/'
    this.graph_api_version = '1';
    this.graph_api_url = this.graph_api_host.concat('v'.concat(this.graph_api_version)).concat('/');
};

require('util').inherits(GoogleExtension, require('events').EventEmitter);


GoogleExtension.prototype.getContacts = function (accessToken, cb) {
    var deferred = Q.defer();
    var method = 'connections';
    console.log(accessToken);
    var url = this.graph_api_url.concat('people/me').concat('/'.concat(method)).concat('?personFields=names&access_token='.concat(accessToken));
    request(url, function (e, res, body) {
        if (e) {
            deferred.reject({
                error: e
            });
        } else {
            if (res.statusCode == 200) {
                var bodyJSON = bignumJSON.parse(body);
                console.log(bodyJSON);
                if (!bodyJSON.error) {
                    if(bodyJSON.length > 0)
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