module.exports = function (Model, options) {
    'use strict';

    Model.observe('before delete', function (ctx, next) {
        //get the ID of the item being deleted.
        if (ctx.where.id) {
            var itemId = ctx.where.id;
            Model.dataSource.connector.execute(
                "match (c:"+Model.modelName+"{id:'"+itemId+"'})-[*]->(n) detach delete n",
                function (err, results) {
                    if (err) {
                        next(err);
                    }
                    else {
                        next();
                    }
                }
            );
        } else {
            var err = new Error("ID for the model to delete not found. Check your query.");
            err.statusCode = 400;
            console.log(err.toString());
            next(err);
        }
    });

    if(options.hasOwnProperty('relationName')) {
        options.relationName.forEach(function (relation) {

            var methodName = 'prototype.__link__' + relation;

            Model.afterRemote(methodName, function (ctx, newInstance, next) {
                console.log('linking newInstance: ' + JSON.stringify(newInstance));

                // get the data from req body and add those properties to created relation.
                if(ctx.req.body !== null) {
                    console.log(JSON.stringify(ctx.req.body));
                    var inputBody = ctx.req.body;
                    var inputBodyKeys = Object.keys(inputBody);
                    var hasAdditionalKeys = false;
                    inputBodyKeys.forEach(function(inputKey) {
                        if(inputKey !== 'sourceId' && inputKey !== 'targetId') {
                            newInstance.inputKey = inputBody.inputKey;
                            hasAdditionalKeys = true;
                        }
                    }) ;
                    if(hasAdditionalKeys) {
                        newInstance.save(function (err) {
                            if (!err) {
                                console.log('relation instance updated');
                            }
                        });
                    }
                }
                next();
            });
        }, this);
    }

};