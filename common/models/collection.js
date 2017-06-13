'use strict';

module.exports = function (Collection) {

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

    Collection.afterRemote('prototype.__create__reviews', function (ctx, newInstance, next) {
        if (ctx.req.user) {
            var userId = ctx.req.user.id;
            //console.log(ctx);
            Collection.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    console.log("");
                });
            });
        } else
            console.log("User Not Signed in!");
        next();
    });
};
