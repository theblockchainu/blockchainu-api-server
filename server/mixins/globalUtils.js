module.exports = function (Model, options) {
    'use strict';

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