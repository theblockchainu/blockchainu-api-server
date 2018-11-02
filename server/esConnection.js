var elasticsearch=require('elasticsearch');

var client = new elasticsearch.Client( {
    hosts: [
        {
            "protocol": "https",
            "host": "search-theblockchainu-lffodx6wmavggohb6y3uamyrze.us-east-1.es.amazonaws.com",
            "port": 443
        }
    ],
    connectionClass: require('http-aws-es'),
    amazonES: {
        "region": "us-east-1",
        "accessKey": "AKIAJ2ZSU5G465EDNDLA",
        "secretKey": "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"
    },
    apiVersion: "6.x",
    log: "error",
    requestTimeout: 30000
});

module.exports = client;