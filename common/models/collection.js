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

};
