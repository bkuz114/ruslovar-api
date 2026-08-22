"""
Configuration for the ruslovar API.

This module loads database connection settings and CORS configuration from
environment variables or a .env file, and exposes them as a single typed
settings object.

The Settings class uses Pydantic's BaseSettings. For each field defined on
the class (e.g., db_host: str = "127.0.0.1"), Pydantic will get the value
for it in the following order:

1. Environment variable matching that field name (e.g., DB_HOST)
2. Key of same name in an .env file (located in cwd from where you start the server)
3. The default value declared on the field

Field names are matched case-insensitively (e.g., db_host will match env
var or key name db_host, DB_HOST, etc.), and values are automatically coerced
to the declared type (e.g., "3306" → 3306).

Example lookup flow:

    # Given this field definition:
    db_host: str = "127.0.0.1"

    # When the Settings object is instantiated, Pydantic will:
    # 1. look for an env var called db_host (case-insensitive)
    # 2. if not found, look for a key of the same name in .env (cwd)
    # 3. if not found, use the default value "127.0.0.1"

Example .env file:

    DB_HOST=127.0.0.1
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=password
    DB_NAME=runouns
    CORS_ORIGINS=*
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Application settings.

    Each field defines a default value. At runtime, Pydantic overrides the
    default by checking, in order:

    1. An environment variable with the same name (case-insensitive)
    2. A key in a .env file in the cwd with the same name (case-insensitive)

    Example:

        db_host: str = "127.0.0.1"

        1. If an env var DB_HOST (or db_host) exists, that value is used
        2. Else if a .env file in cwd has DB_HOST=..., that value is used
        3. Else the default "127.0.0.1" is used
    """

    # -- Database connection -------------------------------------------------
    # Host where MySQL is running. Defaults to localhost.
    db_host: str = "127.0.0.1"

    # Port MySQL listens on. (3306 is the MySQL default.)
    db_port: int = 3306

    # MySQL username. The default import uses root.
    db_user: str = "root"

    # MySQL password. Change this if your local setup uses a different one.
    db_password: str = "password"

    # Name of the database containing the nouns_morf table.
    db_name: str = "runouns"

    # -- CORS ----------------------------------------------------------------
    # Comma-separated list of allowed origins for cross-origin requests.
    # Use "*" to allow all origins (fine for local development, but should
    # be locked down in production).
    cors_origins: str = "*"

    class Config:
        """
        Pydantic configuration for reading from a .env file.
        """

        # path to env file (rel cwd where server is started)
        env_file = ".env"

        # read the .env file as UTF-8 (needed if values contain non-ASCII chars)
        env_file_encoding = "utf-8"


# Create a single instance of Settings.
# This is what other modules import to access configuration values:
#
#   from app.config import settings
#   settings.db_host
#
settings = Settings()
