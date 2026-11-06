#!/bin/sh
# Renders every post listed in posts.json.
cd "$(dirname "$0")" && for id in $(node -p "require('./posts.json').map(p=>p.id).join(' ')"); do node render.mjs "$id" || exit 1; done
