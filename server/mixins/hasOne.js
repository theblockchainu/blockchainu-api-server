module.exports = function (Model, options) {
    'use strict';
    options.relations.forEach(function (element) {
        var modelName = element.model;
        var relation = element.hasManyRelation;

        Model.postOne = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                var relatedTo = modelInstance[relation];
                relatedTo.count(function (err, count) {
                    if (err) {
                        cb(err);
                    } else {
                        if (count == 0) {
                            relatedTo.create(data, function (err, createdInstance) {
                                if (err) {
                                    cb(err)
                                } else {
                                    cb(null, createdInstance);
                                }
                            });
                        } else {
                            cb(null, "Profile Already Exists");
                        }
                    }
                });
            });
        };

        Model.patchOne = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                var relatedTo = modelInstance[relation];
                relatedTo(function (err, instances) {
                    if (err) {
                        cb(err);
                    } else {
                        var objId = instances[0].id;
                        var originalModel = Model.app.models[modelName];
                        originalModel.upsertWithWhere({ "id": objId }, data, function (err, updatedInstance) {
                            if (err) {
                                cb(err)
                            }
                            else {
                                cb(null, updatedInstance)
                            }
                        });
                    }
                });
            });
        };

        Model.getOne = function (id, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    var relatedData = modelInstance[relation];
                    relatedData(function (err, instances) {
                        var instanceObj = instances[0];
                        cb(null, instanceObj);
                    });
                }
            });
        };

        Model.deleteOne = function (id, cb) {
            Model.findById(id, function (err, modelInstance) {
                var relatedTo = modelInstance[relation];
                relatedTo(function (err, instances) {
                    if (err) {
                        cb(err);
                    } else {
                        var objId = instances[0].id;
                        var originalModel = Model.app.models[modelName];
                        originalModel.destroyById(objId, function (err, result) {
                            if (err) {
                                cb(err)
                            }
                            else {
                                cb(null, result);
                            }
                        });
                    }
                });
            });
        };

        Model.remoteMethod(
            'postOne',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'data', type: modelName, required: true, http: { source: 'body' } }
                ],
                // mixing ':id' into the rest url allows $owner to be determined and used for access control
                returns: { arg: modelName + 'Object', type: modelName, root: true },
                http: { path: '/:id/' + modelName, verb: 'post' }
            }
        );

        Model.remoteMethod(
            'patchOne',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                    { arg: 'data', type: modelName, required: true, http: { source: 'body' } }
                ],
                // mixing ':id' into the rest url allows $owner to be determined and used for access control
                returns: { arg: modelName + 'Object', type: modelName, root: true },
                http: { path: '/:id/' + modelName, verb: 'patch' }
            }
        );

        Model.remoteMethod(
            'getOne',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true },
                ],
                // mixing ':id' into the rest url allows $owner to be determined and used for access control
                returns: { arg: modelName + 'Object', type: modelName, root: true },
                http: { path: '/:id/' + modelName, verb: 'get' }
            }
        );
        Model.remoteMethod(
            'deleteOne',
            {
                accepts: [
                    { arg: 'id', type: 'string', required: true }
                ],
                // mixing ':id' into the rest url allows $owner to be determined and used for access control
                http: { path: '/:id/' + modelName, verb: 'delete' }
            }
        );
    }, this);


};