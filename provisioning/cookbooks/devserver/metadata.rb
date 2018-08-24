name 'devserver'
maintainer 'The Blockchain U Inc.'
maintainer_email 'aakash@theblockchainu.com'
license 'all_rights'
description 'Installs/Configures devserver'
long_description 'Installs/Configures devserver'
version '0.1.1'

%w{apt build-essential firewall nginx openssl supervisor pm2}.each do |cookbook|
  depends cookbook
end

# The `issues_url` points to the location where issues for this cookbook are
# tracked.  A `View Issues` link will be displayed on this cookbook's page when
# uploaded to a Supermarket.
#
# issues_url 'https://github.com/<insert_org_here>/devserver/issues' if respond_to?(:issues_url)

# The `source_url` points to the development reposiory for this cookbook.  A
# `View Source` link will be displayed on this cookbook's page when uploaded to
# a Supermarket.
#
# source_url 'https://github.com/<insert_org_here>/devserver' if respond_to?(:source_url)
