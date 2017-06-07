'use strict';
var CronJob = require('cron').CronJob;
var client = require('../esConnection.js');
var bulk = [];

module.exports = function setupCron(server) {

    var makebulk = function(modelInstances, modelName, callback){
        bulk = [];
        for (var current in modelInstances){
            bulk.push(
                { index: {_index: 'data', _type: modelName, _id: modelInstances[current].id } },
                modelInstances[current]
            );
        }
        callback(bulk);
    };

    var indexall = function(madebulk, modelName, callback) {
        client.bulk({
            maxRetries: 5,
            index: 'data',
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
                console.log("Bulk content prepared: " + JSON.stringify(response));
                indexall(response, 'peer', function(response){
                    console.log(response);
                })
            });
        });

        // Index all collections
        server.models.collection.find(function (err, collectionInstances) {
            makebulk(collectionInstances, 'collection', function(response){
                console.log("Bulk content prepared: " + JSON.stringify(response));
                indexall(response, 'collection', function(response){
                    console.log(response);
                })
            });
        });

        // Index all topics
        server.models.topic.find(function (err, topicInstances) {
            makebulk(topicInstances, 'topic', function(response){
                console.log("Bulk content prepared: " + JSON.stringify(response));
                indexall(response, 'topic', function(response){
                    console.log(response);
                })
            });
        });
    }, function() {
        // Callback function when job ends.
    },
    true,
    'UTC'
    );
};