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
    'http://www.peedbuds.com'
];
var corsOptions = {
    origin: function(origin, callback){
        var isWhitelisted = originsWhitelist.indexOf(origin) !== -1;
        callback(null, isWhitelisted);
    },
    credentials:true
};
app.use(cors(corsOptions));


// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
    if (err) throw err;

});

// to support JSON-encoded bodies
app.middleware('parse', bodyParser.json());
// to support URL-encoded bodies
app.middleware('parse', bodyParser.urlencoded({
    extended: true,
}));

// The access token is only available after boot
app.middleware('auth', loopback.token({
    model: app.models.UserToken,
}));

app.middleware('session:before', cookieParser(app.get('cookieSecret')));

app.middleware('session', session({
    secret: 'kitty',
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

app.post('/signup', function (req, res, next) {
    var User = app.models.peer;

    var newUser = {};
    newUser.email = req.body.email.toLowerCase();
    newUser.username = req.body.username.trim();
    newUser.password = req.body.password;

    var returnTo = req.headers.referer + req.query.returnTo;

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
        User.login({ username: newUser.username, password: newUser.password }, function (err, accessToken) {
            if (err) {
                console.log("User model login error: " + err);
                req.flash('error', err);
                return res.redirect('back');
            }
            if (accessToken) {
                console.log("Access token: " + JSON.stringify(accessToken));
                // Passport exposes a login() function on req (also aliased as logIn())
                // that can be used to establish a login session. This function is
                // primarily used when users sign up, during which req.login() can
                // be invoked to log in the newly registered user.
                req.login(user, function (err) {
                    if (err) {
                        req.flash('error', err.message);
                        return res.redirect('back');
                    }
                    res.cookie('access_token', accessToken[0].token.properties.id, {
                        signed: req.signedCookies ? true : false,
                        maxAge: 1000 * accessToken[0].token.properties.ttl,
                    });
                    res.cookie('userId', user.id.toString(), {
                        signed: req.signedCookies ? true : false,
                        maxAge: 1000 * accessToken[0].token.properties.ttl,
                    });
                    return res.redirect(returnTo);
                    /*return res.json({
                        'access_token': accessToken[0].token.properties.id,
                        userId: user.id
                    });*/
                });
            } else {
                console.log("no access token");
                req.flash('error', 'Could not create access token');
                return res.redirect('back');
            }
        });
    };

    var createProfileNode = function (user) {
        var profile=app.models.profile;
        console.log('Creating Profile Node');
        user.createProfile(profile,user,function(err, user, profileNode){
            if(!err){
                console.log('created!');
            }else{
                console.log("ERROR");
            }
        });
    }

    User.findOrCreate({ where: query }, newUser, function (err, user, created) {

        if (err) {
            console.log("Error is: " + err);
            req.flash('error', err.message);
            return res.redirect('back');
        } else {
            console.log("User is: " + JSON.stringify(user));

            setPassword(newUser.password);



            if (created) {
                console.log("created new instance");
                createProfileNode(user);
                loopbackLogin(user);
            }
            // Found an existing account with this email ID and username
            // Update the password field of that account with new password
            // Update the username field of that account with new username
            else {

                console.log("found existing instance");
                User.dataSource.connector.execute(
                    "MATCH (p:peer {username: '" + user.username + "'}) SET p.password = '" + hashedPassword + "'",
                    function (err, results) {
                        if (!err) {
                            createProfileNode(user);
                            loopbackLogin(user);
                        }
                        else {

                        }
                    }
                );
            }
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

app.start = function () {
    // start the web server
    return app.listen(function () {
        app.emit('started');
        var baseUrl = app.get('url').replace(/\/$/, '');
        console.log('Web server listening at: %s', baseUrl);
        if (app.get('loopback-component-explorer')) {
            var explorerPath = app.get('loopback-component-explorer').mountPath;
            console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
        }
    });
};

// start the server if `$ node server.js`
if (require.main === module) {
    app.io = require('socket.io')(app.start());

    require('socketio-auth')(app.io, {
        authenticate: function (socket, value, callback) {

            var AccessToken = app.models.UserToken;
            //get credentials sent by the client
            var token = AccessToken.find({
                where:{
                    and: [{ userId: value.userId }, { access_token: value.access_token }]
                }
            }, function(err, tokenDetail){
                if (err) throw err;
                if(tokenDetail.length){
                    callback(null, true);
                } else {
                    callback(null, false);
                }
            }); //find function..
        } //authenticate function..
    });

    app.io.on('connection', function(socket) {
        console.log('a user connected');

        socket.on('subscribe', function(room) {
            console.log('joining room', room);
            socket.join(room);
        });
        socket.on('disconnect', function(){
           console.log('user disconnected');
        });
    });
}
