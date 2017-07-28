'use strict';
var loopback = require('loopback');
var path = require('path');

module.exports = function (Collection) {


    Collection.afterRemote('prototype.patchAttributes', function (ctx, collectionInstance, next) {

        if(collectionInstance.stage === "12" &&  collectionInstance.type === "workshop") {
            // Send email to peer
            if(ctx.req.hasOwnProperty('user') && ctx.req.user !== null) {
                var userId = ctx.req.user.id;
                Collection.app.models.peer.findById(userId, function (err, instance) {
                    if (err) {
                        console.log("User Not Found");
                    } else {
                        var message = {heading: "Your workshop has been submitted for review"};
                        var renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                        var html_body = renderer(message);
                        loopback.Email.send({
                            to: instance.email,
                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                            subject: 'Workshop submitted for Review',
                            html: html_body
                        })
                        .then(function (response) {
                            console.log('email sent! - ' + response);
                        })
                        .catch(function (err) {
                            console.log('email error! - ' + err);
                        });
                    }
                });
            }
        }

        next();

         /*if (collectionInstance.bio_image.length > 0) {
             console.log("Updated bio_image. Creating relation between media and collection");
             /!*
              Create a relation 'hasMedia' between peer node and collection node
              *!/
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
             /!*
              Create a relation 'hasMedia' between peer node and collection node
              *!/
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
         }*/

     });

};
