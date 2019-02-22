#!/bin/sh

##Command to run : sh ethereum_userdata_script.sh <DESTINATION_BLOB_URL> <DESTINATION_FILE_NAME> <ETHEREUM_USERNAME> <ETHEREUM_PASSWORD> <EMAIL> <HOST_NAME>


#Variables for Ethereum User data script

LOCAL_PATH=/var/www/corestack/solidity
GIT_CLONE_URL={{GIT_CLONE_URL}}
DESTINATION_BLOB_ACCESS_KEY=CoUKPhUEHAdeTheoklCVenhv6P90DI8oZnb0HnM5F87KyVDDaPaxH7sP138Quwklr7DoApabOdVAKNkRThkogA==

DESTINATION_BLOB_URL=$1
DESTINATION_FILE_NAME=$2
ETHEREUM_USERNAME=$3
ETHEREUM_PASSWORD=$4
EMAIL=$5
HOST_NAME=$6

#-----------------------------------------------------------------------
#The git project will be downloaded in the given path
#-----------------------------------------------------------------------

cd $LOCAL_PATH
rm -rf *
git clone $GIT_CLONE_URL
chmod -R 777 *
sudo touch $LOCAL_PATH/keys.json



#-----------------------------------------------------------------------
#Start ganache-cli and Add Crontab
#-----------------------------------------------------------------------

sudo ganache-cli --host 0.0.0.0 --acctKeys $LOCAL_PATH/keys.json &
crontab -l | { cat; echo "@reboot /usr/bin/ganache-cli --host 0.0.0.0 --acctKeys $LOCAL_PATH/keys.json &"; } | crontab -


#-----------------------------------------------------------------------
#Upload the keys.json to AzureBlob
#-----------------------------------------------------------------------

#Sleep command is used to wait till the keys.json file gets generated after starting the ganache-cli

sleep 60
azcopy --quiet --source $LOCAL_PATH/keys.json --destination $DESTINATION_BLOB_URL/$DESTINATION_FILE_NAME.json --dest-key $DESTINATION_BLOB_ACCESS_KEY


#-----------------------------------------------------------------------
#Create user in WebIDE
#-----------------------------------------------------------------------

#Authenticate API
curl --cookie-jar cachefile -X POST 'http://127.0.0.1/WebIDE/components/user/controller.php?action=authenticate' -F username=corestack -F password=corestack@123
#Create User API
curl --cookie cachefile -X POST 'http://127.0.0.1/WebIDE/components/user/controller.php?action=create' -F username=$ETHEREUM_USERNAME -F password=$ETHEREUM_PASSWORD


#-----------------------------------------------------------------------
#Install SSL Certificate
#-----------------------------------------------------------------------

rm -rf ~/.local/share/letsencrypt && rm -rf /etc/letsencryp* && rm -rf /var/log/letsencrypt* && rm -rf /var/lib/letsencrypt && rm -rf /etc/apache2/sites-enabled/apache2-le* && rm -rf /etc/apache2/sites-avaiable/apache2-le*

sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update
sudo dpkg --configure -a
sudo apt-get install python-certbot-apache -y

certbot-auto certonly \
  --agree-tos \
  --non-interactive \
  --text \
  --rsa-key-size 4096 \
  --email $EMAIL\
  --apache  \
  --domains "$HOST_NAME"


sed -i 's/virtualenv --no-site-packages/virtualenv --no-download --no-site-packages/' /usr/sbin/certbot-auto

certbot-auto certonly \
  --agree-tos \
  --non-interactive \
  --text \
  --rsa-key-size 4096 \
  --email $EMAIL\
  --apache  \
  --domains "$HOST_NAME"


sudo service apache2 restart
sed -i "s#/etc/ssl/certs/ssl-cert-snakeoil.pem#/etc/letsencrypt/live/$HOST_NAME/cert.pem#g" /etc/apache2/sites-available/default-ssl.conf
sed -i "s#/etc/ssl/private/ssl-cert-snakeoil.key#/etc/letsencrypt/live/$HOST_NAME/privkey.pem#g" /etc/apache2/sites-available/default-ssl.conf
sed -i "s#/etc/apache2/ssl.crt/server-ca.crt#/etc/letsencrypt/live/$HOST_NAME/chain.pem#g" /etc/apache2/sites-available/default-ssl.conf
sudo service apache2 restart

#-----------------------------------------------------------------------
#Start Wetty and Add Crontab
#-----------------------------------------------------------------------

sudo /usr/bin/node /root/wetty/app.js --sslkey /etc/letsencrypt/live/$HOST_NAME/privkey.pem --sslcert /etc/letsencrypt/live/$HOST_NAME/cert.pem -p 3000 &

crontab -l | { cat; echo "@reboot /usr/bin/node /root/wetty/app.js --sslkey /etc/letsencrypt/live/$HOST_NAME/privkey.pem --sslcert /etc/letsencrypt/live/$HOST_NAME/cert.pem -p 3000 &"; } | crontab -

