module.exports = function (Model, options) {
    'use strict';
    var modelToName = options.modelTo;
    var methodName = 'patch' + modelToName;

    Model.patchHasOne = function (id, data, cb) {

        //  console.log(Model.app);
        var modelTo = Model.app.loopback.getModel(modelToName);
        //console.log(modelTo);
        switch(modelToName)
        {
            case 'profile':
                var modelTo=profile;
                break;
        }
        Peer.find();
        Model.modelTo.find({ where: { userId: id }, limit: 1 }, function (err, profileArray) {
            if (err) {
                cb(err)
            }
            else {
                console.log(profileArray);
                var profileInstance = profileArray[0];
                profileInstance.updateAttributes(data, function (err, updatedInstance) {
                    if (err) {
                        cb(err);
                    } else {
                        console.log(updatedInstance);
                        cb(null, updatedInstance);
                    }
                });
            }
        });
    };

    Model.remoteMethod(
        'patchHasOne',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                { arg: 'data', type: modelToName, required: true, http: { source: 'body' } }
            ],
            // mixing ':id' into the rest url allows $owner to be determined and used for access control
            http: { path: '/:id/' + modelToName, verb: 'patch' }
        }
    );
};