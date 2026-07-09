#!/bin/sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to start onboarding."
  echo "Install the Node.js LTS version, then run this file again."
  echo "Download it from https://nodejs.org"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to start onboarding."
  echo "Install the Node.js LTS version, which includes npm, then run this file again."
  echo "Download it from https://nodejs.org"
  exit 1
fi

npm start
