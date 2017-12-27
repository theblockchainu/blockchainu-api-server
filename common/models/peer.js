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
var uuid = require("uuid");
var MAX_PASSWORD_LENGTH = 72;
var debug = require('debug')('loopback:peer');
var moment = require('moment');
var momenttz = require('moment-timezone');
var passcode = require("passcode");
var twilio = require('twilio');
var app = require('../../server/server');
var twilioSid = app.get('twilioSID');
var twilioToken = app.get('twilioToken');
var twilioPhone = app.get('twilioPhone');

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
                            /*err = new Error(g.f('login failed as the email has not been verified'));
                            err.statusCode = 401;
                            err.code = 'LOGIN_FAILED_EMAIL_NOT_VERIFIED';
                            fn(err);*/
                            if (peer.createAccessToken.length === 2) {
                                peer.createAccessToken(peer, credentials.ttl, tokenHandler);
                            } else {
                                peer.createAccessToken(peer, credentials.ttl, credentials, tokenHandler);
                            }
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
     * @param req
     * @param res
     * @param fn
     * @callback {Function} callback
     * @promise
     */
    Peer.confirm = function (uid, token, redirect, req, res, fn) {
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
                            if (redirect !== undefined) {
                                if (!res) {
                                    fn(new Error(g.f('The transport does not support HTTP redirects.')));
                                }
                                fn(null, { result: "success" });
                            }
                            else {
                                fn(new Error(g.f('Redirect is not defined.')));
                            }
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
    };


    /**
     * Send verification email to user's Email ID
     *
     * @param uid
     * @param fn
     * @callback {Function} callback
     * @promise
     */
    Peer.sendVerifyEmail = function (uid, email, fn) {
        fn = fn || utils.createPromiseCallback();
        this.findById(uid, function (err, user) {
            if (err) {
                fn(err);
            } else {
                if (user) {
                    // Generate new verificationToken
                    var verificationToken = passcode.hotp({
                        secret: "0C6&7vvvv",
                        counter: Date.now()
                    });
                    // Send token in email to user.
                    var message = { otp: verificationToken };
                    var renderer = loopback.template(path.resolve(__dirname, '../../server/views/verifyEmailAddress.ejs'));
                    var html_body = renderer(message);
                    loopback.Email.send({
                        to: email,
                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                        subject: 'Verify your email with peerbuds',
                        html: html_body
                    })
                        .then(function (response) {
                            console.log('email sent! - ' + response);
                        })
                        .catch(function (err) {
                            console.log('email error! - ' + err);
                        });
                    user.verificationToken = verificationToken;
                    user.emailVerified = false;
                    user.save(function (err) {
                        if (err) {
                            fn(err);
                        } else {
                            fn(null, user);
                        }
                    });
                } else {
                    err = new Error(g.f('User not found: %s', uid));
                    err.statusCode = 404;
                    err.code = 'USER_NOT_FOUND';
                    fn(err);
                }
            }
        });
        return fn.promise;
    };

    Peer.confirmSmsOTP = function (req, token, fn) {

        var loggedinPeer = Peer.getCookieUserId(req);

        //if user is logged in
        if (loggedinPeer) {
            this.findById(loggedinPeer, function (err, user) {
                if (err) {
                    fn(err);
                } else {
                    if (user && user.phoneVerificationToken === token) {
                        user.phoneVerificationToken = null;
                        user.phoneVerified = true;
                        user.save(function (err) {
                            if (err) {
                                fn(err);
                            } else {
                                fn(null, user);
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
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            fn(err);
        }
    };


    /**
     * Send verification sms to user's phone
     *
     * @param req
     * @param phone
     * @param fn
     * @callback {Function} callback
     * @promise
     */
    Peer.sendVerifySms = function (req, phone, fn) {

        fn = fn || utils.createPromiseCallback();
        var loggedinPeer = Peer.getCookieUserId(req);
        var formattedPhone = phone.replace(/[^\d]/g, '');
        formattedPhone = '+91' + formattedPhone;
        //if user is logged in
        if (loggedinPeer) {
            // Generate new hex token for sms
            var phoneToken = crypto.randomBytes(Math.ceil(2))
                .toString('hex') // convert to hexadecimal format
                .slice(0, 4);   // return required number of characters

            var client = new twilio(twilioSid, twilioToken);

            var message = "Verify your phone with peerbuds using OTP: " + phoneToken;

            client.messages.create({
                body: message,
                to: formattedPhone,  // Text this number
                from: twilioPhone // From a valid Twilio number
            }, function (err, message) {
                if (err) {
                    console.error(err);
                    fn(err);
                }
                else {
                    console.log(message);
                    var User = app.models.peer;
                    User.findById(loggedinPeer, function (err, peerInstance) {
                        if (err) {
                            cb(err);
                        } else {
                            peerInstance.phoneVerificationToken = phoneToken;
                            peerInstance.phoneVerified = false;
                            User.upsert(peerInstance, function (err, modifiedPeerInstance) {
                                if (err) {
                                    fn(err);
                                }
                                else {
                                    fn(null, { result: 'OTP SMS sent' });
                                }
                            });
                        }
                    });
                }
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            fn(err);
        }
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
        if (options.email && options.password && options.verificationToken) {
            console.log('resetting password ');
            try {
                options.password = this.hashPassword(options.password);
            } catch (err) {
                cb(err);
            }
            console.log('Finding Model with email' + options.email);
            this.findOne({
                where: {
                    email: options.email
                }
            }, (err, user) => {
                if (user) {
                    console.log('User Found!');
                    if (options.verificationToken === user.verificationToken) {
                        var diff = moment().diff(moment.unix(user.verificationTokenTime), 'minutes');
                        if (diff > 10) {
                            err = new Error(g.f('Token Expired'));
                            err.statusCode = 400;
                            err.code = 'TOKEN_EXPIRED';
                            cb(err);
                        } else {
                            console.log('Verification Successful');
                            user.updateAttributes({
                                "password": options.password,
                                "verificationToken": '',
                                "verificationTokenTime": ''
                            });
                            cb(null, {
                                'message': 'Password changed',
                                'success': true
                            });
                        }
                    } else {
                        err = new Error(g.f('Invalid Token'));
                        err.statusCode = 400;
                        err.code = 'INVALID_TOKEN';
                        cb(err);
                    }

                } else {
                    err = new Error(g.f('User not found'));
                    err.statusCode = 404;
                    err.code = 'EMAIL_NOT_FOUND';
                    cb(err);
                }
            });
        } else {
            var err = new Error(g.f('Invalid Data'));
            err.statusCode = 400;
            err.code = 'INVALID_DATA';
            cb(err);
        }

    };

    Peer.changePassword = function (options, cb) {
        cb = cb || utils.createPromiseCallback();
        if (options.userId && options.oldPassword && options.newPassword) {
            console.log('resetting password ');
            try {
                options.newPassword = this.hashPassword(options.newPassword);
                options.oldPassword = this.hashPassword(options.oldPassword);
            } catch (err) {
                cb(err);
            }
            console.log('Finding Model with userId' + options.userId);
            this.findOne({
                where: {
                    id: options.userId
                }
            }, (err, user) => {
                if (user) {
                    console.log('User Found!');
                    if (options.oldPasword === user.password) {
                        console.log('Verification Successful');
                        user.updateAttributes({
                            "password": options.newPassword,
                            "verificationToken": '',
                            "verificationTokenTime": ''
                        });
                        cb(null, {
                            'message': 'Password changed',
                            'success': true
                        });
                    } else {
                        err = new Error(g.f('Invalid password'));
                        err.statusCode = 400;
                        err.code = 'INVALID_PASSWORD';
                        cb(err);
                    }

                } else {
                    err = new Error(g.f('User not found'));
                    err.statusCode = 404;
                    err.code = 'USER_NOT_FOUND';
                    cb(err);
                }
            });
        } else {
            var err = new Error(g.f('Invalid Data'));
            err.statusCode = 400;
            err.code = 'INVALID_DATA';
            cb(err);
        }

    };

    Peer.forgotPassword = function (req, email, cb) {
        cb = cb || utils.createPromiseCallback();
        this.findOne({ where: { email: email } }, function (err, user) {
            if (user) {
                // Generate new verificationToken
                var verificationToken = passcode.hotp({
                    secret: "0C6&7vvvv",
                    counter: Date.now()
                });
                user.verificationToken = verificationToken;
                user.verificationTokenTime = moment().unix();
                user.save((err, result) => {
                    if (err) {
                        cb(err);
                    } else {
                        // Send token in email to user.
                        var resetLink = req.headers.origin + '/reset?email=' + email + '&code=' + verificationToken ;
                        var message = { resetLink: resetLink };
                        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/forgotPasswordEmail.ejs'));
                        var html_body = renderer(message);
                        loopback.Email.send({
                            to: email,
                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                            subject: 'Peerbuds - Account recovery',
                            html: html_body
                        }).then(function (response) {
                            cb(null, { email: email, sent: true });
                        }).catch(function (err) {
                            cb(err);
                        });
                    }
                });
            } else {
                err = new Error(g.f('User not found'));
                err.statusCode = 404;
                err.code = 'USER_NOT_FOUND';
                cb(err);
            }

        });
    };

    Peer.userCalendar = function (id, cb) {
        var Calendar = Peer.app.models.Calendar;
        var Schedule = Peer.app.models.Schedule;
        var userCalendarData = [];
        Peer.findById(id, { "include": [{ collections: [{ contents: "schedules" }, "calendars"] }, { ownedCollections: [{ contents: "schedules" }, "calendars"] }] }, (err, peerInstance) => {
            if (err) {
                cb(err);
            } else {
                peerInstance = peerInstance.toJSON();
                var collections = peerInstance.collections;
                var ownedCollections = peerInstance.ownedCollections;
                var collectionDate;
                collections.forEach((collectionItem) => {
                    collectionItem.calendars.forEach((collectionDate) => {
                        if (collectionDate.startDate && collectionDate.endDate) {
                            var contents = collectionItem.contents;
                            if (contents) {
                                contents.forEach((contentItem) => {
                                    var schedules = contentItem.schedules;
                                    var scheduleData = schedules[0];
                                    if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
                                        var startDate = moment(collectionDate.startDate).add(scheduleData.startDay, 'days');
                                        var endDate = moment(startDate).add(scheduleData.endDay, 'days');
                                        if (scheduleData.startTime && scheduleData.endTime) {
                                            startDate.hours(scheduleData.startTime.split('T')[1].split(':')[0]);
                                            startDate.minutes(scheduleData.startTime.split('T')[1].split(':')[1]);
                                            startDate.seconds('00');
                                            endDate.hours(scheduleData.endTime.split('T')[1].split(':')[0]);
                                            endDate.minutes(scheduleData.endTime.split('T')[1].split(':')[1]);
                                            endDate.seconds('00');
                                            var calendarData = {
                                                "collectionType": collectionItem.type,
                                                "collectionName": collectionItem.title,
                                                "collectionId": collectionItem.id,
                                                "contentType": contentItem.type,
                                                "contentName": contentItem.title,
                                                "contentId": contentItem.id,
                                                "startDateTime": startDate,
                                                "endDateTime": endDate
                                            };
                                            userCalendarData.push(calendarData);
                                        } else {
                                            console.log("Time Unavailable !");
                                        }
                                    } else {
                                        console.log("Schedule Days Unavailable");
                                    }
                                });
                            } else {
                                console.log('No Contents');
                            }
                        } else {
                            console.log("Collection Calendar Not Set");
                        }
                    });

                });

                ownedCollections.forEach((collectionItem) => {
                    if (collectionItem.calendars !== undefined) {
                        collectionItem.calendars.forEach((collectionDate) => {
                            if (collectionDate.startDate && collectionDate.endDate) {
                                var contents = collectionItem.contents;
                                if (contents) {
                                    contents.forEach((contentItem) => {
                                        var schedules = contentItem.schedules;
                                        var scheduleData = schedules[0];
                                        if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
                                            var startDate = momenttz.tz(collectionDate.startDate, 'UTC');
                                            startDate = startDate.add(scheduleData.startDay, 'days');
                                            var endDate = momenttz.tz(startDate, 'UTC');
                                            endDate = endDate.add(scheduleData.endDay, 'days');
                                            if (scheduleData.startTime && scheduleData.endTime) {
                                                startDate.hours(scheduleData.startTime.split('T')[1].split(':')[0]);
                                                startDate.minutes(scheduleData.startTime.split('T')[1].split(':')[1]);
                                                startDate.seconds('00');
                                                endDate.hours(scheduleData.endTime.split('T')[1].split(':')[0]);
                                                endDate.minutes(scheduleData.endTime.split('T')[1].split(':')[1]);
                                                endDate.seconds('00');
                                                var calendarData = {
                                                    "collectionType": collectionItem.type,
                                                    "collectionName": collectionItem.title,
                                                    "collectionId": collectionItem.id,
                                                    "contentType": contentItem.type,
                                                    "contentName": contentItem.title,
                                                    "contentId": contentItem.id,
                                                    "startDateTime": startDate,
                                                    "endDateTime": endDate
                                                };
                                                userCalendarData.push(calendarData);
                                            } else {
                                                console.log("Time Unavailable !");
                                            }
                                        } else {
                                            console.log("Schedule Days Unavailable");
                                        }
                                    });
                                } else {
                                    console.log('Contents Not Found');
                                }


                            } else {
                                console.log("Collection Calendar Not Set");
                            }
                        });

                    }
                    else {
                        console.log("This collection does not have any calendar.");
                    }
                });

                cb(null, userCalendarData);
            }
        });
    };

    Peer.approve = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null) {
                var userId = peerInstance.toJSON().id;
                peerInstance.accountVerified = true;
                Peer.upsertWithWhere({ id: peerInstance.id }, peerInstance, function (err, newpeerInstance) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating Peer.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        var message = {};
                        var subject = 'Account approved';

                        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/accountApproved.ejs'));
                        var html_body = renderer(message);

                        // Send notification to peer
                        peerInstance.__create__notifications({
                            type: "action",
                            title: "Account approved!",
                            description: "Your peerbuds account has been approved. Add more details now.",
                            actionUrl: ['console', 'profile', 'edit']
                        }, function (err, notificationInstance) {
                            if (err) {
                                cb(err);
                            }
                            else {
                                notificationInstance.actor.add(peerInstance.id, function (err, actorInstance) {
                                    if (err) {
                                        cb(err);
                                    }
                                    else {
                                        loopback.Email.send({
                                            to: peerInstance.email,
                                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                            subject: subject,
                                            html: html_body
                                        })
                                            .then(function (response) {
                                                console.log('email sent! - ' + response);
                                            })
                                            .catch(function (err) {
                                                console.log('email error! - ' + err);
                                            });
                                        cb(null, { result: 'Account approved. Email sent to Owner.' });
                                    }
                                });
                            }
                        });
                    }
                });
            }
            else {
                err = new Error(g.f('Invalid Peer with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_PEER';
                cb(err);
            }

        });
    };

    Peer.reject = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null) {
                var userId = peerInstance.toJSON().id;
                peerInstance.accountVerified = false;
                Peer.upsertWithWhere({ id: peerInstance.id }, peerInstance, function (err, newpeerInstance) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating Peer.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        var message = {};
                        var subject = 'Account rejected';

                        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/accountRejected.ejs'));
                        var html_body = renderer(message);

                        // Send notification to peer
                        peerInstance.__create__notifications({
                            type: "action",
                            title: "Account approved!",
                            description: "Your peerbuds account was rejected. Edit your details and re-submit.",
                            actionUrl: ['console', 'profile', 'verification']
                        }, function (err, notificationInstance) {
                            if (err) {
                                cb(err);
                            }
                            else {
                                notificationInstance.actor.add(peerInstance.id, function (err, actorInstance) {
                                    if (err) {
                                        cb(err);
                                    }
                                    else {
                                        loopback.Email.send({
                                            to: peerInstance.email,
                                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                            subject: subject,
                                            html: html_body
                                        })
                                            .then(function (response) {
                                                console.log('email sent! - ' + response);
                                            })
                                            .catch(function (err) {
                                                console.log('email error! - ' + err);
                                            });
                                        cb(null, { result: 'Account rejected. Email sent to Owner.' });
                                    }
                                });
                            }
                        });
                    }
                });
            }
            else {
                err = new Error(g.f('Invalid Peer with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_PEER';
                cb(err);
            }

        });
    };


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
                    "match (p:peer {email: '" + peer.email + "'}) create (p)-[r:hasToken]->(token:UserToken {id: '" + guid + "', ttl: '" + ttl + "'}) return token",
                    cb
                );
            }
        });

        return cb.promise;
    };

    Peer.prototype.createProfile = function (profileModel, profileObject, user, cb) {
        if (cb === undefined && typeof options === 'function') {
            // createAccessToken(ttl, cb)
            cb = options;
            options = undefined;
        }
        cb = cb || utils.createPromiseCallback();
        //console.log(user.Id);

        profileModel.create(profileObject, function (err, profileNode) {
            if (!err && profileNode) {
                if (profileNode.isNewInstance)
                    console.log("Created new user entry");

                profileModel.dataSource.connector.execute(
                    "match (p:peer {email: '" + user.email + "'}), (pro:profile {id: '" + profileNode.id + "'}) merge (p)-[r:peer_has_profile {id: '" + uuid.v4() + "', sourceId: p.id, targetId: pro.id}]->(pro) return r",
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

    Peer.prototype.updateProfileNode = function (profileModel, profileObject, user, cb) {
        Peer.findById(user.id, function (err, modelInstance) {
            if (err) {
                cb(err);
            } else {
                console.log(modelInstance);
                if (modelInstance) {
                    modelInstance.profiles((err, instances) => {
                        if (err) {
                            cb(err);
                        } else {
                            if (instances[0]) {
                                var objId = instances[0].id;
                                Peer.app.models.profile.upsertWithWhere({ "id": objId }, profileObject, function (err, updatedInstance) {
                                    if (err) {
                                        cb(err)
                                    }
                                    else {
                                        cb(null, user, updatedInstance)
                                    }
                                });
                            } else {
                                console.log("not Added");
                                cb();
                            }
                        }
                    });
                } else {
                    console.log("Not Found");
                    cb();
                }

            }

        });
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
        try {
            this.validatePassword(plain);
        } catch (err) {
            return err;
        }
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


    Peer.getCookieUserId = function (req) {

        var cookieArray = req.headers.cookie.split(';');
        var cookie = '';
        for (var i = 0; i < cookieArray.length; i++) {
            if (cookieArray[i].split('=')[0].trim() === 'userId') {
                cookie = cookieArray[i].split('=')[1].trim();
            }
        }
        return cookie.split(/[ \:.]+/)[0].substring(4);
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

        PeerModel.afterRemote('prototype.__create__joinedrooms', function (ctx, newRoomInstance, next) {
            console.log("PeerModel create");
            var room = app.models.room;
            room.createTwilioRoom(newRoomInstance, function (err, data) {
                console.log("Room : " + JSON.stringify(data));
            });
            next();
        });

        PeerModel.remoteMethod(
            'confirm',
            {
                description: 'Confirm a user registration with email verification token.',
                accepts: [
                    { arg: 'uid', type: 'string', required: true },
                    { arg: 'token', type: 'string', required: true },
                    { arg: 'redirect', type: 'string' },
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'res', type: 'object', http: { source: 'res' } }
                ],
                http: { verb: 'post', path: '/confirmEmail' }
            }
        );

        PeerModel.remoteMethod(
            'sendVerifyEmail',
            {
                description: 'Send a Verification email to user email ID with OTP and link',
                accepts: [{ arg: 'uid', type: 'string', required: true }, { arg: 'email', type: 'string', required: true }],
                returns: { arg: 'result', type: 'object', root: true },
                http: { verb: 'post', path: '/sendVerifyEmail' }
            }
        );

        PeerModel.remoteMethod(
            'confirmSmsOTP',
            {
                description: 'Confirm a user registration with sms verification token.',
                accepts: [
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'token', type: 'string', required: true }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { verb: 'post', path: '/confirmSmsOTP' }
            }
        );

        PeerModel.remoteMethod(
            'sendVerifySms',
            {
                description: 'Send a Verification SMS to user phone with OTP',
                accepts: [
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'phone', type: 'string', required: true }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { verb: 'post', path: '/sendVerifySms' }
            }
        );

        PeerModel.remoteMethod(
            'resetPassword',
            {
                description: 'Reset password for a user with email.',
                accepts: [
                    { arg: 'options', type: 'object', required: true, http: { source: 'body' } }
                ],
                returns: { arg: 'response', type: 'object', root: true },
                http: { verb: 'post', path: '/resetPassword' }
            }
        );

        PeerModel.remoteMethod(
            'changePassword',
            {
                description: 'Change password for a user with userId and oldPassword.',
                accepts: [
                    { arg: 'options', type: 'object', required: true, http: { source: 'body' } }
                ],
                returns: { arg: 'response', type: 'object', root: true },
                http: { verb: 'post', path: '/changePassword' }
            }
        );

        PeerModel.remoteMethod(
            'forgotPassword',
            {
                description: 'Forgot password for a user with email.',
                accepts: [
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'email', type: 'string', required: true }
                ],
                returns: { arg: 'response', type: 'object', root: true },
                http: { verb: 'post', path: '/forgotPassword' }
            }
        );

        PeerModel.remoteMethod(
            'userCalendar',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true }
                ],
                returns: { arg: 'calendarObject', type: 'object', root: true },
                http: { path: '/:id/eventCalendar', verb: 'get' }
            }
        );

        PeerModel.remoteMethod(
            'approve',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/approve', verb: 'post' }
            }
        );

        PeerModel.remoteMethod(
            'reject',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/reject', verb: 'post' }
            }
        );

        PeerModel.validate('email', emailValidator, {
            message: g.f('Must provide a valid email')
        });

        return PeerModel;
    };

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
        if (!isEmail.validate(value))
            return err('email');
    }

};
