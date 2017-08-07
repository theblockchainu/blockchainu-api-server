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
    apiVersion: "5.x",
    log: "trace",
    requestTimeout: 30000
    /*settings : {
        "number_of_shards": 1,
        "analysis" : {
            "filter" : {
                "autocomplete_filter": {
                    "type" : "edge_ngram",
                    "min_gram" : 1,
                    "max_gram" : 20
                }
            },
            "analyzer" : {
                "autocomplete": {
                    "type" : "custom",
                    "tokenizer": "standard",
                    "filter" : [
                        "lowercase",
                        "autocomplete_filter"
                    ]
                }
            }
        }
    }*/
});

module.exports = client;