'use strict';

module.exports = function (Country) {


    Country.addCountries = function (cb) {

        var countries = require("../../countries.json");
        console.log("Adding country instance");
        console.log(countries);
        countries.forEach(function (country) {

            var newCountry = {};
            newCountry.name = country.name.official;
            newCountry.currency = country.currency;
            newCountry.callingCode = country.callingCode;
            newCountry.capital = country.capital;
            newCountry.region = country.region;
            newCountry.subregion = country.subregion;
            newCountry.latlng = country.latlng;
            newCountry.area = country.area;

            console.log(newCountry);
            Country.app.models.country.create(newCountry, function (err, newCountryInstance) {
                if (err) {
                    cb(err);
                } else {
                    console.log("Country " + newCountry.name + " added");
                }
            });
        }, this);
        cb(null);
    };

    Country.remoteMethod('addCountries', {
            description: 'Add countries',
            accepts: [],
            returns: { arg: 'contentObject', type: 'object', root: true },
            http: { verb: 'post', path: '/add-countries' }
        }
    );

};
