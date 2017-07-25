'use strict';
var stripe = require('stripe')('sk_test_mjuDwEmXkxA1ewmsqgDdPCWT');
var app = require('../../server/server');

module.exports = function (Transaction) {

    //Customer related functions here
    Transaction.getCustomer = function (req, customerId, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.retrieve(
                customerId,
                function (err, customer) {
                    if (!err)
                        cb(err, customer);
                    else
                        cb(err);
                }
            );
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.createCustomer = function (data, cb) {

        var User = app.models.peer;
        stripe.customers.create({
            email: data.email,
        }, function (err, customer) {
            if (err)
                cb(err);
            else {
                User.findById(data.id, function (err, peerInstance) {
                    if (err) {
                        cb(err);
                    } else {
                        peerInstance.stripeCustId = customer.id;
                        User.upsert(peerInstance, function (err, modifiedPeerInstance) {
                            if (err)
                                cb(err);
                            else
                                cb(err, modifiedPeerInstance);
                        });
                    }
                });
            }
        });
    }

    Transaction.editCustomer = function (req, customerId, data, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.update(customerId, data, function (err, customer) {
                if (err)
                    cb(err);
                else
                    cb(err, customer);
            });

        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    //Sources and Cards related functions here

    /**
     * data - should contain type of source, 
     * token - generated after card info, 
     * stripe customer id 
     */
    Transaction.createSource = function (req, customer, data, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {
            createCardOrBankAcc(customer, data, cb);
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    function createCardOrBankAcc(customer, data, cb) {

        var requestData = {};
        if (data.hasOwnProperty("token"))
            requestData.source = data.token;
        else
            requestData = data
        stripe.customers.createSource(customer, requestData,
            function (err, card) {
                if (err) {
                    cb(err)
                } else {
                    cb(null, card);
                }
            });
    }

    /*
    function createSourceForCustomer(type, token, customer, cb) {
        stripe.sources.create({
            type: type,
            token: token,
        }, function (err, source) {
            if (err) {
                cb(err)
            } else {
                stripe.customers.createSource(customer, {
                    source: source.id
                });
                cb(null, source);
            }
        });
    }
    */

    Transaction.getACard = function (req, customerId, cardId, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.retrieveCard(
                customerId, cardId, function (err, card) {
                    if (!err)
                        cb(err, card);
                    else
                        cb(err);
                }
            );
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.listAllCards = function (req, customerId, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.listCards(
                customerId, function (err, cards) {
                    if (!err)
                        cb(err, cards);
                    else
                        cb(err);
                }
            );
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.editCard = function (req, customerId, cardId, data, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {
            stripe.customers.updateCard(customerId, cardId, data, function (err, card) {
                if (err)
                    cb(err);
                else
                    cb(err, card);
            });

        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.deleteCard = function (req, customerId, cardId, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {
            stripe.customers.deleteCard(customerId, cardId, function (err, card) {
                if (err)
                    cb(err);
                else
                    cb(err, card);
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    // Bank Account related functions goes here

    Transaction.retriveBankAccount = function (req, customerId, accId, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.retrieveSource(
                customerId, accId, function (err, external_account) {
                    if (!err)
                        cb(err, external_account);
                    else
                        cb(err);
                }
            );
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.listBankAccounts = function (req, customerId, cb) {
        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.customers.listSources(
                customerId, { limit: 5, object: "bank_account" }, function (err, bank_accounts) {
                    if (!err)
                        cb(err, bank_accounts);
                    else
                        cb(err);
                }
            );
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.editBankAccount = function (req, customerId, accId, data, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {
            stripe.customers.updateSource(customerId, accId, data, function (err, bank_account) {
                if (err)
                    cb(err);
                else
                    cb(err, bank_account);
            });

        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.deleteBankAccount = function (req, customerId, accId, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {
            stripe.customers.deleteSource(customerId, accId, function (err, acc) {
                if (err)
                    cb(err);
                else
                    cb(err, acc);
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }



    // Charge related functions here

    // Charge the user's card/bank account
    Transaction.createCharge = function (req, reqObj, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            var charge = stripe.charges.create(reqObj, function (err, charge) {

                if (!err) {
                    var currTime = new Date().toISOString();
                    charge.charge_id = charge.id;
                    delete charge.id;
                    charge.source = JSON.stringify(charge.source);
                    charge.fraud_details = JSON.stringify(charge.fraud_details);
                    charge.metadata = JSON.stringify(charge.metadata);
                    charge.refunds = JSON.stringify(charge.refunds);
                    charge.outcome = JSON.stringify(charge.outcome);
                    charge.created = currTime;
                    charge.modified = currTime;
                    console.log(JSON.stringify(charge));

                    loggedinPeer.transactions.create(charge, function (err, chargeInstance) {
                        // Transaction.app.models.transaction.create(charge, function (err, chargeInstance) {
                        if (err) {
                            chargeInstance.destroy();
                            cb(err);
                        } else {
                            cb(null, charge);
                        }
                    });
                } else
                    cb(err);
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    Transaction.transferFund = function (req, data, cb) {

        var loggedinPeer = req.user;
        //if user is logged in
        if (loggedinPeer) {

            stripe.transfers.create(data, function (err, transfer) {
                if (err)
                    cb(err);
                else {
                    loggedinPeer.transactions.create(transfer, function (err, transferInstance) {
                        if (err) {
                            transferInstance.destroy();
                            cb(err);
                        } else {
                            cb(null, transfer);
                        }
                    });
                }
            });
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    }

    // Customer Remote methods
    Transaction.remoteMethod('getCustomer', {
        description: 'Get Customer',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/get-customer/:customerId' }
    });

    Transaction.remoteMethod('editCustomer', {
        description: 'Edit Customer',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'data', type: 'object', http: { source: 'body' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'put', path: '/edit-customer/:customerId' }
    }
    );

    // Card/Source Remote methods
    Transaction.remoteMethod('createSource', {
        description: 'Add Source',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
        { arg: 'data', type: 'object', http: { source: 'body' }, required: true }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/create-source/:customerId' }
    }
    );

    Transaction.remoteMethod('getACard', {
        description: 'Get a Card',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
        { arg: 'cardId', type: 'string', http: { source: 'path' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/get-a-card/:customerId/:cardId' }
    });

    Transaction.remoteMethod('listAllCards', {
        description: 'List all cards',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/list-all-cards/:customerId' }
    });


    Transaction.remoteMethod('editCard', {
        description: 'Edit Card',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'cardId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'data', type: 'object', http: { source: 'body' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'put', path: '/edit-card/:customerId/:cardId' }
    }
    );

    Transaction.remoteMethod('deleteCard', {
        description: 'Delete Card',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'cardId', type: 'string', http: { source: 'path' }, required: true },
        ],
        http: { verb: 'delete', path: '/delete-card/:customerId/:cardId' }
    }
    );

    // Bank Accounts methods
    Transaction.remoteMethod('retriveBankAccount', {
        description: 'Retrieve Bank Account',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
        { arg: 'accId', type: 'string', http: { source: 'path' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/retrieve-bankaccount/:customerId/:accId' }
    });

    Transaction.remoteMethod('listBankAccounts', {
        description: 'List all accounts',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'get', path: '/list-bankaccounts/:customerId' }
    });

    Transaction.remoteMethod('editBankAccount', {
        description: 'Edit Card',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'accId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'data', type: 'object', http: { source: 'body' }, required: true }
        ],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'put', path: '/edit-bankaccount/:customerId/:accId' }
    }
    );

    Transaction.remoteMethod('deleteBankAccount', {
        description: 'Delete Account',
        accepts: [
            { arg: 'req', type: 'object', http: { source: 'req' } },
            { arg: 'customerId', type: 'string', http: { source: 'path' }, required: true },
            { arg: 'accId', type: 'string', http: { source: 'path' }, required: true },
        ],
        http: { verb: 'delete', path: '/delete-bankaccount/:customerId/:accId' }
    }
    );


    // Charge Remote methods
    Transaction.remoteMethod('createCharge', {
        description: 'Add Charge',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        {
            arg: 'data', type: 'object', http: { source: 'body' },
            description: "data should match as mentioned by stripe charges api", required: true
        }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/create-charge' }
    }
    );

    // Transfer Fund - Remote methods
    Transaction.remoteMethod('transferFund', {
        description: 'Transfer Funds',
        accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } },
        {
            arg: 'data', type: 'object', http: { source: 'body' },
            description: "data should match as mentioned by stripe transfer api", required: true
        }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/transfer-fund' }
    }
    );
};
