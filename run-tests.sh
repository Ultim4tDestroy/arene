#!/bin/bash
# Tests du bot en mode démo (marché fictif). Usage : bash run-tests.sh
set -e; B="$(cd "$(dirname "$0")" && pwd)/bot"; D=$(mktemp -d); cd "$D"
DEMO=1 DURATION_S=10 node "$B/run.js" >/dev/null; test -s state.json -a -s REPORT.md && echo "OK  premier passage"
DEMO=1 DURATION_S=6 node "$B/run.js" >/dev/null && echo "OK  reprise de l'état"
echo '{x' > state.json; if DEMO=1 DURATION_S=5 node "$B/run.js" 2>/dev/null; then echo "FAIL état corrompu écrasé"; exit 1; else echo "OK  état corrompu refusé"; fi
