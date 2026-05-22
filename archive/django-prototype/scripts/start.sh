#!/bin/sh
set -eu

echo "Starte Besucherverwaltung ..."

if [ "${DATABASE_ENGINE:-}" = "mssql" ]; then
  python /app/scripts/bootstrap_mssql.py
fi

python manage.py migrate --noinput
python manage.py bootstrap_admin
python manage.py collectstatic --noinput

exec gunicorn visitor_manager.wsgi:application --bind 0.0.0.0:8000
