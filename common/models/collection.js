'use strict';

module.exports = function (Collection) {

    // TODO: @abhijeet: Refactor this code to create a peer-[hasCollection] relation.
    /*Collection.afterRemote('create', function (ctx, collectionInstance, next) {
        console.log("Creating relation between peer and collection");
        /!*
         Create a relation 'hasCollection' between peer node and collection node
         *!/
        Collection.dataSource.connector.execute(
            "MATCH (c:collection {id: '" + collectionInstance.id + "'}),(p:peer {id: '" + collectionInstance.peerId + "'}) MERGE (p)-[r:hasCollection]->(c) RETURN r",
            function (err, results) {
                if (err) {
                    next();
                }
                else {
                    next();
                }
            }
        );
    });*/

    Collection.afterRemote('prototype.__create__comments', function (ctx, newInstance, next) {
        
        if (ctx.req.user) {
            var userId = ctx.req.user.id;
            Collection.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    console.log("Relation created between comment and peer.");
                });
            });
        } else
            console.log("User Not Signed in!");
        next();
    });

    Collection.afterRemote('prototype.__create__upvotes', function (ctx, newInstance, next) {
        
        if (ctx.req.user) {
            var userId = ctx.req.user.id;
            Collection.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    console.log("Relation created between upvote and peer.");
                });
            });
        } else
            console.log("User Not Signed in!");
        next();
    });

    Collection.afterRemote('prototype.__create__downvotes', function (ctx, newInstance, next) {
        
        if (ctx.req.user) {
            var userId = ctx.req.user.id;
            Collection.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    console.log("Relation created between downvotes and peer.");
                });
            });
        } else
            console.log("User Not Signed in!");
        next();
    });

    Collection.afterRemote('prototype.patchAttributes', function (ctx, collectionInstance, next) {

        if (collectionInstance.bio_image.length > 0) {
            console.log("Updated bio_image. Creating relation between media and collection");
            /*
             Create a relation 'hasMedia' between peer node and collection node
             */
            Collection.dataSource.connector.execute(
                "MATCH (c:collection {id: '" + collectionInstance.id + "'}),(m:media {url: '" + collectionInstance.bio_image + "'}) MERGE (c)-[r:hasMedia]->(m) RETURN r",
                function (err, results) {
                    if (err) {
                        next();
                    }
                    else {
                        next();
                    }
                }
            );
        }
        if (collectionInstance.bio_video.length > 0) {
            console.log("Updated bio_video. Creating relation between media and collection");
            /*
             Create a relation 'hasMedia' between peer node and collection node
             */
            Collection.dataSource.connector.execute(
                "MATCH (c:collection {id: '" + collectionInstance.id + "'}),(m:media {url: '" + collectionInstance.bio_video + "'}) MERGE (c)-[r:hasMedia]->(m) RETURN r",
                function (err, results) {
                    if (err) {
                        next();
                    }
                    else {
                        next();
                    }
                }
            );
        }

    });


    // TODO: @abhijeet: refactor this code. Create a create hook in content.js and add the code to create a calendar model instance automatically.
    /*Collection.addNewContents = function (data, id, cb) {
        console.log("Creating new content instance");

        var content = {
            title: data.title,
            type: data.type,
            url: data.url,
            created: data.created,
            modified: data.modified
        };

        Collection.app.models.content.create(content, function (err, newContentInstance) {
            if (err) {
                cb(err);
            }
            else {

                if (data.calendar !== null) {
                    var calendar = JSON.parse(data.calendar);
                    calendar.content_id = newContentInstance.id;
                    Collection.app.models.content_calendar.create(calendar, function (err, contentCalendarInstance) {
                        if (err) {
                            newContentInstance.destroy();
                            cb(err);
                        }

                        console.log("Created calendar instance for this content instance");
                        console.log(contentCalendarInstance);
                        /!*
                         NEW: Content -[hasCalendar]-> ContentCalendar
                         *!/
                        Collection.dataSource.connector.execute(
                            "MATCH (c:content {id: '" + newContentInstance.id + "'}),(n:content_calendar {id: '" + contentCalendarInstance.id + "'}) MERGE (c)-[r:hasCalendar]->(n) RETURN n",
                            function (err, results) {
                                if (err) {
                                    console.log("Error linking calendar to content");
                                }
                                else {
                                    console.log("Linked calendar to content");
                                }
                            }
                        );


                        /!*
                         NEW: Collection -[hasContent]-> Content
                         *!/
                        Collection.dataSource.connector.execute(
                            "MATCH (c:collection {id: '" + id + "'}),(d:content {id: '" + newContentInstance.id + "'}) MERGE (c)-[r:hasContent]->(d) RETURN d",
                            function (err, results) {
                                if (err) {
                                    cb(err);
                                }
                                else {
                                    cb(null, results);
                                }
                            }
                        );
                    });
                }
                else {

                }
            }
        });
    };*/


    // TODO: @abhijeet: refactor this code to create a new remote method for Invite User API
    /*Collection.addNewParticipants = function (data, id, cb) {
        console.log("Creating new peer_invite instance");

        var peer_invite = {
            name: data.name,
            email: data.email,
            status: 'pending',
            created: data.created,
            modified: data.modified
        };
        Collection.app.models.peer_invite.create(peer_invite, function (err, newPeerInviteInstance) {
            if (err) {
                cb(err);
            }
            else {
                /!*
                 NEW: Collection -[hasInvited]-> PeerInvite
                 *!/
                Collection.dataSource.connector.execute(
                    "MATCH (c:collection {id: '" + id + "'}),(p:peer_invite {id: '" + newPeerInviteInstance.id + "'}) MERGE (c)-[r:hasInvited]->(p) RETURN p",
                    function (err, results) {
                        if (err) {
                            cb(err);
                        }
                        else {
                            cb(null, results);
                        }
                    }
                );
            }
        });
    };*/

    /**
     * TODO: @abhijeet: CREATE FOLLOWING REMOTE METHODS USING JSON APPROACH --> Invite User **/


};
