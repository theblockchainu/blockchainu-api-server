'use strict';
var g = require('../../node_modules/loopback/lib/globalize');
var loopback = require('../../node_modules/loopback/lib/loopback');
var assert = require('assert');
var uid = require('uid2');
var DEFAULT_TOKEN_LEN = 64;

module.exports = function(Usertoken) {

    /**
     * Anonymous Token
     *
     * ```js
     * assert(AccessToken.ANONYMOUS.id === '$anonymous');
     * ```
     */

    Usertoken.ANONYMOUS = new Usertoken({id: '$anonymous'});

    /**
     * Find a token for the given `ServerRequest`.
     *
     * @param {ServerRequest} req
     * @param {Object} [options] Options for finding the token
     * @callback {Function} callback
     * @param {Error} err
     * @param {AccessToken} token
     */

    Usertoken.findForRequest = function(req, options, cb) {
        if (cb === undefined && typeof options === 'function') {
            cb = options;
            options = {};
        }

        var id = tokenIdForRequest(req, options);

        if (id) {

            this.findById(id,
                function(err, token) {
                    if(err) {
                        cb(err);
                    }
                    else if(token) {
                        token.validate(token, function(err, isValid) {
                           if(err) {
                               cb(err);
                           } else if(isValid) {
                               cb(null, token);
                           } else {
                               var e = new Error(g.f('Invalid Access Token'));
                               e.status = e.statusCode = 401;
                               e.code = 'INVALID_TOKEN';
                               cb(e);
                           }
                        });
                    }
                    else {
                        cb();
                    }
                }
            );
        } else {
            process.nextTick(function() {
                cb();
            });
        }
    };

    /**
     * Validate the token.
     *
     * @callback {Function} callback
     * @param {Error} err
     * @param {Boolean} isValid
     */

    Usertoken.prototype.validate = function(token, cb) {
        try {
            /*assert(
                this.created && typeof this.created.getTime === 'function',
                'token.created must be a valid Date'
            );*/
            assert(this.ttl !== 0, 'token.ttl must be not be 0');
            assert(this.ttl, 'token.ttl must exist');
            assert(this.ttl >= -1, 'token.ttl must be >= -1');

            var usertoken = this.constructor;

            Usertoken.dataSource.connector.execute(
                "match (p:peer)-[:hasToken]->(token:UserToken {id: '"+ token.id+"'}) return p",
                function(err, peer) {
                    if(err) {
                        process.nextTick(function() {
                            cb(null, false);
                        });
                    }
                    else {

                        var now = Date.now();
                        //console.log("current timestamp is: " + now);
                        var created = token.createdAt.getTime();
                        //console.log("created timestamp is: " + created);
                        var elapsedSeconds = (now - created) / 1000;
                        var secondsToLive = token.ttl;
                        var eternalTokensAllowed = !!(peer);
                        var isEternalToken = secondsToLive === -1;
                        var isValid = isEternalToken ?
                            eternalTokensAllowed :
                            elapsedSeconds < secondsToLive;

                        if (isValid) {
                            process.nextTick(function() {
                                cb(null, isValid);
                            });
                        } else {
                            this.destroy(function(err) {
                                cb(err, isValid);
                            });
                        }
                    }
                }
            );

        } catch (e) {
            process.nextTick(function() {
                cb(e);
            });
        }
    };

    function tokenIdForRequest(req, options) {
        var params = options.params || [];
        var headers = options.headers || [];
        var cookies = options.cookies || [];
        var i = 0;
        var length, id;

        // https://github.com/strongloop/loopback/issues/1326
        if (options.searchDefaultTokenKeys !== false) {
            params = params.concat(['access_token']);
            headers = headers.concat(['X-Access-Token', 'authorization']);
            cookies = cookies.concat(['access_token', 'authorization']);
        }

        for (length = params.length; i < length; i++) {
            var param = params[i];
            // replacement for deprecated req.param()
            id = req.params && req.params[param] !== undefined ? req.params[param] :
                req.body && req.body[param] !== undefined ? req.body[param] :
                    req.query && req.query[param] !== undefined ? req.query[param] :
                        undefined;

            if (typeof id === 'string') {
                return id;
            }
        }

        for (i = 0, length = headers.length; i < length; i++) {
            id = req.header(headers[i]);

            if (typeof id === 'string') {
                // Add support for oAuth 2.0 bearer token
                // http://tools.ietf.org/html/rfc6750
                if (id.indexOf('Bearer ') === 0) {
                    id = id.substring(7);
                    // Decode from base64
                    var buf = new Buffer(id, 'base64');
                    id = buf.toString('utf8');
                } else if (/^Basic /i.test(id)) {
                    id = id.substring(6);
                    id = (new Buffer(id, 'base64')).toString('utf8');
                    // The spec says the string is user:pass, so if we see both parts
                    // we will assume the longer of the two is the token, so we will
                    // extract "a2b2c3" from:
                    //   "a2b2c3"
                    //   "a2b2c3:"   (curl http://a2b2c3@localhost:3000/)
                    //   "token:a2b2c3" (curl http://token:a2b2c3@localhost:3000/)
                    //   ":a2b2c3"
                    var parts = /^([^:]*):(.*)$/.exec(id);
                    if (parts) {
                        id = parts[2].length > parts[1].length ? parts[2] : parts[1];
                    }
                }
                return id;
            }
        }

        if (req.signedCookies) {
            for (i = 0, length = cookies.length; i < length; i++) {
                id = req.signedCookies[cookies[i]];

                if (typeof id === 'string') {
                    return id;
                }
            }
        }
        return null;
    }

};
