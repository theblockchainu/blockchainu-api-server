'use strict';
var utils = require('../../node_modules/loopback/lib/utils');
var g = require('../../node_modules/loopback/lib/globalize');
var isEmail = require('isemail');
var bcrypt;
var uid = require('uid2');
var DEFAULT_TOKEN_LEN = 64;
var DEFAULT_TTL = 1209600; // 2 weeks in seconds
var DEFAULT_MAX_TTL = 31556926; // 1 year in seconds
var assert = require('assert');
var loopback = require('../../node_modules/loopback/lib/loopback');
var path = require('path');
var qs = require('querystring');
var SALT_WORK_FACTOR = 10;
var crypto = require('crypto');
var MAX_PASSWORD_LENGTH = 72;
var debug = require('debug')('loopback:peer');

try {
    // Try the native module first
    bcrypt = require('bcrypt');
    // Browserify returns an empty object
    if (bcrypt && typeof bcrypt.compare !== 'function') {
        bcrypt = require('bcryptjs');
    }
} catch (err) {
    // Fall back to pure JS impl
    bcrypt = require('bcryptjs');
}

module.exports = function (Peer) {


    /**
     * Login a user by with the given `credentials`.
     *
     * ```js
     *    User.login({username: 'foo', password: 'bar'}, function (err, token) {
        console.log(token.id);
      });
     * ```
     *
     * @param {Object} credentials username/password or email/password
     * @param {String[]|String} [include] Optionally set it to "user" to include
     * the user info
     * @param fn
     * @callback {Function} fn Callback function
     * @promise
     */
    Peer.login = function (credentials, include, fn) {
        var self = this;
        if (typeof include === 'function') {
            fn = include;
            include = undefined;
        }

        fn = fn || utils.createPromiseCallback();

        include = (include || '');
        if (Array.isArray(include)) {
            include = include.map(function (val) {
                return val.toLowerCase();
            });
        } else {
            include = include.toLowerCase();
        }

        var query = self.normalizeCredentials(credentials);

        if (!query.email && !query.username) {
            var err2 = new Error(g.f('{{username}} or {{email}} is required'));
            err2.statusCode = 400;
            err2.code = 'USERNAME_EMAIL_REQUIRED';
            fn(err2);
            return fn.promise;
        }

        self.findOne({ where: query }, function (err, peer) {

            var defaultError = new Error(g.f('login failed'));
            defaultError.statusCode = 401;
            defaultError.code = 'LOGIN_FAILED';

            function tokenHandler(err, token) {
                if (err) return fn(err);
                // if user information is requested along with token, include it in response
                if (Array.isArray(include) ? include.indexOf('peer') !== -1 : include === 'peer') {
                    token.__data.user = peer;
                }
                fn(err, token);
            }

            if (err) {
                fn(defaultError);
            }
            else if (peer) {

                peer.hasPassword(credentials.password, function (err, isMatch) {
                    if (err) {
                        fn(defaultError);
                    }
                    else if (isMatch) {
                        if (self.settings.emailVerificationRequired && !peer.emailVerified) {
                            // Fail to log in if email verification is not done yet
                            err = new Error(g.f('login failed as the email has not been verified'));
                            err.statusCode = 401;
                            err.code = 'LOGIN_FAILED_EMAIL_NOT_VERIFIED';
                            fn(err);
                        } else {
                            if (peer.createAccessToken.length === 2) {
                                peer.createAccessToken(peer, credentials.ttl, tokenHandler);
                            } else {
                                peer.createAccessToken(peer, credentials.ttl, credentials, tokenHandler);
                            }
                        }
                    }
                    else {
                        var incorrectPasswordError = new Error(g.f('incorrect password'));
                        incorrectPasswordError.statusCode = 401;
                        incorrectPasswordError.code = 'INCORRECT_PASSWORD';
                        fn(incorrectPasswordError);
                    }
                });
            }
            else {
                fn(defaultError);
            }

        });

        return fn.promise;

    };


    /**
     * Logout a user with the given accessToken id.
     *
     * ```js
     *    User.logout('asd0a9f8dsj9s0s3223mk', function (err) {
  *      console.log(err || 'Logged out');
  *    });
     * ```
     *
     * @param {String} tokenId
     * @param fn
     * @callback {Function} fn
     * @promise
     */

    Peer.logout = function (tokenId, fn) {
        console.log("Logout function called");
        fn = fn || utils.createPromiseCallback();

        var err;
        if (!tokenId) {
            err = new Error(g.f('{{accessToken}} is required to logout'));
            err.status = 401;
            process.nextTick(fn, err);
            return fn.promise;
        }

        Peer.dataSource.connector.execute(
            "match (:peer)-[:hasToken]->(token:UserToken {id:'" + tokenId + "'}) DETACH DELETE token",
            function (err, results) {
                if (err) {
                    fn(err);
                }
                else {
                    fn();
                }
            }
        );
        return fn.promise;
    };

    /**
     * Confirm the user's identity.
     *
     * @param uid
     * @param {String} token The validation token
     * @param {String} redirect URL to redirect the user to once confirmed
     * @param fn
     * @callback {Function} callback
     * @promise
     */
    Peer.confirm = function (uid, token, redirect, fn) {
        fn = fn || utils.createPromiseCallback();
        this.findById(uid, function (err, user) {
            if (err) {
                fn(err);
            } else {
                if (user && user.verificationToken === token) {
                    user.verificationToken = null;
                    user.emailVerified = true;
                    user.save(function (err) {
                        if (err) {
                            fn(err);
                        } else {
                            fn();
                        }
                    });
                } else {
                    if (user) {
                        err = new Error(g.f('Invalid token: %s', token));
                        err.statusCode = 400;
                        err.code = 'INVALID_TOKEN';
                    } else {
                        err = new Error(g.f('User not found: %s', uid));
                        err.statusCode = 404;
                        err.code = 'USER_NOT_FOUND';
                    }
                    fn(err);
                }
            }
        });
        return fn.promise;
    };


    /**
     * Create a short lived access token for temporary login. Allows users
     * to change passwords if forgotten.
     *
     * @options {Object} options
     * @prop {String} email The user's email address
     * @property {String} realm The user's realm (optional)
     * @callback {Function} callback
     * @promise
     * @param options
     * @param cb
     */

    Peer.resetPassword = function (options, cb) {
        cb = cb || utils.createPromiseCallback();
        var PeerModel = this;
        var ttl = PeerModel.settings.resetPasswordTokenTTL || DEFAULT_RESET_PW_TTL;
        options = options || {};
        if (typeof options.email !== 'string') {
            var err = new Error(g.f('Email is required'));
            err.statusCode = 400;
            err.code = 'EMAIL_REQUIRED';
            cb(err);
            return cb.promise;
        }

        try {
            if (options.password) {
                PeerModel.validatePassword(options.password);
            }
        } catch (err) {
            return cb(err);
        }
        var where = {
            email: options.email
        };
        if (options.realm) {
            where.realm = options.realm;
        }
        PeerModel.findOne({ where: where }, function (err, user) {
            if (err) {
                return cb(err);
            }
            if (!user) {
                err = new Error(g.f('Email not found'));
                err.statusCode = 404;
                err.code = 'EMAIL_NOT_FOUND';
                return cb(err);
            }
            // create a short lived access token for temp login to change password
            // TODO(ritch) - eventually this should only allow password change
            if (PeerModel.settings.emailVerificationRequired && !user.emailVerified) {
                err = new Error(g.f('Email has not been verified'));
                err.statusCode = 401;
                err.code = 'RESET_FAILED_EMAIL_NOT_VERIFIED';
                return cb(err);
            }

            user.createAccessToken(ttl, function (err, accessToken) {
                if (err) {
                    return cb(err);
                }
                cb();
                PeerModel.emit('resetPasswordRequest', {
                    email: options.email,
                    accessToken: accessToken,
                    user: user,
                    options: options
                });
            });
        });

        return cb.promise;
    };


    /*Peer.observe('before delete', function(ctx, next) {
        var AccessToken = ctx.Model.relations.accessTokens.modelTo;
        var pkName = ctx.Model.definition.idName() || 'id';
        ctx.Model.find({where: ctx.where, fields: [pkName]}, function(err, list) {
            if (err) return next(err);

            var ids = list.map(function(u) { return u[pkName]; });
            ctx.where = {};
            ctx.where[pkName] = {inq: ids};

            AccessToken.destroyAll({userId: {inq: ids}}, next);
        });
    });*/

    //noinspection JSCheckFunctionSignatures
    Peer.observe('before delete', function (ctx, next) {

        Peer.dataSource.connector.execute(
            "match (:peer {id:'" + ctx.where.id + "'})-[:hasToken]->(token:UserToken) DETACH DELETE token",
            function (err, results) {
                if (err) {
                    next(err);
                }
                else {
                    next();
                }
            }
        );
    });

    /**
     * Create access token for the logged in user. This method can be overridden to
     * customize how access tokens are generated
     *
     * @param peer
     * @param {Number} ttl The requested ttl
     * @param {Object} [options] The options for access token, such as scope, appId
     * @param cb
     * @callback {Function} cb The callback function
     * @promise
     */
    Peer.prototype.createAccessToken = function (peer, ttl, options, cb) {
        if (cb === undefined && typeof options === 'function') {
            // createAccessToken(ttl, cb)
            cb = options;
            options = undefined;
        }

        cb = cb || utils.createPromiseCallback();

        if (typeof ttl === 'object' && !options) {
            // createAccessToken(options, cb)
            options = ttl;
            ttl = options.ttl;
        }
        options = options || {};
        var userModel = this.constructor;
        ttl = Math.min(ttl || userModel.settings.ttl, userModel.settings.maxTTL);

        uid(Peer.settings.accessTokenIdLength || DEFAULT_TOKEN_LEN, function (err, guid) {
            if (err) {
                cb(err);
            } else {
                Peer.dataSource.connector.execute(
                    "match (p:peer {username: '" + peer.username + "'}) create (p)-[r:hasToken]->(token:UserToken {id: '" + guid + "', ttl: '" + ttl + "', created: timestamp()}) return token",
                    cb
                );
            }
        });

        return cb.promise;
    };

    Peer.prototype.createProfile = function (profileModel,user, cb) {
        if (cb === undefined && typeof options === 'function') {
            // createAccessToken(ttl, cb)
            cb = options;
            options = undefined;
        }
        cb = cb || utils.createPromiseCallback();
        console.log(user.Id);
        var emptyProfile = {"userId":user.id};

        profileModel.create(emptyProfile, function (err, profileNode) {
            if (!err && profileNode) {
                if (profileNode.isNewInstance)
                    console.log("Created new user entry");

                profileModel.dataSource.connector.execute(
                    "match (p:peer {username: '" + user.username + "'}), (pro:profile {id: '" + profileNode.id + "'}) merge (p)-[r:hasProfile]->(pro) return r",
                    function (err, results) {
                        if (!err) {
                            cb(err, user, results);
                        }
                        else {
                            cb(err, user, results);
                        }
                    }
                );
            }
            else {
                cb(err, user, profileNode);
            }
        });
       return cb.promise;
    };


    Peer.prototype.hasPassword = function (plain, fn) {
        fn = fn || utils.createPromiseCallback();
        if (this.password && plain) {
            bcrypt.compare(plain, this.password, function (err, isMatch) {
                if (err) return fn(err);
                fn(null, isMatch);
            });
        } else {
            fn(null, false);
        }
        return fn.promise;
    };

    /**
     * Normalize the credentials
     * @param {Object} credentials The credential object
     * @returns {Object} The normalized credential object
     */
    Peer.normalizeCredentials = function (credentials) {
        var query = {};
        credentials = credentials || {};

        if (credentials.email) {
            query.email = credentials.email;
        } else if (credentials.username) {
            query.username = credentials.username;
        }
        return query;
    };

    /*!
     * Hash the plain password
     */
    Peer.hashPassword = function (plain) {
        this.validatePassword(plain);
        var salt = bcrypt.genSaltSync(this.settings.saltWorkFactor || SALT_WORK_FACTOR);
        return bcrypt.hashSync(plain, salt);
    };

    Peer.validatePassword = function (plain) {
        var err;
        if (plain && typeof plain === 'string' && plain.length <= MAX_PASSWORD_LENGTH) {
            return true;
        }
        if (plain.length > MAX_PASSWORD_LENGTH) {
            err = new Error(g.f('Password too long: %s', plain));
            err.code = 'PASSWORD_TOO_LONG';
        } else {
            err = new Error(g.f('Invalid password: %s', plain));
            err.code = 'INVALID_PASSWORD';
        }
        err.statusCode = 422;
        throw err;
    };

    Peer._invalidateAccessTokensOfUsers = function (userIds, options, cb) {
        if (typeof options === 'function' && cb === undefined) {
            cb = options;
            options = {};
        }

        if (!Array.isArray(userIds) || !userIds.length)
            return process.nextTick(cb);


        console.log(userIds);
        /*Peer.dataSource.connector.execute(
            "match (:peer {id:'"+ctx.where.id+"'})-[:hasToken]->(token:UserToken) DETACH DELETE token",
            cb
        );*/

    };


    /*!
     * Setup an extended user model.
     */
    Peer.setup = function () {

        // We need to call the base class's setup method
        Peer.base.setup.call(this);
        var PeerModel = this;

        // max ttl
        Peer.settings.maxTTL = Peer.settings.maxTTL || DEFAULT_MAX_TTL;
        Peer.settings.ttl = Peer.settings.ttl || DEFAULT_TTL;

        PeerModel.setter.email = function (value) {
            if (!PeerModel.settings.caseSensitiveEmail) {
                this.$email = value.toLowerCase();
            } else {
                this.$email = value;
            }
        };

        PeerModel.setter.password = function (plain) {
            if (typeof plain !== 'string') {
                return;
            }
            if (plain.indexOf('$2a$') === 0 && plain.length === 60) {
                // The password is already hashed. It can be the case
                // when the instance is loaded from DB
                this.$password = plain;
            } else {
                this.$password = this.constructor.hashPassword(plain);
            }
        };

        // Make sure emailVerified is not set by creation
        PeerModel.beforeRemote('create', function (ctx, user, next) {
            var body = ctx.req.body;
            if (body && body.emailVerified) {
                body.emailVerified = false;
            }

            next();
        });

        PeerModel.afterRemote('create', function (ctx, user, next) {
            next();
        });
        /*PeerModel.remoteMethod(
            'login',
            {
                description: 'Login a user with username/email and password.',
                accepts: [
                    {arg: 'credentials', type: 'object', required: true, http: {source: 'body'}},
                    {arg: 'include', type: ['string'], http: {source: 'query'},
                        description: 'Related objects to include in the response. ' +
                        'See the description of return value for more details.'}
                ],
                returns: {
                    arg: 'accessToken', type: 'object', root: true,
                    description:
                        g.f('The response body contains properties of the {{AccessToken}} created on login.\n' +
                            'Depending on the value of `include` parameter, the body may contain ' +
                            'additional properties:\n\n' +
                            '  - `user` - `U+007BUserU+007D` - Data of the currently logged in user. ' +
                            '{{(`include=user`)}}\n\n')
                },
                http: {verb: 'post'}
            }
        );

        PeerModel.remoteMethod(
            'logout',
            {
                description: 'Logout a user with access token.',
                accepts: [
                    {arg: 'access_token', type: 'string', http: function(ctx) {
                        var req = ctx.req;
                        return req.query.access_token;
                    }, description: 'Do not supply this argument, it is automatically extracted ' +
                    'from request headers.'
                    }
                ],
                http: {verb: 'all'}
            }
        );*/


        PeerModel.remoteMethod(
            'confirm',
            {
                description: 'Confirm a user registration with email verification token.',
                accepts: [
                    { arg: 'uid', type: 'string', required: true },
                    { arg: 'token', type: 'string', required: true },
                    { arg: 'redirect', type: 'string' }
                ],
                http: { verb: 'get', path: '/confirm' }
            }
        );

        PeerModel.remoteMethod(
            'resetPassword',
            {
                description: 'Reset password for a user with email.',
                accepts: [
                    { arg: 'options', type: 'object', required: true, http: { source: 'body' } }
                ],
                http: { verb: 'post', path: '/reset' }
            }
        );

        PeerModel.afterRemote('confirm', function (ctx, inst, next) {
            if (ctx.args.redirect !== undefined) {
                if (!ctx.res) {
                    return next(new Error(g.f('The transport does not support HTTP redirects.')));
                }
                ctx.res.location(ctx.args.redirect);
                ctx.res.status(302);
            }
            next();
        });

        PeerModel.validate('email', emailValidator, {
            message: g.f('Must provide a valid email')
        });

        //PeerModel.validatesUniquenessOf('email', {message: 'Email already exists'});
        //PeerModel.validatesUniquenessOf('username', {message: 'User already exists'});

        return PeerModel;
    }

    /*!
     * Setup the base user.
     */

    Peer.setup();

    // Access token to normalize email credentials
    //noinspection JSCheckFunctionSignatures
    Peer.observe('access', function normalizeEmailCase(ctx, next) {
        if (!ctx.Model.settings.caseSensitiveEmail && ctx.query.where &&
            ctx.query.where.email && typeof (ctx.query.where.email) === 'string') {
            ctx.query.where.email = ctx.query.where.email.toLowerCase();
        }
        next();
    });

    //noinspection JSCheckFunctionSignatures
    Peer.observe('before save', function prepareForTokenInvalidation(ctx, next) {
        if (ctx.isNewInstance) return next();
        if (!ctx.where && !ctx.instance) return next();

        var pkName = ctx.Model.definition.idName() || 'id';
        var where = ctx.where;
        if (!where) {
            where = {};
            where[pkName] = ctx.instance[pkName];
        }

        ctx.Model.find({ where: where }, function (err, userInstances) {
            if (err) return next(err);
            ctx.hookState.originalUserData = userInstances.map(function (u) {
                var user = {};
                user[pkName] = u[pkName];
                user.email = u.email;
                user.password = u.password;
                return user;
            });
            var emailChanged;
            if (ctx.instance) {
                emailChanged = ctx.instance.email !== ctx.hookState.originalUserData[0].email;
                if (emailChanged && ctx.Model.settings.emailVerificationRequired) {
                    ctx.instance.emailVerified = false;
                }
            } else if (ctx.data.email) {
                emailChanged = ctx.hookState.originalUserData.some(function (data) {
                    return data.email !== ctx.data.email;
                });
                if (emailChanged && ctx.Model.settings.emailVerificationRequired) {
                    ctx.data.emailVerified = false;
                }
            }

            next();
        });
    });

    //noinspection JSCheckFunctionSignatures
    Peer.observe('after save', function invalidateOtherTokens(ctx, next) {
        if (!ctx.instance && !ctx.data) return next();
        if (!ctx.hookState.originalUserData) return next();

        var pkName = ctx.Model.definition.idName() || 'id';
        var newEmail = (ctx.instance || ctx.data).email;
        var newPassword = (ctx.instance || ctx.data).password;

        if (!newEmail && !newPassword) return next();

        var userIdsToExpire = ctx.hookState.originalUserData.filter(function (u) {
            return (newEmail && u.email !== newEmail) ||
                (newPassword && u.password !== newPassword);
        }).map(function (u) {
            return u[pkName];
        });
        ctx.Model._invalidateAccessTokensOfUsers(userIdsToExpire, ctx.options, next);
    });


    function emailValidator(err, done) {
        var value = this.email;
        if (value === null)
            return;
        if (typeof value !== 'string')
            return err('string');
        if (value === '') return;
        if (!isEmail(value))
            return err('email');
    }

};
