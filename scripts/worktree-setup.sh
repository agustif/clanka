#!/bin/bash

direnv allow
bun install --no-verify

mkdir -p .repos

if [ ! -d .repos/effect-smol ]; then
  git clone https://github.com/Effect-TS/effect-smol.git --depth 1 .repos/effect-smol
fi

if [ ! -d .repos/opencode ]; then
  git clone https://github.com/anomalyco/opencode.git --depth 1 .repos/opencode
fi
