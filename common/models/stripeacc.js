'use strict';
var app = require('../../server/server');
var request = require('request');
var client_secret = "sk_test_mjuDwEmXkxA1ewmsqgDdPCWT"; //need to take it from config file

module.exports = function (StripeAcc) {

    // Charge the user's card/bank account
    StripeAcc.createConnectedAcc = function (req, authCode, error, errorDesc, cb) {

        var loggedinPeer = req.user;
        // if user is logged in
        if (loggedinPeer && !error) {
            //Remove user from Session
            request({
                url: 'https://connect.stripe.com/oauth/token',      //URL to hit
                qs: {
                    client_secret: client_secret,
                    code: authCode,
                    grant_type: "authorization_code"
                },  //Query string data
                method: 'POST'               //Specify the method
            }, function (error, res, resBody) {
                if (error) {
                    //console.log(error);
                } else {
                    console.log(res.statusCode, resBody);

                    var authRes = JSON.parse(resBody);
                    if (!authRes.hasOwnProperty("error")) {

                        var connUser = authRes;
                        loggedinPeer.stripeaccs.create(connUser, function (err, connUserInstance) {
                            if (err) {
                                connUserInstance.destroy();
                                cb(err);
                            } else {
                                cb(null, connUserInstance);
                            }
                        });
                    } else {
                        cb(authRes.error_description);
                    }
                }
            });
        } else if (error) {
            var err = new Error(errorDesc);
            err.code = 'INVALID_GRANT';
            cb(err);
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    StripeAcc.remoteMethod('createConnectedAcc', {
        description: 'Create connected account',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'authCode', type: 'string', required: false },
        { arg: 'error', type: 'string', required: false },
        { arg: 'errorDesc', type: 'string', required: false }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/create-connected-account' }
    });

};
