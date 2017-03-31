#!/bin/bash

# required settings
NODE_NAME="$(curl --silent --show-error --retry 3 http://169.254.169.254/latest/meta-data/instance-id)" # this uses the EC2 instance ID as the node name
REGION="us-west-2" # use one of us-east-1, us-west-1, eu-west-1
CHEF_SERVER_NAME="chef-automate-pb-dev" # The name of your Chef Server
CHEF_SERVER_ENDPOINT="chef-automate-pb-dev-9ys6bvyfllzbhhzm.us-west-2.opsworks-cm.io" # The FQDN of your Chef Server

# optional
CHEF_ORGANIZATION="default"    # AWS OpsWorks for Chef Server always creates the organization "default"
NODE_ENVIRONMENT=""            # E.g. development, staging, onebox ...
CHEF_CLIENT_VERSION="12.16.42" # latest if empty

# recommended: upload the chef-client cookbook from the chef supermarket  https://supermarket.chef.io/cookbooks/chef-client
# Use this to apply sensible default settings for your chef-client config like logrotate and running as a service
# you can add more cookbooks in the run list, based on your needs
RUN_LIST="" # e.g. "recipe[chef-client],recipe[apache2]"

# ---------------------------
set -e -o pipefail

AWS_CLI_TMP_FOLDER=$(mktemp --directory "/tmp/awscli_XXXX")
CHEF_CA_PATH="/etc/chef/opsworks-cm-ca-2016-root.pem"

install_aws_cli() {
  # see: http://docs.aws.amazon.com/cli/latest/userguide/installing.html#install-bundle-other-os
  cd "$AWS_CLI_TMP_FOLDER"
  curl --retry 3 -L -o "awscli-bundle.zip" "https://s3.amazonaws.com/aws-cli/awscli-bundle.zip"
  unzip "awscli-bundle.zip"
  ./awscli-bundle/install -i "$PWD"
}

aws_cli() {
  "${AWS_CLI_TMP_FOLDER}/bin/aws" opsworks-cm --region "${REGION}" --output text "$@" --server-name "${CHEF_SERVER_NAME}"
}

associate_node() {
  client_key="/etc/chef/client.pem"
  mkdir /etc/chef
  ( umask 077; openssl genrsa -out "${client_key}" 2048 )

  aws_cli associate-node \
    --node-name "${NODE_NAME}" \
    --engine-attributes \
    "Name=CHEF_ORGANIZATION,Value=${CHEF_ORGANIZATION}" \
    "Name=CHEF_NODE_PUBLIC_KEY,Value='$(openssl rsa -in "${client_key}" -pubout)'"
}

write_chef_config() {
  (
    echo "chef_server_url   'https://${CHEF_SERVER_ENDPOINT}/organizations/${CHEF_ORGANIZATION}'"
    echo "node_name         '${NODE_NAME}'"
    echo "ssl_ca_file       '${CHEF_CA_PATH}'"
  ) >> /etc/chef/client.rb
}

install_chef_client() {
  # see: https://docs.chef.io/install_omnibus.html
  curl --silent --show-error --retry 3 --location https://omnitruck.chef.io/install.sh | bash -s -- -v "${CHEF_CLIENT_VERSION}"
}

install_trusted_certs() {
  curl --silent --show-error --retry 3 --location --output "${CHEF_CA_PATH}" \
    "https://opsworks-cm-${REGION}-prod-default-assets.s3.amazonaws.com/misc/opsworks-cm-ca-2016-root.pem"
}

wait_node_associated() {
  aws_cli wait node-associated --node-association-status-token "$1"
}

install_aws_cli
node_association_status_token="$(associate_node)"
install_chef_client
write_chef_config
install_trusted_certs
wait_node_associated "${node_association_status_token}"

if [ -z "${NODE_ENVIRONMENT}" ]; then
  chef-client -r "${RUN_LIST}"
else
  chef-client -r "${RUN_LIST}" -E "${NODE_ENVIRONMENT}"
fi


