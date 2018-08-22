'use strict';
let utils = require('../../node_modules/loopback/lib/utils');
let g = require('../../node_modules/loopback/lib/globalize');
let isEmail = require('isemail');
let bcrypt;
let uid = require('uid2');
let DEFAULT_TOKEN_LEN = 64;
let DEFAULT_TTL = 1209600; // 2 weeks in seconds
let DEFAULT_MAX_TTL = 31556926; // 1 year in seconds
let assert = require('assert');
let loopback = require('../../node_modules/loopback/lib/loopback');
let path = require('path');
let qs = require('querystring');
let SALT_WORK_FACTOR = 10;
let crypto = require('crypto');
let uuid = require("uuid");
let MAX_PASSWORD_LENGTH = 72;
let debug = require('debug')('loopback:peer');
let moment = require('moment');
let momenttz = require('moment-timezone');
let passcode = require("passcode");
let twilio = require('twilio');
let app = require('../../server/server');
let twilioSid = app.get('twilioSID');
let twilioToken = app.get('twilioToken');
let twilioPhone = app.get('twilioPhone');
let protocolUrl = app.get('protocolUrl');
let request = require('request');

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
        let self = this;
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

        let query = self.normalizeCredentials(credentials);

        if (!query.email && !query.username) {
            let err2 = new Error(g.f('{{username}} or {{email}} is required'));
            err2.statusCode = 400;
            err2.code = 'USERNAME_EMAIL_REQUIRED';
            fn(err2);
            return fn.promise;
        }

        self.findOne({ where: query }, function (err, peer) {

            let defaultError = new Error(g.f('login failed'));
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
                        let incorrectPasswordError = new Error(g.f('incorrect password'));
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

        let err;
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
                    user.save()
                        .then(function (userInstance) {
                            console.log(userInstance);
                            if (redirect !== undefined) {
                                if (!res) {
                                    fn(new Error(g.f('The transport does not support HTTP redirects.')));
                                }
                            }
                            else {
                                fn(new Error(g.f('Redirect is not defined.')));
                            }
                        })
                        .catch(function (err) {
                            fn(err);
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
	 * @param email
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
                    let verificationToken = passcode.hotp({
                        secret: "0C6&7vvvv",
                        counter: Date.now()
                    });
                    // Send token in email to user.
                    let message = { otp: verificationToken };
                    let renderer = loopback.template(path.resolve(__dirname, '../../server/views/verifyEmailAddress.ejs'));
                    let html_body = renderer(message);
                    console.log(verificationToken);
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

        let loggedinPeer = Peer.getCookieUserId(req);

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
            let err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            fn(err);
        }
    };


	/**
	 * Send verification sms to user's phone
	 *
	 * @param req
	 * @param phone
	 * @param countryCode
	 * @param fn
	 * @callback {Function} callback
	 * @promise
	 */
    Peer.sendVerifySms = function (req, phone, countryCode, fn) {

        fn = fn || utils.createPromiseCallback();
        let loggedinPeer = Peer.getCookieUserId(req);
        let formattedPhone = phone.replace(/[^\d]/g, '');
        let sanitizedPhone = formattedPhone;
        formattedPhone = '+' + countryCode + formattedPhone;
        //if user is logged in
        if (loggedinPeer) {

            let phoneNumber = app.models.phone;
            phoneNumber.find({ 'where': { 'and': [{ 'country_code': countryCode }, { 'subscriber_number': sanitizedPhone }] }, 'include': { 'profilePhoneNumber': 'peer' } }, function (err, phoneNumberInstances) {
                if (err) {
                    fn(err);
                } else if ((phoneNumberInstances && phoneNumberInstances.length > 0) && (phone !== '7021517299' && phone !== 7021517299)) {
                    let belongsToUser = false;
                    phoneNumberInstances.forEach(phoneNumberInstance => {
                        if (phoneNumberInstance.toJSON().profilePhoneNumber !== undefined && phoneNumberInstance.toJSON().profilePhoneNumber.length > 0 && phoneNumberInstance.toJSON().profilePhoneNumber[0].peer !== undefined && phoneNumberInstance.toJSON().profilePhoneNumber[0].peer[0].id === loggedinPeer) {
                            belongsToUser = true;
                        }
                    });
                    if (!belongsToUser) {
                        let errResult = new Error(g.f('This number is already associated with another peerbuds account.'));
                        errResult.statusCode = 400;
                        errResult.code = 'DUPLICATE NUMBER';
                        fn(errResult);
                    } else {
                        sendPhoneVerificationCodeSms(loggedinPeer, phone, countryCode, fn);
                    }
                } else {
                    sendPhoneVerificationCodeSms(loggedinPeer, phone, countryCode, fn);
                }
            });
        } else {
            let err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            fn(err);
        }
        return fn.promise;
    };

    Peer.generateKnowledgeStory = function (id, data, cb) {

        let knowledgeStory = {
            first_name: "",
            last_name: "",
            story_title: "",
            story_description: "",
            topics: [
                {
                    id: "string",
                    name: "string",
                    type: "string",
                    imageUrl: "string",
                    createdAt: "2018-05-15T10:32:38.882Z",
                    updatedAt: "2018-05-15T10:32:38.882Z"
                }
            ],
            story: [
                {
                    identifier: "string",
                    activity_type: "string",
                    activity_title: "string",
                    activity_description: "string",
                    activity_url: "string",
                    gyan_acquired: 0,
                    id: "string"
                }
            ]
        };

		/*
		get data from blockchain here
		*/

        cb(null, knowledgeStory);
    };

    let sendPhoneVerificationCodeSms = function (loggedinPeer, phone, countryCode, fn) {
        let formattedPhone = phone.replace(/[^\d]/g, '');
        formattedPhone = '+' + countryCode + formattedPhone;
        // Generate new token for sms
        let phoneToken = passcode.hotp({
            secret: "0C6&7vvvv",
            counter: Date.now()
        });

        let client = new twilio(twilioSid, twilioToken);

        let message = "Verify your mobile number with peerbuds using code: " + phoneToken;

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
                //console.log(message);
                let User = app.models.peer;
                User.findById(loggedinPeer, { 'include': 'profiles' }, function (err, peerInstance) {
                    if (err) {
                        fn(err);
                    } else {
                        Peer.app.models.profile.findById(peerInstance.toJSON().profiles[0].id, {}, function (err, profileInstance) {
                            if (err) {
                                fn(err);
                            } else {
                                let phoneNumber = {
                                    country_code: countryCode,
                                    subscriber_number: phone,
                                    isPrimary: true
                                };
                                profileInstance.__delete__phone_numbers({}, { 'where': { 'isPrimary': true } }, function (err, deletedNumbers) {
                                    if (err) {
                                        fn(err);
                                    } else {
                                        profileInstance.__create__phone_numbers(phoneNumber, function (err, phoneNumberInstance) {
                                            if (err) {
                                                fn(err);
                                            } else {
                                                console.log('Added new phone number');
                                                delete peerInstance.toJSON().profiles;
                                                peerInstance.phoneVerificationToken = phoneToken;
                                                peerInstance.phoneVerified = false;
                                                console.log(peerInstance);
                                                User.upsert(peerInstance.toJSON(), function (err, modifiedPeerInstance) {
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
                            }
                        });
                    }
                });
            }
        });
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
                        let diff = moment().diff(moment.unix(user.verificationTokenTime), 'minutes');
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
            let err = new Error(g.f('Invalid Data'));
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
            let err = new Error(g.f('Invalid Data'));
            err.statusCode = 400;
            err.code = 'INVALID_DATA';
            cb(err);
        }

    };

    Peer.setPassword = function (options, cb) {
        cb = cb || utils.createPromiseCallback();
        if (options.userId && options.newPassword) {
            console.log('setting password ');
            try {
                this.validatePassword(options.newPassword);
                options.newPassword = this.hashPassword(options.newPassword);
            } catch (err) {
                cb(err);
            }
            console.log('Finding Model with userId' + options.userId);
            this.findOne({
                where: {
                    id: options.userId
                },
                include: 'profiles'
            }, (err, userInstance) => {
                let user = userInstance.toJSON();
                if (user) {
                    console.log('User Found!');
                    userInstance.updateAttributes({
                        "password": options.newPassword,
                        "verificationToken": '',
                        "verificationTokenTime": ''
                    });
                    let stripeTransaction = app.models.transaction;
                    let stripeResponse = '';
                    let profileObject = user.profiles[0];
                    stripeTransaction.createCustomer(user, (err, data) => {
                        stripeResponse = data;
                        console.log("NEW USER ACCOUNT CREATED");
                        let message = { username: profileObject.first_name };
                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/welcomeSignupStudent.ejs'));
                        let html_body = renderer(message);
                        loopback.Email.send({
                            to: user.email,
                            from: 'Sahil & Aakash <noreply@mx.peerbuds.com>',
                            subject: 'Welcome to peerbuds - thanks for signing up!',
                            html: html_body
                        })
                            .then(function (response) {
                                console.log('email sent! - ' + response);
                            })
                            .catch(function (err) {
                                console.log('email error! - ' + err);
                            });
                    });

                    // Create wallet on blockchain
                    console.log('Creating wallet');
                    request.post({
                        url: app.get('protocolUrl') + 'peers',
                        body: {
                            password: options.newPassword
                        },
                        json: true
                    }, (err, response, data) => {
                        if (err) {
                            console.error(err);
                        } else {
                            Peer.dataSource.connector.execute(
                                "MATCH (p:peer {email: '" + user.email + "'}) SET p.ethAddress = '" + data + "'",
                                (err, results) => {
                                    console.log('Created ethereum wallet and saved address in DB');
                                }
                            );
                            // Send welcome email to user
                            let message = {
                                userName: profileObject.first_name + ' ' + profileObject.last_name,
                                userEmail: user.email,
                                dobMonth: profileObject.dobMonth,
                                dobDay: profileObject.dobDay,
                                dobYear: profileObject.dobYear,
                                stripeId: stripeResponse,
                                ethWalletId: data
                            };
                            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newSignupAdmin.ejs'));
                            let html_body = renderer(message);
                            loopback.Email.send({
                                to: 'aakash@peerbuds.com',
                                from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                subject: 'New user signup!',
                                html: html_body
                            })
                                .then(function (response) {
                                    console.log('email sent! - ' + response);
                                })
                                .catch(function (err) {
                                    console.log('email error! - ' + err);
                                });

                            // Add peer to scholarship

                            Peer.app.models.scholarship.find(
                                {
                                    'where': {
                                        'type': 'public'
                                    }
                                }
                            ).then(function (scholarshipInstances) {
                                scholarshipInstances.forEach(function (scholarship) {
                                    scholarship.__link__peers_joined(user.id, function (err, linkedPeerInstance) {
                                        if (data && data > 0) {
                                            request
                                                .put({
                                                    url: app.get('protocolUrl') + 'scholarships/' + scholarship.id + '/peers/rel/' + data,
                                                    json: true
                                                }, function (err, response, result) {
                                                    if (err) {
                                                        console.error(err);
                                                    } else {
                                                        console.log('Added participant to scholarship on blockchain: ' + result);
                                                    }
                                                });
                                        }
                                    });
                                });
                                return Promise.all(scholarshipInstances);
                            })
                                .then(function (scholarshipRelationInstances) {
                                    if (scholarshipRelationInstances && scholarshipRelationInstances.length > 0) {
                                        // Send token in email to user.
                                        const message = {};
                                        const renderer = loopback.template(path.resolve(__dirname, '../../server/views/welcomeGlobalScholarship.ejs'));
                                        const html_body = renderer(message);
                                        loopback.Email.send({
                                            to: user.email,
                                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                            subject: 'Peerbuds Global Scholarship',
                                            html: html_body
                                        })
                                            .then(function (response) {
                                                console.log('email sent! - ' + response);
                                            })
                                            .catch(function (err) {
                                                console.log('email error! - ' + err);
                                            });
                                    }
                                }).catch(function (err) {
                                    console.log('Error in joining sholarship');
                                    console.log(err);

                                });
                        }
                    });
                    cb(null, {
                        'message': 'Password changed',
                        'success': true
                    });
                } else {
                    err = new Error(g.f('User not found'));
                    err.statusCode = 404;
                    err.code = 'USER_NOT_FOUND';
                    cb(err);
                }
            });
        } else {
            let err = new Error(g.f('Invalid Data'));
            err.statusCode = 400;
            err.code = 'INVALID_DATA';
            cb(err);
        }

    };
    Peer.forgotPassword = function (req, body, cb) {
        cb = cb || utils.createPromiseCallback();
        this.findOne({ where: { email: body.email } }, function (err, user) {
            if (user) {
                // Generate new verificationToken
                let verificationToken = passcode.hotp({
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
                        let resetLink = req.headers.origin + '/reset?email=' + body.email + '&code=' + verificationToken;
                        let message = { resetLink: resetLink };
                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/forgotPasswordEmail.ejs'));
                        let html_body = renderer(message);
                        loopback.Email.send({
                            to: body.email,
                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                            subject: 'Peerbuds - Account recovery',
                            html: html_body
                        }).then(function (response) {
                            cb(null, { email: body.email, sent: true });
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
        let Calendar = Peer.app.models.Calendar;
        let Schedule = Peer.app.models.Schedule;
        let userCalendarData = [];
        Peer.findById(id, { "include": [{ collections: [{ contents: "schedules" }, "calendars"] }, { ownedCollections: [{ contents: "schedules" }, "calendars"] }] }, (err, peerInstance) => {
            if (err) {
                cb(err);
            } else {
                peerInstance = peerInstance.toJSON();
                let collections = peerInstance.collections;
                let ownedCollections = peerInstance.ownedCollections;
                let collectionDate;
                collections.forEach((collectionItem) => {
                    collectionItem.calendars.forEach((collectionDate) => {
                        if (collectionDate.startDate && collectionDate.endDate) {
                            let contents = collectionItem.contents;
                            if (contents) {
                                contents.forEach((contentItem) => {
                                    let schedules = contentItem.schedules;
                                    let scheduleData = schedules[0];
                                    if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
                                        let startDate = moment(collectionDate.startDate).add(scheduleData.startDay, 'days');
                                        let endDate = moment(startDate).add(scheduleData.endDay, 'days');
                                        if (scheduleData.startTime && scheduleData.endTime) {
                                            startDate.hours(scheduleData.startTime.split('T')[1].split(':')[0]);
                                            startDate.minutes(scheduleData.startTime.split('T')[1].split(':')[1]);
                                            startDate.seconds('00');
                                            endDate.hours(scheduleData.endTime.split('T')[1].split(':')[0]);
                                            endDate.minutes(scheduleData.endTime.split('T')[1].split(':')[1]);
                                            endDate.seconds('00');
                                            let calendarData = {
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
                                let contents = collectionItem.contents;
                                if (contents) {
                                    contents.forEach((contentItem) => {
                                        let schedules = contentItem.schedules;
                                        let scheduleData = schedules[0];
                                        if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
                                            let startDate = momenttz.tz(collectionDate.startDate, 'UTC');
                                            startDate = startDate.add(scheduleData.startDay, 'days');
                                            let endDate = momenttz.tz(startDate, 'UTC');
                                            endDate = endDate.add(scheduleData.endDay, 'days');
                                            if (scheduleData.startTime && scheduleData.endTime) {
                                                startDate.hours(scheduleData.startTime.split('T')[1].split(':')[0]);
                                                startDate.minutes(scheduleData.startTime.split('T')[1].split(':')[1]);
                                                startDate.seconds('00');
                                                endDate.hours(scheduleData.endTime.split('T')[1].split(':')[0]);
                                                endDate.minutes(scheduleData.endTime.split('T')[1].split(':')[1]);
                                                endDate.seconds('00');
                                                let calendarData = {
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
        Peer.findById(id, { "include": ["socketconnections"] }, function (err, peerInstance) {
            if (!err && peerInstance !== null) {
                let userId = peerInstance.toJSON().id;
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
                        let message = {};
                        let subject = 'Account approved';

                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/accountApproved.ejs'));
                        let html_body = renderer(message);

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
                                        // send out a socket notification to set a cookie for accountApproved
                                        if (peerInstance.toJSON().socketconnections !== null && peerInstance.toJSON().socketconnections.length > 0) {
                                            peerInstance.toJSON().socketconnections.forEach(socketconnection => {
                                                console.log('sending cookie update to :' + socketconnection.socketId);
                                                let cookie = {
                                                    accountApproved: 'true'
                                                };
                                                Peer.app.io.to(socketconnection.socketId).emit("cookie", cookie);
                                            });
                                        }
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
                let userId = peerInstance.toJSON().id;
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
                        let message = {};
                        let subject = 'Account rejected';

                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/accountRejected.ejs'));
                        let html_body = renderer(message);

                        // Send notification to peer
                        peerInstance.__create__notifications({
                            type: "action",
                            title: "Account approved!",
                            description: "Your peerbuds account was rejected. Please edit your details and re-submit.",
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

    Peer.floatingGyanBalance = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null && peerInstance.ethAddress) {
                // Get from blockchain
                request
                    .get({
                        url: protocolUrl + 'gyan/' + peerInstance.ethAddress + '/floating',
                    }, function (err, response, data) {
                        if (err) {
                            console.error(err);
                            cb(err);
                        } else {
                            console.log('Got floating gyan balance of user: ' + data);
                            if (req.query && req.query.convertTo && req.query.convertTo === 'USD') {
                                Peer.app.models.cache.findById('1', function (err, cacheInstance) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        console.log('Got eth rate in dollars: ' + cacheInstance.ethRate);
                                        const dollarPerEther = parseFloat(cacheInstance.ethRate);
                                        const karmaRewardPerGyan = parseInt(cacheInstance.karmaMintRate) * 0.65 * Math.max((1 / parseInt(cacheInstance.gyanEarnRate)), 1);
                                        const karmaPerEther = app.get('karmaRate');
                                        cb(null, (data * karmaRewardPerGyan * (1 / karmaPerEther) * dollarPerEther).toFixed(2));
                                    }
                                });
                            } else {
                                cb(null, data);
                            }
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

    Peer.fixedGyanBalance = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null && peerInstance.ethAddress) {
                // Get from blockchain
                request
                    .get({
                        url: protocolUrl + 'gyan/' + peerInstance.ethAddress + '/fixed',
                    }, function (err, response, data) {
                        if (err) {
                            console.error(err);
                            cb(err);
                        } else {
                            console.log('Got fixed gyan balance of user: ' + data);
                            if (req.query && req.query.convertTo && req.query.convertTo === 'USD') {
                                Peer.app.models.cache.findById('1', function (err, cacheInstance) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        console.log('Got eth rate in dollars: ' + cacheInstance.ethRate);
                                        const dollarPerEther = parseFloat(cacheInstance.ethRate);
                                        const karmaRewardPerGyan = parseInt(cacheInstance.karmaMintRate) * 0.65 * Math.max((1 / parseInt(cacheInstance.gyanEarnRate)), 1);
                                        const karmaPerEther = app.get('karmaRate');
                                        cb(null, (data * karmaRewardPerGyan * (1 / karmaPerEther) * dollarPerEther).toFixed(2));
                                    }
                                });
                            } else {
                                cb(null, data);
                            }
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

    Peer.potentialKarmaReward = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null && peerInstance.ethAddress) {
                // Get from blockchain
                request
                    .get({
                        url: protocolUrl + 'karma/' + peerInstance.ethAddress + '/potentialRewards',
                    }, function (err, response, data) {
                        if (err) {
                            console.error(err);
                            cb(err);
                        } else {
                            console.log('Got potential karma rewards of user: ' + data);
                            if (req.query && req.query.convertTo && req.query.convertTo === 'USD') {
                                Peer.app.models.cache.findById('1', function (err, cacheInstance) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        console.log('Got eth rate in dollars: ' + cacheInstance.ethRate);
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
                err = new Error(g.f('Invalid Peer with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_PEER';
                cb(err);
            }

        });
    };

    Peer.karmaBalance = function (id, req, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null && peerInstance.ethAddress) {
                // Get from blockchain
                request
                    .get({
                        url: protocolUrl + 'karma/' + peerInstance.ethAddress,
                    }, function (err, response, data) {
                        if (err) {
                            console.error(err);
                            cb(err);
                        } else {
                            console.log('Got karma balance of user: ' + data);
                            if (req.query && req.query.convertTo && req.query.convertTo === 'USD') {
                                Peer.app.models.cache.findById('1', function (err, cacheInstance) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        console.log('Got eth rate in dollars: ' + cacheInstance.ethRate);
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
                err = new Error(g.f('Invalid Peer with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_PEER';
                cb(err);
            }

        });
    };

    Peer.fixWallet = function (id, req, body, cb) {
        // Find the collection by given ID
        Peer.findById(id, function (err, peerInstance) {
            if (!err && peerInstance !== null && peerInstance.ethAddress) {
                // Already has wallet. Check if it exists on blockchain.
                cb(null, { result: 'Wallet already exists' });
            } else if (!err && peerInstance !== null && !peerInstance.ethAddress) {
                peerInstance.hasPassword(body.password, function (err, isMatch) {
                    if (err) {
                        cb(err);
                    } else if (isMatch) {
                        // Get from blockchain
                        request
                            .post({
                                url: protocolUrl + 'peers',
                                body: {
                                    password: body.password
                                },
                                json: true
                            }, function (err, response, data) {
                                if (err) {
                                    console.error(err);
                                    cb(err);
                                } else {
                                    console.log('Created new wallet address for user: ' + data);
                                    peerInstance.updateAttributes({
                                        "ethAddress": data
                                    });
                                    cb(null, data);
                                }
                            });
                    } else {
                        let error = new Error(g.f('Incorrect password'));
                        error.statusCode = 401;
                        error.code = 'INCORRECT_PASSWORD';
                        cb(error);
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

    Peer.karmaSupply = function (cb) {

        // Get from blockchain
        request
            .get({
                url: protocolUrl + 'karma',
                json: true
            }, function (err, response, data) {
                if (err) {
                    console.error(err);
                    cb(err);
                } else {
                    console.log('Got karma supply: ' + data);
                    cb(null, data);
                }
            });
    };

    Peer.blockTransactions = function (id, req, cb) {
        const topics = req.query && req.query.topics ? req.query.topics : '';
        // Get from blockchain
        request
            .get({
                url: protocolUrl + 'peers/' + id + '/transactions?topics=' + topics,
                json: true
            }, function (err, response, data) {
                if (err) {
                    console.error(err);
                    cb(err);
                } else {
                    console.log('Got transactions of this peer: ' + data);
                    cb(null, data);
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
                    Peer.findById(ctx.where.id, function (err, peerInstance) {
                        if (err) {
                            next(err);
                        } else {
                            let message = {};
                            let subject = 'Account rejected';

                            let renderer = loopback.template(path.resolve(__dirname, '../../server/views/accountRejected.ejs'));
                            let html_body = renderer(message);
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
                            next();
                        }
                    });
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
        let userModel = this.constructor;
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
                //console.log(modelInstance);
                if (modelInstance) {
                    modelInstance.profiles((err, instances) => {
                        if (err) {
                            cb(err);
                        } else {
                            if (instances[0]) {
                                let objId = instances[0].id;
                                Peer.app.models.profile.upsertWithWhere({ "id": objId }, profileObject, function (err, updatedInstance) {
                                    if (err) {
                                        cb(err);
                                    }
                                    else {
                                        cb(null, user, updatedInstance);
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
        let query = {};
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
        let salt = bcrypt.genSaltSync(this.settings.saltWorkFactor || SALT_WORK_FACTOR);
        return bcrypt.hashSync(plain, salt);
    };

    Peer.validatePassword = function (plain) {
        let err;
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

        //console.log(userIds);
		/*Peer.dataSource.connector.execute(
			"match (:peer {id:'"+ctx.where.id+"'})-[:hasToken]->(token:UserToken) DETACH DELETE token",
			cb
		);*/

    };

    Peer.afterRemote('prototype.__create__reviewsAboutYou', function (ctx, newReviewInstance, next) {
        // A new review was created. Send email to teacher who got review
        let loggedinPeer = Peer.getCookieUserId(ctx.req);
        if (loggedinPeer) {
            Peer.findById(ctx.instance.id, { include: 'profiles' }, function (err, reviewedPeerInstance) {
                if (!err) {
                    Peer.app.models.collection.findById(newReviewInstance.collectionId, function (err, reviewedCollectionInstance) {
                        if (!err) {
                            Peer.findById(loggedinPeer, { include: 'profiles' }, function (err, reviewerInstance) {
                                if (!err) {
                                    // Send token in email to user.
                                    let message = { reviewedPeerName: reviewedPeerInstance.toJSON().profiles[0].first_name, reviewerName: reviewerInstance.toJSON().profiles[0].first_name + ' ' + reviewerInstance.toJSON().profiles[0].last_name, reviewScore: newReviewInstance.score, reviewDesc: newReviewInstance.description, collectionTitle: reviewedCollectionInstance.title };
                                    let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newReviewToTeacher.ejs'));
                                    let html_body = renderer(message);
                                    loopback.Email.send({
                                        to: ctx.instance.email,
                                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                        subject: 'You have a new review',
                                        html: html_body
                                    })
                                        .then(function (response) {
                                            console.log('email sent! - ' + response);
                                        })
                                        .catch(function (err) {
                                            console.log('email error! - ' + err);
                                        });
                                    next();
                                }
                                else {
                                    next(new Error('Could not find reviewer details'));
                                }
                            });
                        }
                        else {
                            next(new Error('Could not find reviewed collection'));
                        }
                    });
                }
                else {
                    next(new Error('Could not find reviewed peer details'));
                }
            });
        }
        else {
            next(new Error('Could not find logged in peer ID'));
        }
    });

    Peer.getCookieUserId = function (req) {

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

	/*!
	 * Setup an extended user model.
	 */
    Peer.setup = function () {

        // We need to call the base class's setup method
        Peer.base.setup.call(this);
        let PeerModel = this;

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
            let body = ctx.req.body;
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
            let room = app.models.room;
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
                    { arg: 'phone', type: 'string', required: true },
                    { arg: 'countryCode', type: 'string', required: true }
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
            'setPassword',
            {
                description: 'Set password for a user.',
                accepts: [
                    { arg: 'options', type: 'object', required: true, http: { source: 'body' } }
                ],
                returns: { arg: 'response', type: 'object', root: true },
                http: { verb: 'post', path: '/setPassword' }
            }
        );

        PeerModel.remoteMethod(
            'forgotPassword',
            {
                description: 'Forgot password for a user with email.',
                accepts: [
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'body', type: 'object', required: true, http: { source: 'body' } }
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

        PeerModel.remoteMethod(
            'fixedGyanBalance',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/fixedGyanBalance', verb: 'get' }
            }
        );

        PeerModel.remoteMethod(
            'floatingGyanBalance',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/floatingGyanBalance', verb: 'get' }
            }
        );

        PeerModel.remoteMethod(
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

        PeerModel.remoteMethod(
            'potentialKarmaReward',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/potentialRewards', verb: 'get' }
            }
        );

        PeerModel.remoteMethod(
            'fixWallet',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                    { arg: 'body', type: 'object', required: true, http: { source: 'body' } }
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/fixWallet', verb: 'post' }
            }
        );

        PeerModel.remoteMethod(
            'karmaSupply',
            {
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/karmaSupply', verb: 'get' }
            }
        );

        PeerModel.remoteMethod(
            'blockTransactions',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'req', type: 'object', http: { source: 'req' } },
                ],
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/blockTransactions', verb: 'get' }
            }
        );

        PeerModel.validate('email', emailValidator, {
            message: g.f('Must provide a valid email')
        });

        PeerModel.remoteMethod(
            'generateKnowledgeStory',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'data', type: 'object', required: true, http: { source: 'body' } }
                ],
                description: `  {
                    "story_title": "string",
                    "story_description": "string",
                    "topicIds":[],
                } ` ,
                returns: { arg: 'result', type: 'object', root: true },
                http: { path: '/:id/generate-knowledge-story', verb: 'post' }
            }
        );

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

        let pkName = ctx.Model.definition.idName() || 'id';
        let where = ctx.where;
        if (!where) {
            where = {};
            where[pkName] = ctx.instance[pkName];
        }

        ctx.Model.find({ where: where }, function (err, userInstances) {
            if (err) return next(err);
            ctx.hookState.originalUserData = userInstances.map(function (u) {
                let user = {};
                user[pkName] = u[pkName];
                user.email = u.email;
                user.password = u.password;
                return user;
            });
            let emailChanged;
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

        let pkName = ctx.Model.definition.idName() || 'id';
        let newEmail = (ctx.instance || ctx.data).email;
        let newPassword = (ctx.instance || ctx.data).password;

        if (!newEmail && !newPassword) return next();

        let userIdsToExpire = ctx.hookState.originalUserData.filter(function (u) {
            return (newEmail && u.email !== newEmail) ||
                (newPassword && u.password !== newPassword);
        }).map(function (u) {
            return u[pkName];
        });
        ctx.Model._invalidateAccessTokensOfUsers(userIdsToExpire, ctx.options, next);
    });


    function emailValidator(err, done) {
        let value = this.email;
        if (value === null)
            return;
        if (typeof value !== 'string')
            return err('string');
        if (value === '') return;
        if (!isEmail.validate(value))
            return err('email');
    }

};
