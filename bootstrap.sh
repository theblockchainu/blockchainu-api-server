#!/usr/bin/env bash

apt-get update
sudo apt-get install python-software-properties



curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt-get install nodejs
node -v
npm -v
sudo npm install -g loopback-cli
npm install pm2@latest -g
cd /vagrant/server
pm2 start server.js
pm2 startup

echo "deb http://httpredir.debian.org/debian jessie-backports main" | sudo tee -a /etc/apt/sources.list.d/jessie-backports.list
sudo apt-get update
wget -O - https://debian.neo4j.org/neotechnology.gpg.key | sudo apt-key add -
echo 'deb http://debian.neo4j.org/repo stable/' | sudo tee -a /etc/apt/sources.list.d/neo4j.list
sudo apt-get update
sudo apt-get install neo4j
sudo service neo4j start