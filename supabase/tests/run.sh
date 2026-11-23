#!/usr/bin/env bash
# Recria uma base de dados local e aplica stub + migrações + testes.
set -euo pipefail
PSQL="psql -h ${PGHOST:-/tmp/claude-0} -p ${PGPORT:-5499} -U postgres -v ON_ERROR_STOP=1 -q"
cd "$(dirname "$0")/.."
$PSQL -d postgres -c "drop database if exists casa_test" -c "create database casa_test"
$PSQL -d casa_test -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do echo "→ $f"; $PSQL -d casa_test -f "$f"; done
for f in tests/[1-9]*.sql; do echo "→ $f"; $PSQL -d casa_test -f "$f"; done
echo "OK: todas as migrações e testes passaram."
