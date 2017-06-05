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
        "accessKey": "AKIAJEQ5JJ2KPRFGDMYA",
        "secretKey": "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"
    },
    apiVersion: "_default",
    log: "trace",
    requestTimeout: 30000
});

module.exports = client;