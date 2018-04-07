'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var app = module.exports = loopback();
var cookieParser = require('cookie-parser');
var session = require('express-session');
var SALT_WORK_FACTOR = 10;
var g = require('../node_modules/loopback/lib/globalize');
var cors = require('cors');
var bcrypt;
var MAX_PASSWORD_LENGTH = 72;
var unirest = require('unirest');
var https = require('https');
var http = require('http');
var sslConfig = require('./ssl-config');

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
var loopbackPassport = require('loopback-component-passport-neo4j');
var PassportConfigurator = loopbackPassport.PassportConfigurator;
var passportConfigurator = new PassportConfigurator(app);

/*
 * body-parser is a piece of express middleware that
 *   reads a form's input and stores it as a javascript
 *   object accessible through `req.body`
 *
 */
var bodyParser = require('body-parser');

/**
 * Flash messages for passport
 *
 * Setting the failureFlash option to true instructs Passport to flash an
 * error message using the message given by the strategy's verify callback,
 * if any. This is often the best approach, because the verify callback
 * can make the most accurate determination of why authentication failed.
 */
var flash = require('express-flash');

// attempt to build the providers/passport config
var config = {};
try {
    config = require('../providers.json');
} catch (err) {
    console.trace(err);
    process.exit(1); // fatal
}

// -- Add your pre-processing middleware here --

// Setup the view engine (jade)
var path = require('path');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Middlewars to enable cors on the server
var originsWhitelist = [
    'null',
    'localhost:9090',      //frontend url for development
    'localhost:8080',      //frontend url for development
    'https://www.peedbuds.com',
    'https://www.dev.peedbuds.com'
];
var corsOptions = {
    origin: function (origin, callback) {
        var isWhitelisted = originsWhitelist.indexOf(origin) !== -1;
        callback(null, isWhitelisted);
    },
    credentials: true
};

app.use(cors(corsOptions));

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
    if (err) throw err;

});

// to support JSON-encoded bodies
app.middleware('parse', bodyParser.json({limit: '50mb'}));
// to support URL-encoded bodies
app.middleware('parse', bodyParser.urlencoded({limit: '50mb', extended: true}));

// The access token is only available after boot
app.middleware('auth', loopback.token({
    model: app.models.UserToken,
}));

app.middleware('session:before', cookieParser(app.get('cookieSecret')));

app.middleware('session', session({
    secret: app.get('cookieParser'),
    saveUninitialized: true,
    resave: true,
}));

passportConfigurator.init();

// We need flash messages to see passport errors
app.use(flash());

passportConfigurator.setupModels({
    userModel: app.models.peer,
    userIdentityModel: app.models.userIdentity,
    userCredentialModel: app.models.userCredential,
});

for (var s in config) {
    var c = config[s];
    c.session = c.session !== false;
    passportConfigurator.configureProvider(s, c);
}

var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

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
    var User = app.models.peer;

    var newUser = {};
    var profileObject = {};
    var rememberMe = req.body.rememberMe;
    newUser.email = req.body.email.toLowerCase();
    newUser.password = req.body.password;
    profileObject.first_name = req.body.first_name;
    profileObject.last_name = req.body.last_name;
    profileObject.dobMonth = req.body.dobMonth;
    profileObject.dobDay = req.body.dobDay;
    profileObject.dobYear = req.body.dobYear;
    profileObject.promoOptIn = req.body.promoOptIn;
    var returnTo = req.headers.origin + '/' + req.query.returnTo;
    var hashedPassword = '';
    var query;
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
    var hashPassword = function (plain) {
        validatePassword(plain);
        var salt = bcrypt.genSaltSync(SALT_WORK_FACTOR);
        return bcrypt.hashSync(plain, salt);
    };

    var validatePassword = function (plain) {
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

    var setPassword = function (plain) {
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

    var loopbackLogin = function (user) {
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
                        domain: app.get('cookieDomain'),
                        maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl,
                    });
                    if (user.accountVerified !== undefined) {
                        res.cookie('accountApproved', user.accountVerified.toString(), {
                            signed: req.signedCookies ? true : false,
	                        domain: app.get('cookieDomain'),
                            maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl,
                        });
                    }
                    if (user.currency !== undefined) {
                        res.cookie('currency', user.currency.toString(),
                            {
                                signed: req.signedCookies ? true : false,
	                            domain: app.get('cookieDomain'),
                                // maxAge is in ms
                                maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl
                            });
                    }
                    if (user.timezone !== undefined) {
                        res.cookie('timezone', user.timezone.toString(),
                            {
                                signed: req.signedCookies ? true : false,
	                            domain: app.get('cookieDomain'),
                                // maxAge is in ms
                                maxAge: rememberMe ? 315569520000 : 1000 * accessToken[0].token.properties.ttl
                            });
                    }
                    res.cookie('userId', user.id.toString(), {
                        signed: req.signedCookies ? true : false,
	                    domain: app.get('cookieDomain'),
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

    var createProfileNode = function (user) {
        var profile = app.models.profile;
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
                        //console.log("User is: " + JSON.stringify(user));

                        setPassword(newUser.password);

                        var stripeTransaction = app.models.transaction;
                        stripeTransaction.createCustomer(user, function (err, data) {
                            //console.log("Stripe Customer : " + JSON.stringify(data));
                        });
                        console.log("NEW USER ACCOUNT CREATED");
                        User.dataSource.connector.execute(
                            "MATCH (p:peer {email: '" + user.email + "'}) SET p.password = '" + hashedPassword + "'",
                            function (err, results) {
                                if (!err) {
                                    // Send welcome email to user
                                    var message = { username: profileObject.first_name};
                                    var renderer = loopback.template(path.resolve(__dirname, 'views/welcomeSignupStudent.ejs'));
                                    var html_body = renderer(message);
                                    loopback.Email.send({
                                        to: user.email,
                                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                        subject: 'Welcome to peerbuds',
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
                    }
                });
            }
        }
    });
});

app.post('/convertCurrency', function(req, res, next) {
    var access_key = app.get('currencyLayerKey');
    //console.log(access_key);
    unirest.get('http://apilayer.net/api/convert')
        .query('access_key=' + access_key)
        .query('from=' + req.body.from)
        .query('to=' + req.body.to)
        .query('amount=' + req.body.amount)
        .end(function (response) {
            //console.log(response.body);
            res.json(response.body);
        });
});

app.get('/login', function (req, res, next) {
    res.render('pages/login', {
        user: req.user,
        url: req.url,
    });
});

app.get('/auth/logout', function (req, res, next) {
    var User = app.models.Peer;
    var tokenId = !!req.accessToken ? req.accessToken.id : '';
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

app.start = function (httpOnly) {
    if (httpOnly === undefined) {
        httpOnly = process.env.HTTP;
    }
    var server = null;
    if (!httpOnly) {
        var options = {
            key: sslConfig.privateKey,
            cert: sslConfig.certificate,
        };
        server = https.createServer(options, app);
    } else {
        server = http.createServer(app);
    }
    // start the web server
    server.listen(app.get('port'), function () {
        var baseUrl = (httpOnly? 'http://' : 'https://') + app.get('host') + ':' + app.get('port');
        app.emit('started', baseUrl);
        console.log('Web server listening at: %s', baseUrl);
        if (app.get('loopback-component-explorer')) {
            var explorerPath = app.get('loopback-component-explorer').mountPath;
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
