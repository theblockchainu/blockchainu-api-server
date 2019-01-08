#!/bin/sh

##Command to run : sh ethereum_userdata_script.sh <DESTINATION_BLOB_URL> <DESTINATION_FILE_NAME>


#Variabled for Ethereum User data script

LOCAL_PATH=/var/www/corestack/solidity 
GIT_CLONE_URL={{GIT_CLONE_URL}}
DESTINATION_BLOB_ACCESS_KEY=yv+MfKG+SoqyAwGFCV+0xaJGRqqETZ3vewN94GPK6wfII//Eeb9S+iteLzMRKr2PE+DQ5iJQzVH3y8Ogo+fTvA==



#The git project will be downloaded in the given path

cd $LOCAL_PATH
rm -rf *
git clone $GIT_CLONE_URL
chmod -R 777 *
sudo touch $LOCAL_PATH/keys.json


#Start ganache-cli

sudo ganache-cli --host 0.0.0.0 --acctKeys $LOCAL_PATH/keys.json &


#Upload the keys.json to AzureBlob
#Sleep command is used to wait till the keys.json file gets generated after starting the ganache-cli

sleep 60
azcopy --quiet --source $LOCAL_PATH/keys.json --destination $1/$2.json --dest-key $DESTINATION_BLOB_ACCESS_KEY
