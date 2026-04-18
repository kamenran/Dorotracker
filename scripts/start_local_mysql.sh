#!/bin/zsh

set -euo pipefail

SCRIPT_PATH="${(%):-%N}"
SCRIPT_DIR="${SCRIPT_PATH:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
MYSQL_CLIENT_BIN="${MYSQL_BIN:-/opt/homebrew/bin/mysql}"
MYSQLADMIN_BIN="${MYSQLADMIN_BIN:-/opt/homebrew/bin/mysqladmin}"
MYSQLD_SAFE_BIN="${MYSQLD_SAFE_BIN:-/opt/homebrew/opt/mysql/bin/mysqld_safe}"
BREW_BIN="${BREW_BIN:-/opt/homebrew/bin/brew}"
PORT="${MYSQL_PORT:-3306}"
USER_NAME="${MYSQL_USER:-root}"
DB_NAME="${MYSQL_DATABASE:-dorotracker}"
SCHEMA_PATH="$PROJECT_ROOT/database/schema.sql"

if [[ ! -x "$MYSQL_CLIENT_BIN" || ! -x "$MYSQLADMIN_BIN" || ! -x "$MYSQLD_SAFE_BIN" ]]; then
  echo "MySQL binaries were not found. Install Homebrew MySQL first."
  return 1
fi

if ! "$MYSQLADMIN_BIN" -h 127.0.0.1 -P "$PORT" -u "$USER_NAME" ping >/dev/null 2>&1; then
  if [[ -x "$BREW_BIN" ]]; then
    "$BREW_BIN" services start mysql >/dev/null 2>&1 || true
  fi
fi

if ! "$MYSQLADMIN_BIN" -h 127.0.0.1 -P "$PORT" -u "$USER_NAME" ping >/dev/null 2>&1; then
  "$MYSQLD_SAFE_BIN" --datadir=/opt/homebrew/var/mysql >/tmp/dorotracker-mysql.log 2>&1 &
fi

for _ in {1..30}; do
  if "$MYSQLADMIN_BIN" -h 127.0.0.1 -P "$PORT" -u "$USER_NAME" ping >/dev/null 2>&1; then
    "$MYSQL_CLIENT_BIN" -h 127.0.0.1 -P "$PORT" -u "$USER_NAME" < "$SCHEMA_PATH"

    export MYSQL_BIN="$MYSQL_CLIENT_BIN"
    export MYSQL_HOST="127.0.0.1"
    export MYSQL_PORT="$PORT"
    export MYSQL_USER="$USER_NAME"
    export MYSQL_PASSWORD=""
    export MYSQL_DATABASE="$DB_NAME"
    return 0
  fi
  sleep 1
done

echo "MySQL did not become ready on 127.0.0.1:${PORT}."
return 1
