var elasticsearch=require('elasticsearch');

var client = new elasticsearch.Client( {
    hosts: [
        {
            "protocol": "https",
            "host": "search-peerbuds-ql7jgie76k6ul5rzrbj3e2adcm.us-east-1.es.amazonaws.com",
            "port": 443
        }
    ],
    connectionClass: require('http-aws-es'),
    amazonES: {
        "region": "us-east-1",
        "accessKey": "AKIAJNBGI45QDD7GUIFQ",
        "secretKey": "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"
    },
    apiVersion: "5.5",
    log: "trace",
    requestTimeout: 30000
});

module.exports = client;