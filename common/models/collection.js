'use strict';
var loopback = require('loopback');
var path = require('path');
var g = require('../../node_modules/loopback/lib/globalize');

module.exports = function (Collection) {


    Collection.afterRemote('prototype.__link__participants', function (ctx, participantInstance, next) {
        // New participant added to collection. Notify collection owner.
        var collectionInstance = ctx.instance;
        Collection.app.models.peer.findById(participantInstance.sourceId, {"include": "profiles"}, function(err, participantUserInstance) {
            if (err) {
                next(err);
            }
            else {
                // Link all topics of this collection to the participant as topics learning
                collectionInstance.__get__topics({}, function (err, topicInstances) {
                    if (!err) {
                        topicInstances.forEach(topicInstance => {
                            participantUserInstance.__link__topicsLearning(topicInstance.id, function(err1, linkedTopicInstance) {
                                if (!err1) {
                                    console.log('Linked topic ' + topicInstance.name + ' to ' + participantUserInstance.toJSON().profiles[0].first_name);
                                }
                                else {
                                    console.log(err1);
                                }
                            });
                        });
                    }
                    else {
                        console.log(err);
                    }
                });
                collectionInstance.__get__owners({"include": "profiles"}, function(err, ownerInstances){
                    if(err) {
                        next(err);
                    }
                    else {
                        var ownerInstance = ownerInstances[0];
                        ownerInstance.__create__notifications({
                            type: "action",
                            title: "New participant!",
                            description: "%username% joined %collectionTitle%",
                            actionUrl: [collectionInstance.type,collectionInstance.id,"calendar",participantInstance.calendarId]
                        }, function(err, notificationInstance) {
                            if(err) {
                                next(err);
                            }
                            else {
                                notificationInstance.actor.add(participantInstance.sourceId, function(err, actorInstance){
                                    if(err){
                                        next(err);
                                    }
                                    else {
                                        notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                            if(err) {
                                                next(err);
                                            }
                                            else {
                                                // Send email to the student welcoming him to course
                                                var message = { heading: "Welcome to this workshop. \n\n- Learn\n\n- Collaborate\n\n- Practice"};
                                                var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                                                var html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: participantUserInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: '[Get Set Go] ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ' + response);
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                // Send email to the teacher informing about new student
                                                message = { heading: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " has just joined " + collectionInstance.title};
                                                html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: ownerInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: 'New Participant @ ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ' + response);
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                next();
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });

    Collection.afterRemote('prototype.__unlink__participants', function (ctx, next1) {
        // Participant canceled collection. Notify collection owner.
        var collectionInstance = ctx.instance;
        var participantId = ctx.args.fk;
        Collection.app.models.peer.findById(participantId, {"include": "profiles"}, function(err, participantUserInstance) {
            if (err) {
                next1(err);
            }
            else {
                collectionInstance.__get__owners({"include": "profiles"}, function(err, ownerInstances){
                    if(err) {
                        next1(err);
                    }
                    else {
                        var ownerInstance = ownerInstances[0];
                        ownerInstance.__create__notifications({
                            type: "action",
                            title: "Cancelled participation",
                            description: "%username% cancelled participation for %collectionTitle%",
                            actionUrl: [collectionInstance.type,collectionInstance.id]
                        }, function(err, notificationInstance) {
                            if(err) {
                                next1(err);
                            }
                            else {
                                notificationInstance.actor.add(participantId, function(err, actorInstance){
                                    if(err){
                                        next1(err);
                                    }
                                    else {
                                        notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                            if(err) {
                                                next(err);
                                            }
                                            else {
                                                // Send email to the confirming cancellation
                                                var message = { heading: "You have cancelled your participation for - " + collectionInstance.title + ". \n\n If you are eligible for a refund, it'll be credited to your account in 7 working days."};
                                                var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                                                var html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: participantUserInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: 'Participation cancelled : ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ' + response);
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                // Send email to the teacher informing about cancelled student
                                                message = { heading: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " has dropped out of " + collectionInstance.title};
                                                html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: ownerInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: 'Dropped student @ ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ' + response);
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                ctx.res.json(participantUserInstance);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });


    Collection.submitForReview = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, function (err, collectionInstance) {
            var loggedinPeer = Collection.app.models.peer.getCookieUserId(req);
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

                // Create payout rule for this collection
                Collection.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs"] },
                    function (err, peerInstance) {

                        loopback.Email.send({
                            to: peerInstance.toJSON().email,
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
        Collection.findById(id, {"include": {"owners": "profiles"}}, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                var ownerId = collectionInstance.toJSON().owners[0].id;
                var userId = Collection.app.models.peer.getCookieUserId(req);
                collectionInstance.status = 'active';
                collectionInstance.isApproved = true;
                collectionInstance.approvedBy = userId;
                delete collectionInstance.owners;
                Collection.upsertWithWhere({id: collectionInstance.id}, collectionInstance, function(err, newCollectionInstance) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
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

                        // Send email to owner of this workshop
                        Collection.app.models.peer.findById(ownerId, {"include": "profiles"}, function (err, ownerInstance) {

                            if (!err) {
                                // Send notification to owner
                                ownerInstance.__create__notifications({
                                    type: "action",
                                    title: collectionInstance.type + " Approved!",
                                    description: "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.",
                                    actionUrl: [collectionInstance.type,collectionInstance.id,"edit","16"]
                                }, function(err, notificationInstance) {
                                    if(err) {
                                        cb(err);
                                    }
                                    else {
                                        notificationInstance.actor.add(ownerInstance.id, function(err, actorInstance){
                                            if(err){
                                                cb(err);
                                            }
                                            else {
                                                notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                                    if(err) {
                                                        cb(err);
                                                    }
                                                    else {
                                                        cb(null, { result: 'Collection approved. Email sent to owner.' });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });

                                loopback.Email.send({
                                    to: ownerInstance.email,
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
                            }
                            else {
                                cb(err);
                            }
                        });
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


    Collection.beforeRemote('prototype.patchAttributes', function (ctx, newInstance, next) {
        var collectionInstance = ctx.instance;
        if (collectionInstance.status === 'draft' || collectionInstance.status === "" || collectionInstance.status === "submitted") {
            //console.log('collection status draft or blank or submitted');
            next();
        }
        else if (ctx.args.data.status === 'complete') {
            next();
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                console.log('collection status active');
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        // This collection has existing participants on it. It cannot be edited without branching out.
                        // Create a new collection by copying all the data of this collection
                        var newCollection = collectionInstance.toJSON();

                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;

                        var updatedContentKeys = Object.keys(ctx.args.data);
                        updatedContentKeys.forEach(function (updatedContentKey) {
                            newCollection[updatedContentKey] = ctx.args.data[updatedContentKey];
                        });

                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;

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
                                        var hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            var hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
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
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
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




    Collection.beforeRemote('prototype.__updateById__contents', function (ctx, newInstance, next)   {
        var collectionInstance = ctx.instance;
        /*console.log('received instance is: ' + JSON.stringify(collectionInstance));
        console.log("ctx args are: " + JSON.stringify(ctx.args));
        console.log("ctx method is: " + JSON.stringify(ctx.methodString));*/
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        else if (ctx.args.data.status === 'complete') {
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

                        // Create a new collection by copying all the data of this collection
                        var newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;
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

                                var resultContents = [];

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        var m = 0;
                                        for (var i = 0; i < oldContentInstances.length; i++) {
                                            // If this content is not a dirty content
                                            if (oldContentInstances[i].id !== ctx.args.fk) {
                                                // Add content to array to pass in result
                                                resultContents.push(oldContentInstances[i]);
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

                                                var updatedContentKeys = Object.keys(ctx.args.data);
                                                updatedContentKeys.forEach(function (updatedContentKey) {
                                                    newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
                                                });

                                                delete newContent.id;
                                                delete newContent.schedules;
                                                delete newContent.locations;
                                                newContent.disableHasOneCreate = true;
                                                newContent.isNewInstance = true;

                                                // Add content to array to pass in result
                                                resultContents.push(newContent);
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
                                        var resultCollectionInstance = newCollectionInstance.toJSON();
                                        resultCollectionInstance['contents'] = resultContents;
                                        ctx.res.json(resultCollectionInstance);
                                    }
                                    else {
                                        console.log(err);
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        var hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            //participantInstances = participantInstances.toJSON();
                                            var hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            console.log('hasParticipant: ' + hasParticipant);
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
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
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
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

                                // Copy payoutrules from old collection to new collection
                                collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
                                    if (!err && oldPayoutInstances !== null) {
                                        oldPayoutInstances.forEach(function (oldPayoutInstance) {
                                            newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
                                                // Do nothing here.
                                                console.log('Copied payoutrules for new collection');
                                            });

                                        });
                                    }
                                });
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

    Collection.beforeRemote('prototype.__create__contents', function (ctx, newInstance, next)   {
        console.log('***** ADDING NEW CONTENT TO ACTIVE COLLECTION');
        var collectionInstance = ctx.instance;
        /*console.log('received instance is: ' + JSON.stringify(collectionInstance));
        console.log("ctx args are: " + JSON.stringify(ctx.args));
        console.log("ctx method is: " + JSON.stringify(ctx.methodString));*/
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        else if (ctx.args.data.status === 'complete') {
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

                        // Create a new collection by copying all the data of this collection
                        var newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;
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

                                var resultContents = [];

                                // Create new content for this collection
                                var newContent = {};
                                var updatedContentKeys = Object.keys(ctx.args.data);
                                updatedContentKeys.forEach(function (updatedContentKey) {
                                    newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
                                });
                                newContent.isNewInstance = true;
                                // Create clone of dirty content for new collection
                                newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
                                    if (!err && newCreatedContentInstance !== null) {
                                        console.log('Created content for collection');
                                        // Add content to array to pass as result
                                        resultContents.push(newCreatedContentInstance.toJSON());

                                        var resultCollectionInstance = newCollectionInstance.toJSON();
                                        resultCollectionInstance['contents'] = resultContents;
                                        ctx.res.json(resultCollectionInstance);
                                    }
                                    else {
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        var m = 0;
                                        for (var i = 0; i < oldContentInstances.length; i++) {
                                            // Add content to array to pass as result
                                            resultContents.push(oldContentInstances[i]);
                                            // Link new clone to all non-dirty contents.
                                            newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
                                                if (!err && newLinkedContentInstance !== null) {
                                                    console.log('Linked existing content to collection');
                                                }
                                                m++;
                                            });
                                        }
                                    }
                                    else {
                                        console.log(err);
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        var hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            //participantInstances = participantInstances.toJSON();
                                            var hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            console.log('hasParticipant: ' + hasParticipant);
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
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
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
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

                                // Copy payoutrules from old collection to new collection
                                collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
                                    if (!err && oldPayoutInstances !== null) {
                                        oldPayoutInstances.forEach(function (oldPayoutInstance) {
                                            newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
                                                // Do nothing here.
                                                console.log('Copied payoutrules for new collection');
                                            });

                                        });
                                    }
                                });
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
