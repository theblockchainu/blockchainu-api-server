'use strict';
let request = require('request-promise-native');
let moment = require('moment');
let Promise = require('bluebird');

module.exports = function (Corestacktoken) {

    Corestacktoken.getTokenObject = function () {
        const now = moment();
        console.log('Finding Corestack Token');
        return Corestacktoken
            .find()
            .then(tokenInstances => {
                if (tokenInstances.length > 0) {
                    const tokenObject = JSON.parse(tokenInstances[0].stringifiedObject);
                    const endMoment = moment.utc(tokenObject.data.token.expires_at);
                    if (tokenObject.status === 'success' && tokenObject.data.token !== null && endMoment.isAfter(now.add(5, 'minutes'))) {
                        console.log('found valid corestack token in local DB');
                        return Promise.resolve(tokenObject);
                    } else {
                        return this.generateToken();
                    }
                } else {
                    return this.generateToken();
                }
            })
            .catch(err => {
                return Promise.reject(err);
            });
    };

    Corestacktoken.generateToken = function () {
        console.log('Generating New Corestack Token');
        return Corestacktoken.destroyAll()
            .then(res => {
                return request
                    .post({
                        url: Corestacktoken.app.get('corestackUrl') + '/v1/auth/tokens',
                        json: true,
                        body: {
                            'username': Corestacktoken.app.get('corestackUserName'),
                            'password': Corestacktoken.app.get('corestackPassword')
                        }
                    });
            }).then((body) => {
                if (body.status = 'success') {
                    return Corestacktoken.create(
                        {
                            stringifiedObject: JSON.stringify(body)
                        }
                    );
                } else {
                    return Promise.reject(body);
                }
            })
            .then(tokenInstance => {
                console.log('corestack tokenSavedtoDB');
                // console.log(tokenInstance);
                const tokenObject = JSON.parse(tokenInstance.stringifiedObject);
                return Promise.resolve(tokenObject);
            });
    };

};
