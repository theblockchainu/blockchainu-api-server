'use strict';
var app = require('../../server/server');
var request = require('request');
var client_secret = app.get('stripeKey'); //need to take it from config file

module.exports = function (PayoutAcc) {

    // Charge the user's card/bank account
    /**
     * Create connected account(Express account) by using below link
     * https://connect.stripe.com/express/oauth/authorize?response_type=code&client_id=ca_AlhauL6d5gJ66yM3RaXBHIwt0R8qeb9q&scope=read_write
     * it will redirect to stripe site where user will insert details and will come back to our site 
     * with auth code 
     */
    PayoutAcc.createConnectedAcc = function (req, authCode, error, errorDesc, cb) {

        //var loggedinPeer = req.cookies.userId.split(/[ \:.]+/)[1];
        var loggedinPeer = PayoutAcc.app.models.peer.getCookieUserId(req);
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
                        PayoutAcc.app.models.peer.findById(loggedinPeer, function (err, peerInstance) {
                            if (!err && peerInstance !== null) {
                                peerInstance.payoutaccs.create(connUser, function (err, connUserInstance) {
                                    if (err) {
                                        connUserInstance.destroy();
                                        cb(err);
                                    } else {
                                        cb(null, connUserInstance);
                                    }
                                });
                            }
                            else {
                                cb(err);
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

    PayoutAcc.remoteMethod('createConnectedAcc', {
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
