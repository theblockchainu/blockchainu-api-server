'use strict';

let loopback = require('loopback');
let boot = require('loopback-boot');
let app = module.exports = loopback();
let cookieParser = require('cookie-parser');
let session = require('express-session');
let SALT_WORK_FACTOR = 10;
let g = require('../node_modules/loopback/lib/globalize');
let cors = require('cors');
let bcrypt;
let MAX_PASSWORD_LENGTH = 72;
let unirest = require('unirest');
let request = require('request');
let https = require('https');
let http = require('http');
let sslConfig = require('./ssl-config');

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

// Passport configurators..
let loopbackPassport = require('loopback-component-passport-neo4j');
let PassportConfigurator = loopbackPassport.PassportConfigurator;
let passportConfigurator = new PassportConfigurator(app);

/*
 * body-parser is a piece of express middleware that
 *   reads a form's input and stores it as a javascript
 *   object accessible through `req.body`
 *
 */
let bodyParser = require('body-parser');

/**
 * Flash messages for passport
 *
 * Setting the failureFlash option to true instructs Passport to flash an
 * error message using the message given by the strategy's verify callback,
 * if any. This is often the best approach, because the verify callback
 * can make the most accurate determination of why authentication failed.
 */
let flash = require('express-flash');

// attempt to build the providers/passport config
let config = {};
try {
    if (process.env.NODE_ENV === 'development') {
        config = require('../providers.development.json');
    } else {
        config = require('../providers.json');
    }
} catch (err) {
    console.trace(err);
    process.exit(1); // fatal
}

// -- Add your pre-processing middleware here --

// Setup the view engine (jade)
let path = require('path');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Middlewars to enable cors on the server
let originsWhitelist = [
    'null',
    'localhost:9090',      //frontend url for development
    'localhost:8080',      //frontend url for development
    'https://peedbuds.com',
    'https://theblockchainu.com'
];
let corsOptions = {
    origin: function (origin, callback) {
        let isWhitelisted = originsWhitelist.indexOf(origin) !== -1;
        callback(null, isWhitelisted);
    },
    credentials: true
};

app.use(cors(corsOptions));
let cookieDomain = app.get('cookieDomain');
// to support JSON-encoded bodies
app.middleware('parse', bodyParser.json({ limit: '50mb' }));
// to support URL-encoded bodies
app.middleware('parse', bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.middleware('session', session({
    secret: "246bace2-38cb-4138-85d9-0ae8160b07c8",
    saveUninitialized: true,
    resave: true,
    cookie: {
        domain: cookieDomain,
        httpOnly: false,
        secure: false
    }
}));

passportConfigurator.init();

// We need flash messages to see passport errors
app.use(flash());

for (let s in config) {
    let c = config[s];
    c.session = c.session !== false;
    passportConfigurator.configureProvider(s, c);
}

let ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

app.get('/', function (req, res, next) {
    res.render('pages/index', {
        user: req.user,
        url: req.url,
    });
});

app.get('/auth/account', ensureLoggedIn('/login'), function (req, res, next) {
    res.render('pages/loginProfiles', {
        user: req.user,
        url: req.url,
    });
});

app.get('/local', function (req, res, next) {
    res.render('pages/local', {
        user: req.user,
        url: req.url,
    });
});

app.get('/signup', function (req, res, next) {
    res.render('pages/signup', {
        user: req.user,
        url: req.url,
    });
});

app.get('/socket', function (req, res, next) {
    res.render('pages/sockettest');
});

app.post('/signup', function (req, res, next) {
    let User = app.models.peer;

    let newUser = {};
    let profileObject = {};
    let rememberMe = req.body.rememberMe;
    newUser.email = req.body.email.toLowerCase();
    newUser.password = req.body.password;
    newUser.ptPassword = newUser.password;
    profileObject.first_name = req.body.first_name;
    profileObject.last_name = req.body.last_name;
    profileObject.dobMonth = req.body.dobMonth;
    profileObject.dobDay = req.body.dobDay;
    profileObject.dobYear = req.body.dobYear;
    profileObject.promoOptIn = req.body.promoOptIn;
    let returnTo = req.headers.origin + '/' + req.query.returnTo;
    const cookieDomain = req.headers.origin.split('//')[1];
    let hashedPassword = '';
    let query;
    if (newUser.email && newUser.username) {
        query = {
            or: [
                { username: newUser.username },
                { email: newUser.email },
            ]
        };
    } else if (newUser.email) {
        query = { email: newUser.email };
    } else {
        query = { username: newUser.username };
    }

    /*!
     * Hash the plain password
     */
    let hashPassword = function (plain) {
        validatePassword(plain);
        let salt = bcrypt.genSaltSync(SALT_WORK_FACTOR);
        return bcrypt.hashSync(plain, salt);
    };

    let validatePassword = function (plain) {
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

    let setPassword = function (plain) {
        if (typeof plain !== 'string') {
            return;
        }
        if (plain.indexOf('$2a$') === 0 && plain.length === 60) {
            // The password is already hashed. It can be the case
            // when the instance is loaded from DB
            hashedPassword = plain;
        } else {
            hashedPassword = hashPassword(plain);
        }
    };

    let loopbackLogin = function (user) {
        console.log("inside loopbackLogin");
        User.login({ email: newUser.email, password: newUser.password }, function (err, accessToken) {
            if (err) {
                console.log("User model login error: " + err);
                return res.json({
                    'status': 'failed',
                    'reason': 'Err: ' + err
                });
            }
            if (accessToken) {
                //console.log("Access token: " + JSON.stringify(accessToken));
                // Passport exposes a login() function on req (also aliased as logIn())
                // that can be used to establish a login session. This function is
                // primarily used when users sign up, during which req.login() can
                // be invoked to log in the newly registered user.
                req.login(user, function (err) {
                    if (err) {
                        return res.json({
                            'status': 'failed',
                            'reason': 'Err: ' + err
                        });
                    }
                    res.cookie('access_token', accessToken[0].token.properties.id, {
                        signed: req.signedCookies ? true : false,
                        domain: cookieDomain,
                        maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl,
                    });
                    if (user.accountVerified !== undefined) {
                        res.cookie('accountApproved', user.accountVerified.toString(), {
                            signed: req.signedCookies ? true : false,
                            domain: cookieDomain,
                            maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl,
                        });
                    }
                    if (user.currency !== undefined) {
                        res.cookie('currency', user.currency.toString(),
                            {
                                signed: req.signedCookies ? true : false,
                                domain: cookieDomain,
                                // maxAge is in ms
                                maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl
                            });
                    }
                    if (user.timezone !== undefined) {
                        res.cookie('timezone', user.timezone.toString(),
                            {
                                signed: req.signedCookies ? true : false,
                                domain: cookieDomain,
                                // maxAge is in ms
                                maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl
                            });
                    }
                    res.cookie('userId', user.id.toString(), {
                        signed: req.signedCookies ? true : false,
                        domain: cookieDomain,
                        maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl,
                    });
                    return res.redirect(returnTo);
                    /*return res.json({
                        'access_token': accessToken[0].token.properties.id,
                        userId: user.id
                    });*/
                });
            } else {
                console.log("no access token");
                return res.json({
                    'status': 'failed',
                    'reason': 'Err: Could not create access token'
                });
            }
        });
    };

    let createProfileNode = function (user) {
        let profile = app.models.profile;
        console.log('Creating Profile Node');
        user.updateProfileNode(profile, profileObject, user, function (err, user, profileNode) {
            if (!err) {
                //console.log(user);
                user.currency = profileNode.currency;
                user.timezone = profileNode.timezone;
            } else {
                console.log("ERROR CREATING PROFILE");
            }
        });
    };


    console.log('trying to find user with query: ' + JSON.stringify(query));
    User.findOne({ where: query }, function (err, existingUserInstance) {
        if (err) {
            return res.json({
                'status': 'failed',
                'reason': 'Err: ' + err
            });
        }
        else {
            if (existingUserInstance !== null) {
                console.log("found existing USER");
                return res.json({
                    'status': 'failed',
                    'reason': 'User email already exists. Try logging instead.'
                });
            }
            else {
                User.create(newUser, function (err, user) {

                    if (err) {
                        return res.json({
                            'status': 'failed',
                            'reason': 'Err: ' + err
                        });
                    } else {

                        setPassword(newUser.password);

                        let stripeTransaction = app.models.transaction;
                        let stripeResponse = '';
                        stripeTransaction.createCustomer(user, function (err, data) {
                            stripeResponse = data;

                            console.log("NEW USER ACCOUNT CREATED");
                            User.dataSource.connector.execute(
                                "MATCH (p:peer {email: '" + user.email + "'}) SET p.password = '" + hashedPassword + "'",
                                function (err, results) {
                                    if (!err) {
                                        // Send welcome email to user
                                        let message = { username: profileObject.first_name };
                                        let renderer = loopback.template(path.resolve(__dirname, 'views/welcomeSignupStudent.ejs'));
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
                                        createProfileNode(user);
                                        loopbackLogin(user);
                                    }
                                    else {

                                    }
                                }
                            );
                        });

                        // Create wallet on blockchain
                        console.log('Creating wallet');
                        request
                            .post({
                                url: app.get('protocolUrl') + 'peers',
                                body: {
                                    password: newUser.password
                                },
                                json: true
                            }, function (err, response, data) {
                                if (err) {
                                    console.error(err);
                                } else {
                                    console.log(data);
                                    User.dataSource.connector.execute(
                                        "MATCH (p:peer {email: '" + user.email + "'}) SET p.ethAddress = '" + data + "'",
                                        function (err, results) {
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
                                    let renderer = loopback.template(path.resolve(__dirname, 'views/newSignupAdmin.ejs'));
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

                                    User.app.models.scholarship.find(
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
                                                const renderer = loopback.template(path.resolve(__dirname, './views/welcomeGlobalScholarship.ejs'));
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
                    }
                });
            }
        }
    });
});

app.post('/convertCurrency', function (req, res, next) {
    let access_key = app.get('currencyLayerKey');
    unirest.get('http://apilayer.net/api/convert')
        .query('access_key=' + access_key)
        .query('from=' + req.body.from)
        .query('to=' + req.body.to)
        .query('amount=' + req.body.amount)
        .end(function (response) {
            res.json(response.body);
        });
});


app.post('/getKarmaToBurn', function (req, res, next) {
    request
        .get({
            url: app.get('protocolUrl') + 'gyan/' + req.body.gyan + '/karma',
            json: true
        }, function (err, response, data) {
            if (err) {
                console.error(err);
                next(err);
            } else {
                console.log('Got karma to burn: ' + data);
                res.json({ karma: data });
            }
        });
});

app.get('/karmaToDollar', function (req, res, next) {
    app.models.cache.findById('1', function (err, cacheInstance) {
        if (err) {
            next(err);
        } else {
            console.log('Got eth rate: ' + cacheInstance.ethRate);
            const dollarPerEther = parseFloat(cacheInstance.ethRate);
            const karmaPerEther = app.get('karmaRate');
            res.json({ USD: (req.query.karma * (1 / karmaPerEther) * dollarPerEther).toFixed(2) });
        }
    });
});

app.get('/gyanToDollar', function (req, res, next) {
    app.models.cache.findById('1', function (err, cacheInstance) {
        if (err) {
            next(err);
        } else {
            console.log('Got eth rate in dollars: ' + cacheInstance.ethRate);
            const dollarPerEther = parseFloat(cacheInstance.ethRate);
            const karmaRewardPerGyan = parseInt(cacheInstance.karmaMintRate) * 0.65 * Math.max((1 / parseInt(cacheInstance.gyanEarnRate)), 1);
            const karmaPerEther = app.get('karmaRate');
            res.json({ USD: (req.query.gyan * karmaRewardPerGyan * (1 / karmaPerEther) * dollarPerEther).toFixed(2) });
        }
    });
});

app.get('/login', function (req, res, next) {
    res.render('pages/login', {
        user: req.user,
        url: req.url,
    });
});

app.get('/auth/logout', function (req, res, next) {
    let User = app.models.Peer;
    let tokenId = !!req.accessToken ? req.accessToken.id : '';
    console.log("Access token to delete is: " + JSON.stringify(tokenId));
    User.dataSource.connector.execute(
        "match (:peer)-[:hasToken]->(token:UserToken {id:'" + tokenId + "'}) DETACH DELETE token",
        function (err, results) {
            if (!err) {
                req.logout();
                res.redirect('/');
            }
        }
    );
});

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
    if (err) throw err;

});

passportConfigurator.setupModels({
    userModel: app.models.peer,
    userIdentityModel: app.models.userIdentity,
    userCredentialModel: app.models.userCredential,
});

app.start = function (httpOnly) {
    if (httpOnly === undefined) {
        httpOnly = process.env.HTTP;
    }
    let server = null;
    if (!httpOnly) {
        let options = {
            key: sslConfig.privateKey,
            cert: sslConfig.certificate,
        };
        server = https.createServer(options, app);
    } else {
        server = http.createServer(app);
    }
    // start the web server
    server.listen(app.get('port'), function () {
        let baseUrl = (httpOnly ? 'http://' : 'https://') + app.get('host') + ':' + app.get('port');
        app.emit('started', baseUrl);
        console.log('Web server listening at: %s', baseUrl);

        if (app.get('loopback-component-explorer')) {
            let explorerPath = app.get('loopback-component-explorer').mountPath;
            console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
        }
    });
    return server;
};

// start the server if `$ node server.js`
if (require.main === module) {
    app.io = require('socket.io')(app.start());
    app.socketService = require('./socket-events')(app.io);
}
