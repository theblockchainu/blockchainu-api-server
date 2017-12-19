'use strict';
var app = require('../../server/server');
var stripeKey = app.get('stripeKey');
var stripe = require('stripe')(stripeKey);
var path = require('path');
var loopback = require('../../node_modules/loopback/lib/loopback');

module.exports = function (Transaction) {

    //Customer related functions here
    /**
     * customerId = stripe customer id
     */
    Transaction.getCustomer = function (req, customerId, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Create stripe customer account by using email id
     * and update peer node by adding stripe customer id 
     */
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
    };

    /**
     * edit stripe customer
     * params - 
     * customerId - stripe customer id
     * data => ref https://stripe.com/docs/api#customer_object
     */
    Transaction.editCustomer = function (req, customerId, data, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);

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
    };

    //Sources and Cards related functions here

    /**
     * data - should contain type of source, 
     * 
     * token inside data - generated from card detail page,
     * if its bank account details from which source to be created 
     * then reffer https://stripe.com/docs/api#customer_bank_account_object 
     * customer - stripe customer id 
     */
    Transaction.createSource = function (req, customer, data, cb) {
        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);

        //if user is logged in
        if (loggedinPeer) {
            createCardOrBankAcc(customer, data, cb);
        } else {
            var err = new Error('Invalid access');
            err.code = 'INVALID_ACCESS';
            cb(err);
        }
    };

    function createCardOrBankAcc(customer, data, cb) {

        var requestData = {};
        if (data.hasOwnProperty("token"))
            requestData.source = data.token;
        else
            requestData = data;
        stripe.customers.createSource(customer, requestData,
            function (err, card) {
                if (err) {
                    cb(err)
                } else {
                    cb(null, card);
                }
            });
    }


    /**
     * Get a card details by card id for customer from customer id 
     */
    Transaction.getACard = function (req, customerId, cardId, cb) {
        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Get all card details for customer by customer id 
     */
    Transaction.listAllCards = function (req, customerId, cb) {
        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Edit card details by card id for customer by customer id 
     * data - https://stripe.com/docs/api#card_object
     */
    Transaction.editCard = function (req, customerId, cardId, data, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Delete card details by card id for customer by customer id 
     */
    Transaction.deleteCard = function (req, customerId, cardId, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    // Bank Account related functions goes here
    /**
     * Retrive bank details by account id for customer by customer id 
     */
    Transaction.retriveBankAccount = function (req, customerId, accId, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * List all bank accounts for customer by customer id 
     */
    Transaction.listBankAccounts = function (req, customerId, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Edit bank account by account id for customer by customer id
     * data - https://stripe.com/docs/api#customer_bank_account_object
     */
    Transaction.editBankAccount = function (req, customerId, accId, data, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };

    /**
     * Delete bank account by account id for customer by customer id
     */
    Transaction.deleteBankAccount = function (req, customerId, accId, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
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
    };



    // Charge related functions here

    // Charge the user's card/bank account
    /**
     * Create charge - to charge the customer
     * reqObj - https://stripe.com/docs/api#charge_object
     * this can be used in connected account charge
     */
    Transaction.createCharge = function (req, chargeItem, chargeItemId, reqObj, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
        //if user is logged in
        if (loggedinPeer) {

            var charge = stripe.charges.create(reqObj, function (err, charge) {

                if (!err) {
                    var currTime = new Date().toISOString();
                    var chargeSourceJson = charge.source;
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

                    Transaction.app.models.peer.findById(loggedinPeer, function (err, peerInstance) {
                        if (!err && peerInstance !== null) {
                            peerInstance.transactions.create(charge, function (err, chargeInstance) {
                                if (err) {
                                    chargeInstance.destroy();
                                    cb(err);
                                } else {

                                    // Link collection to payment
                                    if (chargeItem === 'collection') {
                                        Transaction.app.models.collection.findById(chargeItemId, function (err, collection) {
                                            collection.__link__payments(chargeInstance, function (err, collectionPaymentInstance) {
                                                if (!err && collectionPaymentInstance !== null) {
                                                    console.log('Payment made for collection');
                                                }
                                            });
                                        });
                                    }
                                    // Send receipt email to user
                                    var message = { cardBrand: chargeSourceJson.brand, cardLast4: chargeSourceJson.last4, cardName: chargeSourceJson.name, amount: reqObj.amount / 100, currency: reqObj.currency, chargeId: chargeInstance.id};
                                    var renderer = loopback.template(path.resolve(__dirname, '../../server/views/paymentReceipt.ejs'));
                                    var html_body = renderer(message);
                                    loopback.Email.send({
                                        to: peerInstance.email,
                                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                        subject: 'Your payment receipt',
                                        html: html_body
                                    })
                                        .then(function (response) {
                                            console.log('email sent! - ');
                                        })
                                        .catch(function (err) {
                                            console.log('email error! - ' + err);
                                        });
                                    cb(null, charge);
                                }
                            });
                        }
                        else {
                            cb(err);
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
    };

    /**
     * Transfer the ammount from stripe to card or bank account
     * data - https://stripe.com/docs/api#transfer_object
     */
    Transaction.transferFund = function (req, data, cb) {

        var loggedinPeer = Transaction.app.models.peer.getCookieUserId(req);
        //if user is logged in
        if (loggedinPeer) {

            stripe.transfers.create(data, function (err, transfer) {
                if (err)
                    cb(err);
                else {
                    transfer.transfer_id = transfer.id;
                    delete transfer.id;
                    transfer.metadata = JSON.stringify(transfer.metadata);
                    transfer.reversals = JSON.stringify(transfer.reversals);
                    Transaction.app.models.peer.findById(loggedinPeer, function (err, peerInstance) {
                        if (!err && peerInstance !== null) {
                            peerInstance.transactions.create(transfer, function (err, transferInstance) {
                                if (err) {
                                    transferInstance.destroy();
                                    cb(err);
                                } else {
                                    cb(null, transfer);
                                }
                            });
                        }
                        else {
                            cb(err);
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
        { arg: 'chargeItem', type: 'string', http: { source: 'path' }, required: true },
        { arg: 'chargeItemId', type: 'string', http: { source: 'path' }, required: true },
        {
            arg: 'data', type: 'object', http: { source: 'body' },
            description: "data should match as mentioned by stripe charges api", required: true
        }],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/create-charge/:chargeItem/:chargeItemId' }
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
