#!/usr/bin/env bash

set -euo pipefail

LABEL="com.mrmojorising.worker"

launchctl print "gui/$(id -u)/$LABEL"
