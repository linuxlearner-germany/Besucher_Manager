from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if origin.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
    "visits",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "visitor_manager.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context_processors.app_context",
            ],
        },
    },
]

WSGI_APPLICATION = "visitor_manager.wsgi.application"

database_engine = os.getenv("DATABASE_ENGINE", "").strip().lower()

if database_engine == "mssql":
    DATABASES = {
        "default": {
            "ENGINE": "mssql",
            "NAME": os.getenv("DATABASE_NAME", "Besuchermngmt"),
            "USER": os.getenv("DATABASE_USER", ""),
            "PASSWORD": os.getenv("DATABASE_PASSWORD", ""),
            "HOST": os.getenv("DATABASE_HOST", ""),
            "PORT": os.getenv("DATABASE_PORT", "1433"),
            "OPTIONS": {
                "driver": os.getenv("MSSQL_ODBC_DRIVER", "ODBC Driver 18 for SQL Server"),
                "extra_params": os.getenv("DATABASE_OPTIONS", "TrustServerCertificate=yes"),
            },
        }
    }
elif database_engine == "postgres" or os.getenv("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DATABASE_NAME", os.getenv("POSTGRES_DB", "Besuchermngmt")),
            "USER": os.getenv("DATABASE_USER", os.getenv("POSTGRES_USER", "visitor_manager")),
            "PASSWORD": os.getenv("DATABASE_PASSWORD", os.getenv("POSTGRES_PASSWORD", "visitor_manager")),
            "HOST": os.getenv("DATABASE_HOST", os.getenv("POSTGRES_HOST", "db")),
            "PORT": os.getenv("DATABASE_PORT", os.getenv("POSTGRES_PORT", "5432")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "de-de"
TIME_ZONE = "Europe/Berlin"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "public-pre-registration"

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
use_secure_cookies = os.getenv("DJANGO_SECURE_COOKIES", "False").lower() == "true"

if use_secure_cookies:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "visitor-manager-cache",
    }
}

VISITOR_RETENTION_DAYS = int(os.getenv("VISITOR_RETENTION_DAYS", "90"))
PUBLIC_FORM_RATE_LIMIT = int(os.getenv("PUBLIC_FORM_RATE_LIMIT", "10"))
PUBLIC_FORM_RATE_WINDOW_SECONDS = int(os.getenv("PUBLIC_FORM_RATE_WINDOW_SECONDS", "900"))
