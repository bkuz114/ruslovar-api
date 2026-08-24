"""
Database access for the ruslovar API.

This module owns the MySQL connection and all SQL queries. No other module
should contain SQL — route handlers and services call the functions here.

The database is assumed to be read-only. This API never modifies the
underlying dictionary data.
"""

import pymysql
from pymysql.cursors import DictCursor

from app.config import settings


def get_connection() -> pymysql.connections.Connection:
    """
    Create and return a new MySQL connection.

    Uses settings from app.config. Returns a connection with DictCursor so
    query results are dictionaries keyed by column name, which is easier to
    work with than tuples.

    Raises pymysql.MySQLError if the connection cannot be established.
    """
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
    )


def lookup_word(conn, word: str) -> list[dict]:
    """
    Look up all rows in the dictionary matching a given word.

    The database may contain multiple rows for the same word. This
    function returns all of them, not just one. The caller is
    responsible for grouping and resolving them.

    Examples:
        кролика exists as both genitive singular and accusative
        singular, both with the same parent:

            кролика  (code=27250, code_parent=27249, wcase=род)
            кролика  (code=27252, code_parent=27249, wcase=вин)

        абаки has multiple rows, each potentially pointing to a
        different parent root:

            абаки  (code=..., code_parent=..., plural=1, wcase=им)
            абаки  (code=..., code_parent=..., plural=1, wcase=вин)

    Args:
        conn: An active MySQL connection.
        word: The word to search for (Cyrillic, UTF-8).

    Returns:
        A list of dictionaries representing all matching rows. Each
        dictionary has keys: IID, word, code, code_parent, plural,
        gender, wcase, soul. Empty list if no match exists.
    """
    sql = """
        SELECT IID, word, code, code_parent, plural, gender, wcase, soul
        FROM nouns_morf
        WHERE word = %s
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (word,))
        return list(cursor.fetchall())


def lookup_by_code(conn, code: int) -> dict | None:
    """
    Look up a row by its unique code.

    Used to walk the parent chain when resolving a declined form to its
    dictionary root.

    Args:
        conn: An active MySQL connection.
        code: The unique code of the row to look up.

    Returns:
        A dictionary representing the matching row, or None if no match exists.
    """
    sql = """
        SELECT IID, word, code, code_parent, plural, gender, wcase, soul
        FROM nouns_morf
        WHERE code = %s
        LIMIT 1
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (code,))
        return cursor.fetchone()


def get_children(conn, parent_code: int) -> list[dict]:
    """
    Return all rows whose code_parent matches the given parent code.

    Used to fetch all declensions of a root form (singular forms) and all
    declensions of a nominative plural form (plural forms).

    Args:
        conn: An active MySQL connection.
        parent_code: The code of the parent row.

    Returns:
        A list of dictionaries, each representing a child row.
    """
    sql = """
        SELECT IID, word, code, code_parent, plural, gender, wcase, soul
        FROM nouns_morf
        WHERE code_parent = %s
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (parent_code,))
        return list(cursor.fetchall())


def is_dictionary_artifact(conn, row: dict) -> bool:
    """
    Check whether a row is a dictionary artifact.

    A row is a dictionary artifact if it is a standalone root
    (code_parent = 0, wcase = NULL) and the same word also exists as a
    child of another root.

    Args:
        conn: An active MySQL connection.
        row: A dictionary row from nouns_morf.

    Returns:
        True if the row is a dictionary artifact, False otherwise.
    """
    if row["code_parent"] != 0 or row["wcase"] is not None:
        return False

    sql = """
        SELECT 1
        FROM nouns_morf
        WHERE word = %s
          AND code_parent != 0
        LIMIT 1
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (row["word"],))
        return cursor.fetchone() is not None


def find_useful_row(conn, word: str) -> dict | None:
    """
    Find the useful row for a word that has a dictionary artifact.

    When a word has a dictionary artifact (see is_dictionary_artifact),
    this function returns the row that points to the word's actual
    dictionary root.

    Example:
        For люди, this returns the row where люди is the nominative
        plural of человек (code_parent = 35307).

    Args:
        conn: An active MySQL connection.
        word: The word to look up.

    Returns:
        The child row that points to the actual root, or None if no
        such row exists.
    """
    sql = """
        SELECT IID, word, code, code_parent, plural, gender, wcase, soul
        FROM nouns_morf
        WHERE word = %s
          AND code_parent != 0
        LIMIT 1
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (word,))
        return cursor.fetchone()


def is_invariant_word(conn, word: str) -> bool:
    """
    Determine whether a word is invariant (кофе, радио, и т.д.).

    - In the Sshra data, an invariant noun has no grammatical case
      marking (its root row has wcase = NULL)
    - Additionally, no other row exists for the word in the db.
      This distinguishes invariant nouns from nouns like plural-only
      forms (e.g. люди), which have two rows: one with wcase = NULL
      and others with wcase = им and other case values

    Example (invariant):
        кофе -> only one row, wcase = NULL

    Example (not invariant):
        люди -> one row with wcase = NULL, but also rows with wcase = им
                and other case values

    Args:
        conn: An active MySQL connection.
        word: The surface form to check.

    Returns:
        True if the word is invariant, False otherwise.

    """

    sql = """
        SELECT
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM nouns_morf
                    WHERE word = %s
                      AND wcase IS NOT NULL
                )
                THEN 0
                ELSE 1
            END AS is_invariant
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (word,))
        result = cursor.fetchone()
        return bool(result["is_invariant"])


def find_nominative_plural(conn, root_code: int) -> dict | None:
    """
    Find the nominative plural row for a given root.

    Not all nouns have plural forms. If no nominative plural exists,
    this returns None and the noun is treated as singular-only.

    Args:
        conn: An active MySQL connection.
        root_code: The code of the root (dictionary form) row.

    Returns:
        A dictionary representing the nominative plural row, or None.
    """
    sql = """
        SELECT IID, word, code, code_parent, plural, gender, wcase, soul
        FROM nouns_morf
        WHERE code_parent = %s
          AND plural = 1
          AND wcase = 'им'
        LIMIT 1
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (root_code,))
        return cursor.fetchone()
