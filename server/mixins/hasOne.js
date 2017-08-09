module.exports = function (Model, options) {
    'use strict';
    options.relations.forEach(function (element) {
        var modelName = element.model;
        var relation = element.hasManyRelation;

        Model.observe('after save', function (ctx, next, cb) {
            var data = {};
            if (element.autoCreate && !ctx.instance.disableHasOneCreate) {
                var currentId = ctx.instance.id;
                Model.findById(currentId, function (err, modelInstance) {
                    var relatedTo = modelInstance[relation];
                    relatedTo.count(function (err, count) {
                        if (err) {
                            console.log(err);
                            next(err);
                        } else {
                            if (count === 0) {
                                relatedTo.create(data, function (err, createdInstance) {
                                    if (err) {
                                        console.log(err);
                                        next(err);
                                    } else {
                                        console.log(createdInstance);
                                        next();
                                    }
                                });
                            } else {
                                console.log("Profile Already Exists");
                                next();
                            }
                        }
                    });
                });
            } else
                next();
        });
        Model['postOne_' + relation] = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    if (modelInstance) {
                        var relatedTo = modelInstance[relation];
                        relatedTo.count(function (err, count) {
                            if (err) {
                                cb(err);
                            } else {
                                if (count === 0) {
                                    relatedTo.create(data, function (err, createdInstance) {
                                        if (err) {
                                            cb(err)
                                        } else {
                                            cb(null, createdInstance);
                                        }
                                    });
                                } else {
                                    console.log("Profile Already Exists");
                                    cb();
                                }
                            }
                        });
                    } else {
                        console.log("Not Found");
                        cb();
                    }
                }
            });
        };

        Model['patchOne_' + relation] = function (id, data, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    if (modelInstance) {
                        console.log(modelInstance);
                        var relatedTo = modelInstance[relation];
                        relatedTo(function (err, instances) {
                            if (err) {
                                cb(err);
                            } else {
                                if (instances[0]) {
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
                                } else {
                                    console.log("not Added");
                                    cb();
                                }

                            }
                        });
                    } else {
                        console.log("Not Found");
                        cb();
                    }

                }

            });
        };

        Model['getOne_' + relation] = function (id, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    if (modelInstance) {
                        var relatedData = modelInstance[relation];
                        relatedData(function (err, instances) {
                            var instanceObj = instances[0];
                            cb(null, instanceObj);
                        });
                    } else {
                        console.log("Not Found");
                        cb();
                    }
                }
            });
        };

        Model['deleteOne_' + relation] = function (id, cb) {
            Model.findById(id, function (err, modelInstance) {
                if (err) {
                    cb(err);
                } else {
                    if (modelInstance) {
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
                    } else {
                        console.log("Not Found");
                        cb();
                    }

                }

            });
        };

        Model.remoteMethod(
            'postOne_' + relation,
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
            'patchOne_' + relation,
            {
                description: 'Update the single instance of child node for this parent node',
                accepts: [
                    { arg: 'id', type: 'string', required: true, description: 'id of the parent node' },
                    { arg: 'data', type: modelName, required: true, http: { source: 'body' } }
                ],
                // mixing ':id' into the rest url allows $owner to be determined and used for access control
                returns: { arg: modelName + 'Object', type: modelName, root: true },
                http: { path: '/:id/' + modelName, verb: 'patch' }
            }
        );

        Model.remoteMethod(
            'getOne_' + relation,
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
            'deleteOne_' + relation,
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