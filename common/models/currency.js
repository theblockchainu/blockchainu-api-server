'use strict';

module.exports = function (Currency) {

    Currency.addCurrencies = function (cb) {

        var currencies = require("../../currencies.json");

        console.log("Adding Currency instance");

        var index = 1;
        for (var currCode in currencies) {

            if (currencies.hasOwnProperty(currCode)) {

                //console.log(index);
                var currency = currencies[currCode];
                //console.log(currency);

                Currency.app.models.currency.create(currency, function (err, newCurrencyInstance) {
                    if (!err) {
                        console.log("Currency " + newCurrencyInstance.name + " added");
                    }
                });
                index++;
            }
        }
        cb(null);
    };

    Currency.remoteMethod('addCurrencies', {
        description: 'Add Currencies',
        accepts: [],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/add-currencies' }
    }
    );
};
