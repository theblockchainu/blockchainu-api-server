'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Collection) {


    Collection.submitForReview = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if(!err && collectionInstance !== null && req.hasOwnProperty('user')) {
                var userId = req.user.id;
                collectionInstance.status = 'submitted';
                collectionInstance.isApproved = false;
                collectionInstance.save(function (err) {
                    if(err) {
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                });
                Collection.app.models.peer.findById(userId, function (err, userInstance) {
                    if (err) {
                        err = new Error(g.f('No logged in user with ID: %s', userId));
                        err.statusCode = 400;
                        err.code = 'NO_LOGGED_IN_USER';
                        cb(err);
                    } else {
                        var message = '', subject = '';
                        switch (collectionInstance.type) {
                            case 'workshop':
                                message = {heading: "Your workshop has been submitted for review"};
                                subject = 'Workshop submitted for review';
                                break;
                            case 'experience':
                                message = {heading: "Your experience has been submitted for review"};
                                subject = 'Workshop submitted for review';
                                break;
                            default:
                                message = {heading: "Your collection has been submitted for review"};
                                subject = 'Collection submitted for review';
                                break;
                        }
                        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                        var html_body = renderer(message);
                        loopback.Email.send({
                            to: userInstance.email,
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

                        cb(null, 'Submitted for review. Email sent to user.');
                    }
                });
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };


    /*Collection.beforeRemote('prototype.save', function(ctx, collectionInstance, next){
        if(!ctx.isNewInstance) {
            console.log('inside collection update hook');
            var collectionInstance = ctx.currentInstance;
            if (collectionInstance.status === 'draft') {
                next();
            }
            else {
                // User is trying to update a non draft collection
                // We need to check if this collection is active and if it has any participants.
                if (collectionInstance.status === 'active') {
                    collectionInstance.__get__participants(function (err, participantInstances) {
                        if (err) {
                            next(err);
                        }
                        else if (participantInstances !== null) {
                            // This collection has existing participants on it. It cannot be edited without branching out.
                            //next(new Error(g.f("Cannot edit active collection with participants on it.")));

                            // Create a new collection by copying all the data of this collection
                            var newCollection = collectionInstance;
                            console.log(JSON.stringify(ctx));
                            var updatedContentKeys = Object.keys(ctx.data);
                            updatedContentKeys.forEach(function (updatedContentKey) {
                                newCollection[updatedContentKey] = ctx.data[updatedContentKey];
                            });

                            Collection.create(newCollection, function (err, newCollectionInstance) {
                                if (err) {
                                    next(err);
                                }
                                else {
                                    delete ctx.data;
                                    ctx.data = {};
                                    ctx.result = newCollectionInstance;
                                    next();
                                }
                            });
                        }
                        else {
                            // This collection has no participants on it. We can edit it but put it back in draft status.
                            ctx.data.status = 'draft';
                            next();
                        }
                    });
                }
            }
        }
        else {
            next();
        }
    });*/


    Collection.remoteMethod(
        'submitForReview',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                {arg: 'req', type: 'object', http: { source: 'req'}}
            ],
            returns: { arg: 'result', type: 'string'},
            http: { path: '/:id/submitForReview', verb: 'post' }
        }
    );

};
