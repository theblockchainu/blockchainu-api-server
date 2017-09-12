'use strict';

module.exports = function (Timezone) {

    Timezone.addTimeZones = function (cb) {

        var timezones = require("../../timezones.json");
        console.log("Adding timezones");
        Timezone.app.models.timezone.create(timezones, function (err, timezoneInstances) {
            if (err) {
                cb(err);
            } else {
                console.log(timezoneInstances);
                cb(null, timezoneInstances);
            }
        });
    };

    Timezone.remoteMethod('addTimeZones', {
        description: 'Add Timezones',
        accepts: [],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/add-timezones' }
    }
    );

};
