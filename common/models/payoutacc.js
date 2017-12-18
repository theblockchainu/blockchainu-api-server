'use strict';
var app = require('../../server/server');
var request = require('request');
var client_secret = app.get('stripeKey'); //need to take it from config file
var stripe = require("stripe")(client_secret);

module.exports = function (PayoutAcc) {

    // Charge the user's card/bank account
    /**
     * Create connected account(Express account) by using below link
     * https://connect.stripe.com/express/oauth/authorize?response_type=code&client_id=ca_AlhauL6d5gJ66yM3RaXBHIwt0R8qeb9q&scope=read_write
     * it will redirect to stripe site where user will insert details and will come back to our site 
     * with auth code 
     */
    PayoutAcc.createConnectedAcc = function (req, authCode, error, errorDesc, cb) {

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
                    console.log(error);
                } else {
                    var authRes = JSON.parse(resBody);
                    if (!authRes.hasOwnProperty("error")) {
                        var connUser = authRes;
                        PayoutAcc.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs", {"ownedCollections": "payoutrules"}] }, function (err, peerInstance) {
                            if (!err && peerInstance !== null) {
                                var peerPayoutAccs = peerInstance.toJSON().payoutaccs;
                                if (peerPayoutAccs && !peerPayoutAccs.length)
                                    connUser.is_default = true;
                                peerInstance.payoutaccs.create(connUser, function (err, payoutAccountInstance) {
                                    if (err) {
                                        payoutAccountInstance.destroy();
                                        cb(err);
                                    } else {
                                        peerInstance.toJSON().ownedCollections.forEach((collection) => {
                                            if (collection.payoutrules === undefined) {
                                                // Create a new payout rule for this collection of user
                                                var payoutRule = {};
                                                payoutRule.percentage1 = 100;
                                                payoutRule.payoutId1 = payoutAccountInstance.id;

                                                PayoutAcc.app.models.collection.findById(collection.id, function(err, collectionInstance) {
                                                   if (err) {
                                                       console.log('cannot find collection with this ID');
                                                   }
                                                   else {
                                                       collectionInstance.payoutrules.create(payoutRule,
                                                           function (err, payoutRulesInstance) {
                                                               if (err) {
                                                                   payoutRulesInstance.destroy();
                                                                   cb(err);
                                                               }
                                                           });
                                                   }
                                                });
                                            }
                                        });
                                        cb(null, payoutAccountInstance);
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
    };

    PayoutAcc.retrieveConnectedAccs = function (req, cb) {
        //var loggedinPeer = req.cookies.userId.split(/[ \:.]+/)[1];
        var loggedinPeer = PayoutAcc.app.models.peer.getCookieUserId(req);
        // if user is logged in
        if (loggedinPeer) {
            //Remove user from Session
            console.log('logged in');
            PayoutAcc.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs"] }, function (err, peerInstance) {
                if (!err && peerInstance !== null) {
                    var peerPayoutAccs = peerInstance.toJSON().payoutaccs;
                    if (peerPayoutAccs) {
                        var stripeAccounts = [];
                        let requests = peerPayoutAccs.map((peerAccount) => {
                            return new Promise((resolve) => {
                                stripe.accounts.retrieve(
                                    peerAccount.stripe_user_id,
                                    function (err, account) {
                                        if (err) {
                                            console.log(err);
                                            resolve();
                                        } else {
                                            account.payoutaccount = peerAccount;
                                            stripeAccounts.push(account);
                                            resolve();
                                        }
                                    }
                                );
                            });
                        });
                        Promise.all(requests).then(() => {
                            cb(null, stripeAccounts)
                        });

                    }

                }
                else {
                    cb(err);
                }
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    };

    PayoutAcc.createLoginLink = function (req, accountId, cb) {
        var loggedinPeer = PayoutAcc.app.models.peer.getCookieUserId(req);
        // if user is logged in
        if (loggedinPeer) {
            stripe.accounts.createLoginLink(accountId, function (err, account) {
                if (err) {
                    cb(err);
                }
                else {
                    cb(null, account);
                }
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    };


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

    PayoutAcc.remoteMethod('retrieveConnectedAccs', {
        description: 'Retrieve connected account',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: {
            verb: 'get', path: '/retrieve-connected-accounts'
        }
    });

    PayoutAcc.remoteMethod('createLoginLink', {
        description: 'Create Login Link',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'accountId', type: 'string', required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: {
            verb: 'get', path: '/create-login-link'
        }
    });

};
