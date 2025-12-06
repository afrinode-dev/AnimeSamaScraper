#!/bin/sh

# Install node modules first
npm install

# Install playwright browsers matching the installed version
npx playwright install --with-deps chromium
