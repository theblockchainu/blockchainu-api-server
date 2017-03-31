Overview
========

This zip file starts you out with a simple example of a Chef repository that is preconfigured to work with an AWS OpsWorks Chef Automate server.
In this repository, you store cookbooks, roles, configuration files, and other artifacts for managing systems with Chef.
It is recommended that you store this repository in a version control system such as Git, and treat it like source code.

Repository Directories
======================

This repository contains several directories. Each directory contains a README file that describes the directory's purpose,
and how to use it for managing your systems with Chef.

* `cookbooks/` - Cookbooks that you download or create.
* `roles/` - Stores roles in .rb or .json in the repository.
* `environments/` - Stores environments in .rb or .json in the repository.

Configuration
=============

`.chef` is a hidden directory that contains a knife configuration file (knife.rb) and the secret authentication key (private.pem).

* .chef/knife.rb
* .chef/private.pem

The `knife.rb` file is configured so that knife operations will run against the AWS OpsWorks managed Chef Automate server.

To get started, download and install the [Chef DK](https://downloads.chef.io/chef-dk).
After installation, use the Chef `knife` utility to manage the Chef Automate server.
For more information, see the [Chef documentation for knife](https://docs.chef.io/knife.html).

Quick-start Example
===================

Use Berkshelf to get cookbooks from a remote source and install an Apache Web Server
------------------------------------------------------------------------------------

Berkshelf is a tool to help you manage cookbooks and their dependencies. It downloads a specified cookbook into
local storage, also called the Berkshelf. You can specify which cookbooks and versions to use with your Chef server
and upload them. This Starter Kit contains a file, named Berksfile, that can contain your cookbooks.
Also included is the `chef-client` cookbook that configures the Chef client agent software on each node that you connect to your Chef server.
To learn more about this cookbook, see [Chef Client Cookbook](https://supermarket.chef.io/cookbooks/chef-client) in the Chef Supermarket.

1. Using a text editor, append another cookbook to your Berksfile to install software; for example, to install
the Apache web server application. Your Berksfile should resemble the following.
```
source 'https://supermarket.chef.io'
cookbook 'chef-client'
cookbook 'apache2'
```

2. Download and install the cookbooks on your local computer.
```
berks vendor
```

3. Upload the cookbook. You'll need to specify the CA-signed certificate that is included with the Starter Kit.
On Linux:
```
SSL_CERT_FILE='.chef/ca_certs/opsworks-cm-ca-2016-root.pem' berks upload
```
On Windows, run a Chef DK PowerShell command:
```
$env:SSL_CERT_FILE="ca_certs\opsworks-cm-ca-2016-root.pem"; berks upload
Remove-Item Env:\SSL_CERT_FILE
```

4. Verify the installation of the cookbook by showing a list of cookbooks that are currently available on the
Chef Automate server.
```
knife cookbook list
```

Attach an Amazon EC2 instance to the newly-launched Chef Automate server
------------------------------------------------------------------------

1. Bootstrap a new Amazon EC2 instance.
```
knife bootstrap <IP address of the Amazon EC2 instance>  -N <instance name> -x <user name> -i <path to your ssh key file> --sudo --run-list "recipe[chef-client],recipe[apache2]"
```

2. Show the new node.
```
knife client show <instance name>
knife node show <instance name>
```


Learn more about using Chef Automate to configure your systems on the Learn Chef website
----------------------------------------------------------------------------------------
Visit the [Learn Chef tutorial site](https://learn.chef.io/tutorials/manage-a-node/opsworks/) to learn more about using AWS Opsworks for Chef Automate.
