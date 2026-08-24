"""
Business logic for noun declension lookups.

This module sits between the HTTP layer (app.api) and the database layer
(app.db). It takes an input word, resolves it to its dictionary root if
needed, fetches all declension rows, and assembles them into the response
structure defined in app.models.

No SQL lives here — all database access goes through app.db.
"""

from app import db
from app.models import NounLookupResponse, NounDeclensions, CaseForms, AdditionalForms

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


def get_noun_declensions(word: str, strict: bool = False) -> NounLookupResponse:
    """
    Resolve and return the full declension table for a Russian noun.

    Args:
        word: The input word (may be in dictionary form or declined form).
        strict: If True, the word must be in dictionary form. If it is not,
            a LookupError is raised with an explanatory message.

    Returns:
        A NounLookupResponse containing the declension table.

    Raises:
        LookupError: If the word is not found in the dictionary, or if
            strict=True and the word is not in dictionary form.
    """
    conn = db.get_connection()
    try:
        return _get_noun_declensions(conn, word, strict)
    finally:
        conn.close()


def _get_noun_declensions(conn, word: str, strict: bool) -> NounLookupResponse:
    """
    Internal implementation. Takes an existing connection to avoid opening
    a new one when called from other functions (not currently the case, but
    keeps the door open for future refactoring).
    """

    # Get all matching rows in the database for the word
    # (could be multiple e.g., кролика has rows for acc sing, gen sing)
    matching_rows = db.lookup_word(conn, word)
    if not matching_rows:
        raise LookupError(f"Word '{word}' not found in dictionary")

    # For each matching row, find its root form.
    # - A single word can have multiple possible roots
    #   (e.g, абаки could be plural of абак or абака)
    # - Most words only have a single root though, so
    #   put in set to remove duplicates (e.g. all кролика
    #   rows will collapse to a single кролик root row)
    distinct_roots = {}
    for row in matching_rows:
        root_row = _get_root_row(conn, row, word)
        distinct_roots[root_row["code"]] = root_row
    distinct_root_rows = distinct_roots.values()

    # If strict mode, ensure at least one root matches
    if strict:
        # checks if word user submitted matches *any* possible
        # root for it.
        is_word_root = any(
            word.lower() == root_row["word"].lower() for root_row in distinct_root_rows
        )
        if not is_word_root:
            possible_roots = ", ".join(
                root_row["word"] for root_row in distinct_root_rows
            )
            raise LookupError(
                f"Word '{word}' is not in dictionary form. Possible roots: {possible_roots}."
            )

    # For each distinct root row, create a NounDeclensions object
    declension_objects = [
        _assemble_noun_declension(conn, row) for row in distinct_root_rows
    ]

    return NounLookupResponse(
        word=word,
        matches=declension_objects,
    )


def _assemble_noun_declension(conn, root_row: dict) -> NounDeclensions:
    """
    Build a NounDeclensions object for a single dictionary root.

    Given a root row, gathers the singular and plural declension rows
    and assembles them into the response model.

    Args:
        conn: An active MySQL connection.
        root_row: The dictionary row representing the root form.

    Returns:
        A NounDeclensions object with the full declension table for
        this root.
    """

    root_word = root_row["word"]  # actual word
    root_code = root_row["code"]  # unique db ID for each word

    # Check if noun is invariant (радио, кофе, и т.д.)
    is_invariant = _is_invariant(conn, root_row)
    if is_invariant:
        # All case forms are identical to the root word.
        singular = _invariant_case_forms(root_word)
        # plurals must be in a list
        plurals_list = [_invariant_case_forms(root_word)]
        additional = AdditionalForms()
    else:
        # get all children of root
        root_children = db.get_children(conn, root_code)

        # Step 4: Get all singular declension rows
        singular_rows = _get_singular_rows(conn, root_row, root_children)

        # Step 5: Get all possible plural declension rows
        # Note:
        # - root word can have multiple distinct nom. plural words with their
        #   own declensions (e.g., человек -> человеки, люди)
        # - so this returns a list of lists of rows (one sublist for each
        #   distinct nom. plural word and its related declensions)
        plural_rows_list = _get_plural_rows_list(conn, root_row, root_children)

        # Step 6: Assemble data for the response from the rows
        singular = _assemble_case_forms(singular_rows)
        plurals_list = [_assemble_case_forms(pl) for pl in plural_rows_list]
        additional = _assemble_additional_forms(singular_rows)

    # Step 7: Extract gender and animacy from the root row (singular rows only)
    gender = root_row.get("gender")
    animacy = _parse_animacy(root_row.get("soul"))

    return NounDeclensions(
        root=root_word,
        invariant=is_invariant,
        gender=gender,
        animacy=animacy,
        singular=singular,
        plural=plurals_list,
        additional_forms=additional,
    )


def _get_root_row(conn, row: dict, word: str, visited_codes: set | None = None) -> dict:
    """
    Resolve a row to its dictionary root.

    If the row is already a root, first check whether the same word also
    exists as a child of another root. If so, recurse on that child row.

    Otherwise, recurse up the code_parent chain until reaching a root.

    Args:
        conn: An active MySQL connection.
        row: The starting row.
        word: The original input word, used for error messages.
        visited_codes: Set of codes already seen, used to detect cycles.
            Internal parameter, not intended for callers.

    Returns:
        The dictionary row representing the root.

    Raises:
        LookupError: If a parent cycle is detected or a parent row is
            missing.
    """
    # Guard against infinite recursion. Each row's code should only be
    # visited once; revisiting indicates a cycle in the database or a
    # dictionary artifact that points back to itself.
    if visited_codes is None:
        visited_codes = set()

    if row["code"] in visited_codes:
        raise LookupError(f"Parent chain cycle detected for word '{word}'")
    visited_codes.add(row["code"])

    # Base case: row is a root and has no parent row elsewhere.
    if _is_root_row(row):
        if db.is_dictionary_artifact(conn, row):
            child_version_row = db.find_useful_row(conn, word)
            if child_version_row is None:
                raise LookupError(
                    f"Dictionary artifact detected for word '{word}' but no useful row found"
                )
            return _get_root_row(conn, child_version_row, word, visited_codes)
        else:
            return row

    # Recursive case: walk up the parent chain.
    parent = db.lookup_by_code(conn, row["code_parent"])
    if parent is None:
        raise LookupError(f"Parent row not found for word '{word}'")

    return _get_root_row(conn, parent, word, visited_codes)


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


def _get_singular_rows(
    conn, root_row: dict, root_children: list[dict] | None = None
) -> list[dict]:
    """
    Gather all singular declension rows for a root form.

    The database stores singular declensions as children of the root row.
    However, the root's children also include the nominative plural row,
    which must be excluded. The root row itself is added as the singular
    nominative form.

    Args:
        conn: An active MySQL connection.
            (only used if root_children not passed)
        root_row: The dictionary row representing the root form.
        root_childen: (optional) children of root row. Pass to avoid
            extra db query

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

    # If not cached, get all children of the root.
    # This includes singular declensions and the nominative plural row.
    if root_children == None:
        root_children = db.get_children(conn, root_row["code"])

    # Keep only singular rows (plural = 0), excluding the nominative plural.
    singular_rows = [child for child in root_children if child["plural"] == 0]

    # Add the root row itself as the nominative singular form.
    singular_rows.append(root_row)

    return singular_rows


def _get_plural_rows_list(
    conn, root_row: dict, root_children: list[dict] | None = None
) -> list[list[dict]]:
    """
    Gather all plural declension rows from a root word row.

    - If there's plural forms of the root word, the database stores
      the nominative plural as a child of the root row (this is the
      only plural form it stores)
    - Remaining plural declensions are stored as children of nominative
      plural row.
    - There can be MULTIPLE distinct nominative plural words for the
      root word (e.g. человек -> человеки, люди). Will create a sublist
      for each distinct word; that sublist will contain all rows for it
      (that nominative plural + related declensions)

    Example:
        The root word человек (code=35307) has two nominative plural
        children:

            люди       (code=1378733, code_parent=35307, plural=1, wcase=им)
            человеки   (code=1379833, code_parent=35307, plural=1, wcase=им)

        Each one will appear as a child row of the root row, and each one
        has its own set of children.

        This function would return a list with two sublists: One sublist
        contains the row for люди plus its children (людей, людям, ...).
        The other sublist the row for человеки plus its children
        (человеков, человекам, ...).

    Args:
        conn: An active MySQL connection.
            (only used if root_children not passed)
        root_row: The dictionary row representing the root form.
        root_childen: (optional) children of root row. Pass to avoid
            extra db query

    Returns:
        A list of lists. Each sublist contains the rows for one distinct
        nominative plural word and all of its declensions.
        Empty if the noun has no plural forms.
    """
    if not _is_root_row(root_row):
        raise LookupError(
            f"Expected root row for '{root_row.get('word', 'unknown')}', but got a declined form"
        )

    plural_rows_list = []

    # If not cached, get all children of the root.
    # This includes singular declensions and the nominative plural row.
    if root_children == None:
        root_children = db.get_children(conn, root_row["code"])

    # Get nominative plural row from root row, if any
    # (NOTE: Some uncountable, group words that colloquially don't use
    # plural still return plural e.g., дружба, север, одежда -- the only
    # words in sshra without plurals seem to be specialized or loan words)
    nom_plural_rows = [child for child in root_children if child["plural"] == 1]

    # there can be multiple nominative plural results for a single root,
    # each with their own set of children.
    # (e.g. человек has nom pl row for человеки and люди).
    # Construct lists of rows for all of them.
    for nom_plural_row in nom_plural_rows:
        # Get all plural declensions (children of the nominative plural row).
        plural_rows = db.get_children(conn, nom_plural_row["code"])

        # Add nom plural row to get all plural forms
        plural_rows.append(nom_plural_row)

        # add to list of all sets of plural rows
        plural_rows_list.append(plural_rows)

    return plural_rows_list


def _is_invariant(conn, root_row: dict) -> bool:
    """
    Determine whether a word is invariant (кофе, радио, и т.д.).

    - In the Sshra data, an invariant noun has no grammatical case
      marking (its root row has wcase = NULL)
    - Additionally, no other row exists for the word in the db.
      This distinguishes invariant nouns from nouns like plural-only
      forms (e.g. люди), which have two rows: one with wcase = NULL
      and others with wcase = им and other case values

    db.is_invariant_word checks for this, but we only call it
    unless wcase = NULL to avoid an unecessary sql query every time this
    function runs (as only a small subset of nouns meet the first
    condition of having wcase = NULL -- e.g. plural-only nouns)

    Args:
        conn: An active MySQL connection.
        root_row: The dictionary row representing the root form.

    Returns:
        True if the noun is invariant, False otherwise.
    """
    if not _is_root_row(root_row):
        raise LookupError(
            f"Expected root row for '{root_row.get('word', 'unknown')}', but got a declined form"
        )

    # only call db.is_invariant_word if wcase = NULL (the first
    # condition of invariant words) to avoid an extra sql query
    if root_row.get("wcase") is None:
        return db.is_invariant_word(conn, root_row["word"])

    return False


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
