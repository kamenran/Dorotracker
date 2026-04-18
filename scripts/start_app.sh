#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
NODE_BIN="/opt/homebrew/bin/node"
MYSQL_CLIENT_BIN="/opt/homebrew/bin/mysql"
MYSQLADMIN_BIN="/opt/homebrew/bin/mysqladmin"

cd "$PROJECT_ROOT"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node runtime not found at:"
  echo "$NODE_BIN"
  echo
  echo "Install Node.js or update this script to point to your local node executable."
  read -k "REPLY?Press any key to close..."
  echo
  exit 1
fi

if [[ ! -x "$MYSQL_CLIENT_BIN" || ! -x "$MYSQLADMIN_BIN" ]]; then
  echo "Homebrew MySQL was not found."
  echo "Install it with: brew install mysql"
  read -k "REPLY?Press any key to close..."
  echo
  exit 1
fi

export HOST="127.0.0.1"
export PORT="8000"
export MYSQL_USER="root"
export MYSQL_DATABASE="dorotracker"
export MYSQL_BIN="$MYSQL_CLIENT_BIN"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_SOCKET="/tmp/mysql.sock"
export MYSQL_PASSWORD=""

if ! "$MYSQLADMIN_BIN" -h 127.0.0.1 -P 3306 -u root ping >/dev/null 2>&1; then
  echo "MySQL is not responding on 127.0.0.1:3306."
  echo "Start it with: brew services start mysql"
  read -k "REPLY?Press any key to close..."
  echo
  exit 1
fi

"$MYSQL_CLIENT_BIN" -h 127.0.0.1 -P 3306 -u root < "$PROJECT_ROOT/database/schema.sql"

echo "Starting DoroTracker on http://127.0.0.1:8000"
echo "Using MySQL on 127.0.0.1:3306"
echo "Press Control+C to stop the server."
echo

(
  sleep 2
  open "http://127.0.0.1:8000"
) >/dev/null 2>&1 &

"$NODE_BIN" server/index.js
