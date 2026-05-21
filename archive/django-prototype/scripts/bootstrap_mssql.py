import os
import sys
import time

import pyodbc


def env(name, default=""):
    return os.getenv(name, default).strip()


def build_connection_string(database):
    driver = env("MSSQL_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")
    host = env("DATABASE_HOST")
    port = env("DATABASE_PORT", "1433")
    user = env("DATABASE_USER")
    password = env("DATABASE_PASSWORD")
    extra = env("DATABASE_OPTIONS", "TrustServerCertificate=yes")

    parts = [
        f"DRIVER={{{driver}}}",
        f"SERVER={host},{port}",
        f"DATABASE={database}",
        f"UID={user}",
        f"PWD={password}",
    ]
    if extra:
        parts.append(extra)
    return ";".join(parts)


def ensure_database_exists():
    database_name = env("DATABASE_NAME", "Besuchermngmt")
    retries = int(env("DATABASE_CONNECT_RETRIES", "30"))
    sleep_seconds = int(env("DATABASE_CONNECT_SLEEP_SECONDS", "5"))

    if not env("DATABASE_HOST"):
        print("DATABASE_HOST ist leer.", file=sys.stderr)
        return 1

    master_conn_str = build_connection_string("master")
    quoted_name = "[" + database_name.replace("]", "]]") + "]"

    for attempt in range(1, retries + 1):
        try:
            with pyodbc.connect(master_conn_str, timeout=5, autocommit=True) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1 FROM sys.databases WHERE name = ?", database_name)
                    exists = cursor.fetchone() is not None
                    if not exists:
                        print(f"Erzeuge Datenbank {database_name} auf SQL Server.")
                        cursor.execute(f"CREATE DATABASE {quoted_name}")
                    else:
                        print(f"Datenbank {database_name} bereits vorhanden.")
            return 0
        except Exception as exc:
            print(f"MSSQL-Verbindung fehlgeschlagen ({attempt}/{retries}): {exc}", file=sys.stderr)
            if attempt == retries:
                return 1
            time.sleep(sleep_seconds)
    return 1


if __name__ == "__main__":
    if env("DATABASE_ENGINE", "").lower() != "mssql":
        sys.exit(0)
    sys.exit(ensure_database_exists())

