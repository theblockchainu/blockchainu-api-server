'use strict';
var CronJob = require('cron').CronJob;
var client = require('../esConnection.js');
var bulk = [];

module.exports = function setupCron(server) {

    var makebulk = function(modelInstances, modelName, callback){
        bulk = [];
        for (var current in modelInstances){
            bulk.push(
                { index: {_index: 'testdata', _type: modelName, _id: modelInstances[current].id } },
                modelInstances[current]
            );
        }
        callback(bulk);
    };

    var indexall = function(madebulk, modelName, callback) {
        client.bulk({
            maxRetries: 5,
            index: 'testdata',
            type: modelName,
            body: madebulk
        },function(err,resp,status) {
            if (err) {
                console.log(err);
            }
            else {
                callback(resp.items);
            }
        })
    };

    // Setup cron to index data on ES
    var indexingJob = new CronJob('00 00 * * * *', function() {

        console.log("Running indexing cron job every hour.");

        // Index all peers
        server.models.peer.find(function (err, peerInstances) {
            makebulk(peerInstances, 'peer', function(response){
                console.log("Indexing Peers: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'peer', function(response){
                        console.log(response);
                    });
                }

            });
        });

        // Index all collections
        server.models.collection.find(function (err, collectionInstances) {
            makebulk(collectionInstances, 'collection', function(response){
                console.log("Indexing Collections: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'collection', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contents
        server.models.content.find(function (err, contentInstance) {
            makebulk(contentInstance, 'content', function(response){
                console.log("Indexing Contents: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'content', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all topics
        server.models.topic.find(function (err, topicInstances) {
            makebulk(topicInstances, 'topic', function(response){
                console.log("Indexing Topics: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'topic', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contacts
        server.models.contact.find(function (err, contactInstances) {
            makebulk(contactInstances, 'contact', function(response){
                console.log("Indexing Contacts: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'contact', function(response){
                        console.log(response);
                    });
                }
            });
        });

    }, function() {
        // Callback function when job ends.
    },
    true,
    'UTC'
    );
};