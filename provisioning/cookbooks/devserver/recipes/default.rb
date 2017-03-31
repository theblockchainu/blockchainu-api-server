#
# Cookbook:: devserver
# Recipe:: default
#
# Copyright:: 2017, The Authors, All Rights Reserved.

include_recipe 'apt::default'
package 'python-software-properties'
#include_recipe 'nodejs::nodejs_from_package'
#include_recipe "nodejs::npm"
#nodejs_npm 'loopback-cli'
include_recipe 'pm2::default'
pm2_application 'apiserver' do
  script 'server.js'
  cwd '/vagrant/server'
  action [:deploy, :start_or_restart, :startup]
end