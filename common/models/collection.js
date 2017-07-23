'use strict';

module.exports = function (Collection) {


    // Collection.afterRemote('prototype.patchAttributes', function (ctx, collectionInstance, next) {

    //     if (collectionInstance.bio_image.length > 0) {
    //         console.log("Updated bio_image. Creating relation between media and collection");
    //         /*
    //          Create a relation 'hasMedia' between peer node and collection node
    //          */
    //         Collection.dataSource.connector.execute(
    //             "MATCH (c:collection {id: '" + collectionInstance.id + "'}),(m:media {url: '" + collectionInstance.bio_image + "'}) MERGE (c)-[r:hasMedia]->(m) RETURN r",
    //             function (err, results) {
    //                 if (err) {
    //                     next();
    //                 }
    //                 else {
    //                     next();
    //                 }
    //             }
    //         );
    //     }

    //     if (collectionInstance.bio_video.length > 0) {
    //         console.log("Updated bio_video. Creating relation between media and collection");
    //         /*
    //          Create a relation 'hasMedia' between peer node and collection node
    //          */
    //         Collection.dataSource.connector.execute(
    //             "MATCH (c:collection {id: '" + collectionInstance.id + "'}),(m:media {url: '" + collectionInstance.bio_video + "'}) MERGE (c)-[r:hasMedia]->(m) RETURN r",
    //             function (err, results) {
    //                 if (err) {
    //                     next();
    //                 }
    //                 else {
    //                     next();
    //                 }
    //             }
    //         );
    //     }

    // });

};
