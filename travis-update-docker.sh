#!/usr/bin/env bash
# https://gist.github.com/dylanscott/ea6cff4900c50f4e85a58c01477e9473
# via
# https://github.com/travis-ci/travis-ci/issues/5358#issuecomment-283416022

set -euo pipefail

sudo sh -c 'echo "deb https://apt.dockerproject.org/repo ubuntu-$(lsb_release -cs) main" > /etc/apt/sources.list.d/docker.list'
curl -fsSL https://apt.dockerproject.org/gpg | sudo apt-key add -
sudo apt-key fingerprint 58118E89F3A912897C070ADBF76221572C52609D
sudo apt-get update
sudo apt-get -y install "docker-engine=1.13.1-0~ubuntu-$(lsb_release -cs)"