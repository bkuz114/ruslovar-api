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
    # The parent chain is at most two levels deep:
    #   declined form -> root (for singular)
    #   declined form -> nominative plural -> root (for plural)
    current = row
    visited_codes = set()  # guard against infinite loops from bad data

    while current["code_parent"] != 0:
        if current["code"] in visited_codes:
            # Should never happen with clean data, but prevents a hang
            # if the database ever contains a cycle.
            raise LookupError(f"Parent chain cycle detected for word '{word}'")
        visited_codes.add(current["code"])

        parent = db.lookup_by_code(conn, current["code_parent"])
        if parent is None:
            raise LookupError(f"Parent row not found for word '{word}'")
        current = parent

    root_row = current
    root_word = root_row["word"]

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
        # Normal declension path

        # Step 4: Get all singular declensions
        singular_forms = []
        # get children of root (will include singular forms + plural nom)
        root_children = db.get_children(conn, root_row["code"])
        # remove nom plural from children
        singular_forms = [child for child in root_children if child["plural"] == 0]
        # add nominative
        singular_forms.append(root_row)

        # Step 5: Find the nominative plural row, if any.
        nom_plural = db.find_nominative_plural(conn, root_row["code"])

        # Step 6: Get all plural declensions
        plural_forms = []
        if nom_plural is not None:
            # Get all non-nominative forms (children of nom plural)
            plural_forms = db.get_children(conn, nom_plural["code"])
            # Add nom plural row to get all plural forms
            plural_forms.append(nom_plural)

        # Step 7: Assemble the response.
        singular = _assemble_case_forms(singular_forms)
        plural = _assemble_case_forms(plural_forms)
        additional = _assemble_additional_forms(singular_forms + plural_forms)

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
