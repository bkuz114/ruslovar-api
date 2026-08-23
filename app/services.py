"""
Business logic for noun declension lookups.

This module sits between the HTTP layer (app.api) and the database layer
(app.db). It takes an input word, resolves it to its dictionary root if
needed, fetches all declension rows, and assembles them into the response
structure defined in app.models.

No SQL lives here — all database access goes through app.db.
"""

from app import db
from app.models import NounDeclensionResponse, CaseForms, AdditionalForms

# Mapping from database wcase values to English response keys.
# The extra cases (partitive, locative, etc.) are handled separately.
CASE_MAP = {
    "им": "nominative",
    "род": "genitive",
    "дат": "dative",
    "вин": "accusative",
    "тв": "instrumental",
    "пр": "prepositional",
}

# Reverse lookup: which response key corresponds to which additional form.
ADDITIONAL_CASE_MAP = {
    "парт": "partitive",
    "мест": "locative",
    "зват": "vocative",
    "счет": "counting",
}


def get_noun_declensions(word: str, strict: bool = False) -> NounDeclensionResponse:
    """
    Resolve and return the full declension table for a Russian noun.

    Args:
        word: The input word (may be in dictionary form or declined form).
        strict: If True, the word must be in dictionary form. If it is not,
            a LookupError is raised with an explanatory message.

    Returns:
        A NounDeclensionResponse containing the declension table.

    Raises:
        LookupError: If the word is not found in the dictionary, or if
            strict=True and the word is not in dictionary form.
    """
    conn = db.get_connection()
    try:
        return _get_noun_declensions(conn, word, strict)
    finally:
        conn.close()


def _get_noun_declensions(conn, word: str, strict: bool) -> NounDeclensionResponse:
    """
    Internal implementation. Takes an existing connection to avoid opening
    a new one when called from other functions (not currently the case, but
    keeps the door open for future refactoring).
    """

    # Step 1: Look up the input word.
    row = db.lookup_word(conn, word)
    if row is None:
        raise LookupError(f"Word '{word}' not found in dictionary")

    # Step 2: Walk the parent chain to find the dictionary root.
    root_row = _get_root_row(conn, row, word)
    root_word = root_row["word"]  # actual word
    root_code = root_row["code"]  # unique db ID for each word

    # Step 3: If strict mode is on, verify the input was already in
    # dictionary form.
    if strict and word != root_word:
        raise LookupError(
            f"Word '{word}' is not in dictionary form. "
            "Use strict=false to resolve automatically."
        )

    # Check if noun is invariant (радио, кофе, и т.д.)
    is_invariant = _is_invariant(root_row)
    if is_invariant:
        # All case forms are identical to the root word.
        singular = _invariant_case_forms(root_word)
        plural = _invariant_case_forms(root_word)
        additional = AdditionalForms()
    else:
        # Step 4: Get all singular declension rows
        singular_rows = _get_singular_rows(conn, root_row)

        # Step 5: Find the nominative plural row, if any.
        nom_plural_row = db.find_nominative_plural(conn, root_code)

        # Step 6: Get all plural declension rows
        plural_rows = _get_plural_rows(conn, nom_plural_row)

        # Step 7: Assemble data for the response from the rows
        singular = _assemble_case_forms(singular_rows)
        plural = _assemble_case_forms(plural_rows)
        additional = _assemble_additional_forms(singular_rows + plural_rows)

    # Extract gender and animacy from the root row (singular rows only)
    gender = root_row.get("gender")
    animacy = _parse_animacy(root_row.get("soul"))

    return NounDeclensionResponse(
        word=word,
        root=root_word,
        invariant=is_invariant,
        gender=gender,
        animacy=animacy,
        singular=singular,
        plural=plural,
        additional_forms=additional,
    )


def _get_root_row(conn, row: dict, word: str) -> dict:
    """
    Walk the parent chain from a given row to the dictionary root.

    The parent chain is at most two levels deep:
      declined form -> root (for singular)
      declined form -> nominative plural -> root (for plural)

    Args:
        conn: An active MySQL connection.
        row: The starting row (as returned from the database).
        word: The original input word, used in error messages.

    Returns:
        The dictionary row representing the root form.

    Raises:
        LookupError: If a parent cycle is detected or a parent row is missing.
    """
    # The parent chain is at most two levels deep:
    #   declined form -> root (for singular)
    #   declined form -> nominative plural -> root (for plural)
    current = row
    visited_codes = set()  # guard against infinite loops from bad data

    while not _is_root_row(current):
        if current["code"] in visited_codes:
            # Should never happen with clean data, but prevents a hang
            # if the database ever contains a cycle.
            raise LookupError(f"Parent chain cycle detected for word '{word}'")
        visited_codes.add(current["code"])

        parent = db.lookup_by_code(conn, current["code_parent"])
        if parent is None:
            raise LookupError(f"Parent row not found for word '{word}'")
        current = parent

    return current


def _is_root_row(row: dict) -> bool:
    """
    Determine whether a row is a dictionary root form.

    A root form has code_parent = 0, meaning it has no parent and is
    itself the canonical dictionary entry.

    Args:
        row: A dictionary row from nouns_morf.

    Returns:
        True if the row is a root form, False otherwise.
    """
    return row["code_parent"] == 0


def _get_singular_rows(conn, root_row: dict) -> list[dict]:
    """
    Gather all singular declension rows for a root form.

    The database stores singular declensions as children of the root row.
    However, the root's children also include the nominative plural row,
    which must be excluded. The root row itself is added as the singular
    nominative form.

    Args:
        conn: An active MySQL connection.
        root_row: The dictionary row representing the root form.

    Returns:
        A list of rows representing all singular declensions, including
        the nominative.

    Raises:
        LookupError: If root_row is not actually a root form.
    """
    if not _is_root_row(root_row):
        raise LookupError(
            f"Expected root row for '{root_row.get('word', 'unknown')}', but got a declined form"
        )

    singular_rows = []

    # Get all children of the root. This includes singular declensions
    # and the nominative plural row.
    root_children = db.get_children(conn, root_row["code"])

    # Keep only singular rows (plural = 0), excluding the nominative plural.
    singular_rows = [child for child in root_children if child["plural"] == 0]

    # Add the root row itself as the nominative singular form.
    singular_rows.append(root_row)

    return singular_rows


def _get_plural_rows(conn, nom_plural_row: dict | None) -> list[dict]:
    """
    Gather all plural declension rows for a nominative plural row.

    The database stores plural declensions as children of the nominative
    plural row. The nominative plural row itself is added to the list so
    that the nominative plural form is included in the response.

    Args:
        conn: An active MySQL connection.
        nom_plural_row: The nominative plural row, or None if the noun
            has no plural forms.

    Returns:
        A list of rows representing all plural declensions. Empty if the
        noun has no plural forms.
    """
    plural_rows = []

    if nom_plural_row is not None:
        # Get all plural declensions (children of the nominative plural row).
        plural_rows = db.get_children(conn, nom_plural_row["code"])

        # Add nom plural row to get all plural forms
        plural_rows.append(nom_plural_row)

    return plural_rows


def _is_invariant(root_row: dict) -> bool:
    """
    Determine whether a noun is invariant (does not decline).

    An invariant noun has no grammatical case marking, which is indicated
    by wcase = NULL on the root row.

    Args:
        root_row: The dictionary row representing the root form.

    Returns:
        True if the noun is invariant, False otherwise.
    """
    return root_row.get("wcase") is None


def _invariant_case_forms(word: str) -> CaseForms:
    """
    Build a CaseForms object where every case is the same word.

    Used for invariant nouns that do not change form.

    Args:
        word: The root word.

    Returns:
        A CaseForms object with all standard cases set to word.
    """
    return CaseForms(
        nominative=word,
        genitive=word,
        dative=word,
        accusative=word,
        instrumental=word,
        prepositional=word,
    )


def _assemble_case_forms(rows: list[dict]) -> CaseForms:
    """
    Given a list of declension rows, build a CaseForms object.

    Only standard six-case forms are included here. Additional forms
    (partitive, locative, etc.) are handled separately.
    """
    forms = CaseForms()

    for row in rows:
        wcase = row.get("wcase")
        if wcase in CASE_MAP:
            case_key = CASE_MAP[wcase]
            setattr(forms, case_key, row["word"])

    return forms


def _assemble_additional_forms(rows: list[dict]) -> AdditionalForms:
    """
    Given a list of declension rows, extract rare/archaic case forms.
    """
    forms = AdditionalForms()

    for row in rows:
        wcase = row.get("wcase")
        if wcase in ADDITIONAL_CASE_MAP:
            case_key = ADDITIONAL_CASE_MAP[wcase]
            setattr(forms, case_key, row["word"])

    return forms


def _parse_animacy(soul_value) -> bool | None:
    """
    Convert the soul column to a boolean (or None if unknown).

    The database stores soul as tinyint: 0 = inanimate, 1 = animate.
    NULL means unknown.
    """
    if soul_value is None:
        return None
    return bool(soul_value)
