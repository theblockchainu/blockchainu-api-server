'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Collection) {


    Collection.submitForReview = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                //var ownerEmail = collectionInstance.toJSON().owners[0].email;
                collectionInstance.status = 'submitted';
                collectionInstance.isApproved = false;
                collectionInstance.save(function (err) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        console.log('collectionInstance updated');
                    }
                });

                var message = '', subject = '';
                switch (collectionInstance.type) {
                    case 'workshop':
                        message = { heading: "Your workshop has been submitted for review" };
                        subject = 'Workshop submitted for review';
                        break;
                    case 'experience':
                        message = { heading: "Your experience has been submitted for review" };
                        subject = 'Experience submitted for review';
                        break;
                    default:
                        message = { heading: "Your collection has been submitted for review" };
                        subject = 'Collection submitted for review';
                        break;
                }
                var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                var html_body = renderer(message);
                loopback.Email.send({
                    to: 'connect@aakashbansal.com',
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

                // Create payout rule for this collection
                var loggedinPeer = Collection.app.models.peer.getCookieUserId(req);
                Collection.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs"] },
                    function (err, peerInstance) {

                        var peerPayoutAccs = peerInstance.toJSON().payoutaccs;
                        if (peerPayoutAccs && peerPayoutAccs.length) {

                            peerPayoutAccs.forEach(function (payoutaccs) {

                                if (payoutaccs.is_default) {
                                    var payoutRule = {};
                                    payoutRule.percentage1 = 100;
                                    payoutRule.payoutId1 = payoutaccs.id;

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
                cb(null, 'Submitted for review. Email sent to user.');
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };


    Collection.approve = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                // var cookieArray = req.headers.cookie.split(';');
                // var cookie = '';
                // for (var i = 0; i< cookieArray.length; i++) {
                //     if(cookieArray[i].split('=')[0].trim() === 'userId') {
                //         cookie = cookieArray[i].split('=')[1].trim();
                //     }
                // }
                // var userId = cookie.split(/[ \:.]+/)[0].substring(4);
                var userId = Collection.app.models.peer.getCookieUserId(req);
                collectionInstance.status = 'active';
                collectionInstance.isApproved = true;
                collectionInstance.approvedBy = userId;
                collectionInstance.save(function (err) {
                    if (err) {
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                });
                var message = '', subject = '';
                switch (collectionInstance.type) {
                    case 'workshop':
                        message = { heading: "Your workshop has been APPROVED!" };
                        subject = 'Workshop Approved';
                        break;
                    case 'experience':
                        message = { heading: "Your experience has been APPROVED" };
                        subject = 'Experience Approved';
                        break;
                    default:
                        message = { heading: "Your collection has been APPROVED" };
                        subject = 'Collection Approved';
                        break;
                }
                var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                var html_body = renderer(message);
                loopback.Email.send({
                    to: 'connect@aakashbansal.com',
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

                cb(null, { result: 'Collection approved. Email sent to owner.' });
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };


    Collection.beforeRemote('prototype.patchAttributes', function (ctx, newInstance, next) {
        var collectionInstance = ctx.instance;
        /*console.log("ctx keys: " + Object.keys(ctx));
        console.log("ctx args: " + JSON.stringify(ctx.args));*/
        if (collectionInstance.status === 'draft' || collectionInstance.status === "" || collectionInstance.status === "submitted") {
            next();
        }
        if (ctx.args.data.status === 'complete') {
            next();
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        // This collection has existing participants on it. It cannot be edited without branching out.
                        //next(new Error(g.f("Cannot edit active collection with participants on it.")));

                        // Create a new collection by copying all the data of this collection
                        var newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        var updatedContentKeys = Object.keys(ctx.args.data);
                        updatedContentKeys.forEach(function (updatedContentKey) {
                            newCollection[updatedContentKey] = ctx.args.data[updatedContentKey];
                        });
                        newCollection.disableHasOneCreate = true;
                        console.log('new collection: ' + JSON.stringify(newCollection));

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                delete ctx.args.data;
                                ctx.args.data = {};
                                newCollectionInstance.isNewInstance = true;

                                // Create a relation between logged in user and this new collection node
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                                else {
                                                    next(err);
                                                }
                                            });
                                        });
                                    }
                                    else {
                                        next(err);
                                    }
                                });

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        console.log('Existing content instances are: ' + JSON.stringify(oldContentInstances));
                                        oldContentInstances.forEach(function (oldContentInstance) {
                                            // Link new clone to all existing contents.
                                            newCollectionInstance.__link__contents(oldContentInstance.id, function (err, newLinkedContentInstance) {
                                                if (!err && newLinkedContentInstance !== null) {
                                                    console.log('Linked content to collection');
                                                }
                                            });
                                        });
                                    }
                                    else {
                                        console.log(err);
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            var hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped moving calendar with participants');
                                            }
                                        });
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                ctx.res.json(newCollectionInstance.toJSON());
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can edit it but put it back in draft status.
                        ctx.args.data.status = 'draft';
                        next();
                    }
                });
            }
        }
    });



    Collection.beforeRemote('prototype.__updateById__contents', function (ctx, newInstance, next) {
        var collectionInstance = ctx.instance;
        /*console.log('received instance is: ' + JSON.stringify(collectionInstance));
        console.log("ctx args are: " + JSON.stringify(ctx.args));
        console.log("ctx method is: " + JSON.stringify(ctx.methodString));*/
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        if (ctx.args.data.status === 'complete') {
            next();
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        console.log('Existing participants: ' + JSON.stringify(participantInstances));

                        // This collection has existing participants on it. It cannot be edited without branching out.
                        //next(new Error(g.f("Cannot edit active collection with participants on it.")));

                        // Create a new collection by copying all the data of this collection
                        var newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;
                        console.log('new collection: ' + JSON.stringify(newCollection));

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                newCollectionInstance.isNewInstance = true;

                                // Get all owners of this collection and link them to cloned collection
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                            });
                                        });
                                    }
                                });

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        var m = 0;
                                        for (var i = 0; i < oldContentInstances.length; i++) {
                                            // If this content is not a dirty content
                                            if (oldContentInstances[i].id !== ctx.args.fk) {
                                                // Link new clone to all non-dirty contents.
                                                newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
                                                    if (!err && newLinkedContentInstance !== null) {
                                                        console.log('Linked non-dirty content to collection');
                                                    }
                                                    m++;
                                                });
                                            }
                                            // If this content is a dirty content.
                                            else {
                                                var newContent = {};
                                                newContent = oldContentInstances[i].toJSON();
                                                delete newContent.id;
                                                delete newContent.schedules;
                                                delete newContent.locations;
                                                newContent.disableHasOneCreate = true;
                                                var updatedContentKeys = Object.keys(ctx.args.data);
                                                updatedContentKeys.forEach(function (updatedContentKey) {
                                                    newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
                                                });

                                                // Create clone of dirty content for new collection
                                                newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
                                                    if (!err && newCreatedContentInstance !== null) {
                                                        console.log('Cloned content for collection');
                                                        var oldContentInstance = oldContentInstances[m].__data;
                                                        console.log('Old content instance has keys: ' + Object.keys(oldContentInstance));


                                                        // Copy locations from old content to new content
                                                        var newContentLocation = oldContentInstance.locations[0].toJSON();
                                                        console.log(typeof newContentLocation + " newContentLocation: " + JSON.stringify(newContentLocation));
                                                        if (typeof newContentLocation === 'object' && newContentLocation !== undefined) {
                                                            delete newContentLocation.id;
                                                            newCreatedContentInstance.__create__locations(newContentLocation, function (err, copiedLocationInstance) {
                                                                // Do nothing here.
                                                                console.log('Cloned location for content');
                                                            });
                                                        }


                                                        // Copy schedules from old content to new content
                                                        var newContentSchedule = oldContentInstance.schedules[0].toJSON();
                                                        console.log(typeof newContentSchedule + " newContentSchedule: " + JSON.stringify(newContentSchedule));
                                                        if (typeof newContentSchedule === 'object' && newContentSchedule !== undefined) {
                                                            delete newContentSchedule.id;
                                                            newCreatedContentInstance.__create__schedules(newContentSchedule, function (err, copiedScheduleInstance) {
                                                                // Do nothing here.
                                                                console.log('Cloned schedule for content');
                                                            });
                                                        }

                                                    }
                                                    m++;
                                                });
                                            }
                                        }
                                    }
                                    else {
                                        console.log(err);
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            //participantInstances = participantInstances.toJSON();
                                            var hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            console.log('hasParticipant: ' + hasParticipant);
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('Unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped cloning calendar with participants');
                                            }
                                        });
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                ctx.res.json(newCollectionInstance.toJSON());
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can edit it but put it back in draft status.
                        ctx.args.data.status = 'draft';
                        next();
                    }
                });
            }
            else {
                // Collection status is neither draft or active.
                next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
            }
        }
    });


    Collection.remoteMethod(
        'submitForReview',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                { arg: 'req', type: 'object', http: { source: 'req' } }
            ],
            returns: { arg: 'result', type: 'string' },
            http: { path: '/:id/submitForReview', verb: 'post' }
        }
    );

    Collection.remoteMethod(
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

};
