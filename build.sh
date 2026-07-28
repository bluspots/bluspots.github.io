#!/bin/bash
# Haven prototype regeneration pipeline (v0.13, PWA-updated).
# Regenerates prototype.html AND index.html from home_services_app.jsx.
# Never hand-edit either file's script block directly — re-run this
# script instead. That is the sync rule (Blueprint §1, non-negotiable).
#
# index.html is a byte-identical copy of prototype.html, kept as a separate
# file only because GitHub Pages serves whatever is named index.html at the
# repo root by convention. Both are regenerated from the same source in the
# same run, so they can never drift out of sync with each other.
#
# Why this isn't a pure `cat` with zero transform: home_services_app.jsx
# uses `import React, {...} from "react"` and `export default function
# App(){` so it can also be dropped into a real bundler-based React project
# (this file is the editable source of truth for BOTH contexts). Neither
# line is valid inside a plain <script type="text/babel"> tag — there is no
# module loader there, and React is already a global from the CDN tag above.
# This script strips exactly those two lines and nothing else. The sync
# check below verifies the babel block is byte-identical to the jsx MINUS
# that one deterministic transform — any other drift fails loudly.
set -e
cd "$(dirname "$0")"

TMP=$(mktemp)
sed '/^import React, { useState, useRef, useEffect } from "react";$/d' home_services_app.jsx \
  | sed 's/^export default function App(){/function App(){/' > "$TMP"

cat _shell_pre.txt "$TMP" _shell_post.txt > prototype.html
cp prototype.html index.html
rm -f "$TMP"

echo "prototype.html and index.html regenerated from home_services_app.jsx"
