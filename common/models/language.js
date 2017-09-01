'use strict';

module.exports = function (Language) {

    Language.addLanguages = function (cb) {

        var languages = require("../../languages.json");

        console.log("Adding Language instance");

        var index = 1;
        for (var langCode in languages) {

            if (languages.hasOwnProperty(langCode) && languages[langCode].type === "living") {

                console.log(index);
                var language = languages[langCode];
                var newLanguage = {};
                // newLanguage = language;
                newLanguage.code = langCode;
                newLanguage.name = language.referenceName;
                // delete newLanguage.referenceName
                console.log(newLanguage);

                Language.app.models.language.create(newLanguage, function (err, newLanguageInstance) {
                    if (!err) {
                        console.log("Language " + newLanguageInstance.name + " added");
                    }
                });
                index++;
            }
        }
        cb(null);
    };

    Language.remoteMethod('addLanguages', {
        description: 'Add Languages',
        accepts: [],
        returns: { arg: 'contentObject', type: 'object', root: true },
        http: { verb: 'post', path: '/add-languages' }
    }
    );
};
