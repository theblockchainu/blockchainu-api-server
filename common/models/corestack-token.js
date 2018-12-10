'use strict';
let request = require('request-promise-native');
let moment = require('moment');

module.exports = function (Corestacktoken) {

    Corestacktoken.getTokenObject = function () {
        const now = moment();
        console.log('Finding Token');
        return Corestacktoken
            .find()
            .then(tokenInstances => {
                if (tokenInstances.length > 0) {
                    const tokenObject = JSON.parse(tokenInstances[0].stringifiedObject);
                    if (tokenObject.status === 'success' && tokenObject.data.token !== null && moment(tokenObject.data.token.expires_at).isAfter(now.add(10, 'minutes'))) {
                        console.log('Token Found in DB');
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
        console.log('Generating Token');
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
                console.log('tokenSavedtoDB');
                console.log(tokenInstance);
                const tokenObject = JSON.parse(tokenInstance.stringifiedObject);
                return Promise.resolve(tokenObject);
            });
    };

};