#!/bin/bash
# Insight instance bootstrap: EC2 user data (docs/DEPLOYMENT.md "EC2 instance").
# TLS ends at the ALB, so the box needs no certbot: nginx listens on port 80
# for the ALB only, and PM2 runs Node on 127.0.0.1:3000.
set -euxo pipefail
export HOME=/root
dnf install -y nodejs22 nginx logrotate
# nodejs22 installs node-22 / npm-22; make sure plain `node` / `npm` exist
command -v node || alternatives --set node /usr/bin/node-22 || ln -sf /usr/bin/node-22 /usr/bin/node
command -v npm  || ln -sf /usr/bin/npm-22 /usr/bin/npm
npm install -g pm2
PM2=$(command -v pm2)
env PATH="$PATH" "$PM2" startup systemd -u root --hp /root
dd if=/dev/zero of=/swapfile bs=1M count=1024
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
mkdir -p /opt/insight/shared /opt/insight/releases
touch /var/lib/insight-bootstrap-done
