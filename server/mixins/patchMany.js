module.exports = function (Model, options) {
    'use strict';
    options.relations.forEach(function (element) {
        var modelName = element.model;
        var relation = element.hasManyRelation;

        Model['linkMany_' + relation] = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    var relatedModel = modelInstance[relation];
                    var targetIds = data.targetIds;
                    if (targetIds.constructor === Array) {
                        targetIds.forEach(function (id) {
                            relatedModel.add(id, function (err, instanceData) {
                                if (err) {
                                    console.log(err);
                                    cb(err);
                                } else {
                                    console.log(instanceData);
                                }
                            });
                        }, this);
                        cb(null, true);
                    } else {
                        cb(err, "Please input Array targetIds:[]");
                    }
                }
            });
        };
        Model['unlinkMany_' + relation] = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    var relatedModel = modelInstance[relation];
                    var targetIds = data.targetIds;
                    if (targetIds.constructor === Array) {
                        targetIds.forEach(function (id) {
                            relatedModel.remove(id, function (err, instanceData) {
                                if (err) {
                                    console.log(err);
                                    cb(err);
                                } else {
                                    console.log(instanceData);
                                }
                            });
                        }, this);
                        cb(null, true);
                    } else {
                        cb(err, "Please input Array targetIds:[]");
                    }
                }
            });
        };


        Model.remoteMethod(
            'linkMany_' + relation,
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'data', type: 'object', required: true, http: { source: 'body' } }
                ],
                description: "Links " + relation + " (please provide targetIds:[])",
                returns: { arg: 'Object', type: 'object', root: true },
                http: { path: '/:id/' + relation + '/rel', verb: 'patch' }
            }
        );
        Model.remoteMethod(
            'unlinkMany_' + relation,
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'data', type: 'object', required: true, http: { source: 'body' } }
                ],
                description: "Unlinks " + relation + " (please provide targetIds:[])",
                returns: { arg: 'Object', type: 'object', root: true },
                http: { path: '/:id/' + relation + '/rel', verb: 'delete' }
            }
        );
    }, this);


};