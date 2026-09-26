#!/usr/bin/env sh
# Preview the site locally at http://localhost:8000 (Ctrl+C to stop).
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python)
[ -z "$PY" ] && { echo "Python is required: https://www.python.org/downloads/"; exit 1; }
( sleep 1; (open http://localhost:8000 || xdg-open http://localhost:8000) >/dev/null 2>&1 ) &
exec "$PY" -m http.server 8000
