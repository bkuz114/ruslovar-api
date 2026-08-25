#!/usr/bin/env python3
"""
Thin CLI client for the Ruslovar API.

Allows quick lookup of Russian noun declensions from the terminal without
needing to use curl or a browser.

Usage:
    python declensions.py --word кролик
    python declensions.py --word кролика --strict
    python declensions.py --word кролик --url http://127.0.0.1:8000
"""

import argparse
import json
import sys

import httpx

# ==========================================================================
# Case label mappings for table output
# ==========================================================================

CASE_LABELS = {
    "ru": {
        "nominative": "Именительный",
        "genitive": "Родительный",
        "dative": "Дательный",
        "accusative": "Винительный",
        "instrumental": "Творительный",
        "prepositional": "Предложный",
    },
    "en": {
        "nominative": "Nominative",
        "genitive": "Genitive",
        "dative": "Dative",
        "accusative": "Accusative",
        "instrumental": "Instrumental",
        "prepositional": "Prepositional",
    },
}


# ==========================================================================
# Table output strings
# ==========================================================================

TABLE_STRINGS = {
    "ru": {
        "root": "Корень",
        "gender": "Род",
        "animacy_animate": "одушевлённое",
        "animacy_inanimate": "неодушевлённое",
        "invariant": "Неизменяемое",
        "singular": "Единственное число",
        "plural": "Множественное число",
        "additional_forms": "Дополнительные формы",
        "no_forms": "(нет форм)",
    },
    "en": {
        "root": "Root",
        "gender": "Gender",
        "animacy_animate": "animate",
        "animacy_inanimate": "inanimate",
        "invariant": "Invariant",
        "singular": "Singular",
        "plural": "Plural",
        "additional_forms": "Additional forms",
        "no_forms": "(no forms)",
    },
}


# ==========================================================================
# ANSI color codes for terminal output
# ==========================================================================


class Colors:
    """ANSI escape codes for colored terminal output."""

    HEADER = "\033[1;34m"  # bold blue
    CASE = "\033[0;36m"  # cyan → change to yellow
    META = "\033[2;33m"  # dim yellow
    WORD = "\033[1;37m"  # bold white
    RESET = "\033[0m"  # reset to terminal default

    @staticmethod
    def strip(text):
        """Remove ANSI escape codes from a string."""
        import re

        return re.sub(r"\033\[[0-9;]*m", "", text)


# ==========================================================================
# Table formatting functions
# ==========================================================================


def print_table(data, lang="ru", color="auto"):
    """
    Print the API response as a human-readable table.

    Renders each match separately, joins the results with separators,
    and prints once at the end.

    Args:
        data: The parsed API response (dict).
        lang: Language for case labels and metadata ("ru" or "en").
        color: Color mode ("auto", "always", or "never").
    """
    use_color = _should_use_color(color)
    labels = CASE_LABELS.get(lang, CASE_LABELS["ru"])
    strings = TABLE_STRINGS.get(lang, TABLE_STRINGS["ru"])

    matches = data.get("matches", [])
    if not matches:
        print("No matches found.")
        return

    tables = []
    for match in matches:
        tables.append(_build_match_table(match, strings, labels, use_color))

    separator = _separator_line(use_color)
    print(f"\n{separator}\n".join(tables))


def _build_match_table(match, strings, labels, use_color):
    """
    Build the table output for a single match.

    Args:
        match: A single match object from the API response.
        strings: Table output strings for the current language.
        labels: Case label mapping for the current language.
        use_color: Whether colors are enabled.

    Returns:
        A string containing the formatted table for this match.
    """
    lines = []

    lines.extend(_metadata_lines(match, strings, use_color))
    lines.extend(
        _case_table_lines(
            strings["singular"],
            match.get("singular", {}),
            labels,
            strings,
            use_color,
        )
    )

    plurals = match.get("plural", [])
    if plurals:
        for plural_index, plural_forms in enumerate(plurals):
            heading = strings["plural"]
            if len(plurals) > 1:
                heading = f"{heading} ({plural_index + 1})"
            lines.extend(
                _case_table_lines(
                    heading,
                    plural_forms,
                    labels,
                    strings,
                    use_color,
                )
            )

    lines.extend(
        _additional_forms_lines(
            match.get("additional_forms", {}),
            strings,
            use_color,
        )
    )

    return "\n".join(lines).rstrip()


def _should_use_color(color_mode):
    """
    Determine whether to use ANSI colors based on mode and TTY.

    "auto" enables colors only when stdout is a terminal. This prevents
    raw ANSI codes from polluting piped or redirected output.

    Args:
        color_mode: "auto", "always", or "never".

    Returns:
        True if colors should be used, False otherwise.
    """
    if color_mode == "always":
        return True
    if color_mode == "never":
        return False
    return sys.stdout.isatty()


def _colorize(text, color_code, use_color):
    """
    Wrap text in ANSI color codes if colors are enabled.

    Args:
        text: The text to colorize.
        color_code: The ANSI color code from the Colors class.
        use_color: Whether colors are enabled.

    Returns:
        The colorized text, or the original text if colors are off.
    """
    if use_color:
        return f"{color_code}{text}{Colors.RESET}"
    return text


def _separator_line(use_color):
    """
    Build a horizontal separator line between matches.

    Args:
        use_color: Whether colors are enabled.

    Returns:
        A string containing the separator.
    """
    return _colorize("─" * 60, Colors.META, use_color)


def _metadata_lines(match, strings, use_color):
    """
    Build lines for the match metadata: root, gender, animacy, invariant.

    Args:
        match: A single match object from the API response.
        strings: Table output strings for the current language.
        use_color: Whether colors are enabled.

    Returns:
        A list of strings to add to the output.
    """
    lines = []

    root = match.get("root", "?")
    lines.append(_colorize(f"{strings['root']}: {root}", Colors.HEADER, use_color))

    meta_parts = []
    gender = match.get("gender")
    if gender:
        meta_parts.append(f"{strings['gender']}: {gender}")

    animacy = match.get("animacy")
    if animacy is not None:
        animacy_text = (
            strings["animacy_animate"] if animacy else strings["animacy_inanimate"]
        )
        meta_parts.append(animacy_text)

    if match.get("invariant"):
        meta_parts.append(strings["invariant"])

    if meta_parts:
        lines.append(_colorize("  ".join(meta_parts), Colors.META, use_color))

    lines.append("")
    return lines


def _case_table_lines(heading, forms, labels, strings, use_color):
    """
    Build lines for a table of case forms.

    Args:
        heading: The heading text (e.g., "Singular", "Plural (1)").
        forms: A dict of case forms from the API response.
        labels: Case label mapping for the current language.
        strings: Table output strings for the current language.
        use_color: Whether colors are enabled.

    Returns:
        A list of strings to add to the output.
    """
    lines = []

    lines.append(_colorize(f"{heading}:", Colors.HEADER, use_color))

    entries = []
    for case_key, case_label in labels.items():
        if case_key in forms and forms[case_key]:
            entries.append((case_label, forms[case_key]))

    if not entries:
        lines.append(f"  {strings['no_forms']}")
        lines.append("")
        return lines

    max_label_len = max(len(label) for label, _ in entries)

    for case_label, word in entries:
        padding = " " * (max_label_len - len(case_label))
        label_part = _colorize(case_label, Colors.CASE, use_color)
        word_part = _colorize(word, Colors.WORD, use_color)
        lines.append(f"  {label_part}{padding}  {word_part}")

    lines.append("")
    return lines


def _additional_forms_lines(additional_forms, strings, use_color):
    """
    Build lines for non-null additional forms.

    Args:
        additional_forms: A dict of additional forms from the API response.
        strings: Table output strings for the current language.
        use_color: Whether colors are enabled.

    Returns:
        A list of strings to add to the output.
    """
    lines = []

    entries = []
    for key, value in additional_forms.items():
        if value:
            entries.append((key.capitalize(), value))

    if not entries:
        return lines

    lines.append(_colorize(f"{strings['additional_forms']}:", Colors.HEADER, use_color))

    max_label_len = max(len(label) for label, _ in entries)

    for label, word in entries:
        padding = " " * (max_label_len - len(label))
        label_part = _colorize(label, Colors.CASE, use_color)
        word_part = _colorize(word, Colors.WORD, use_color)
        lines.append(f"  {label_part}{padding}  {word_part}")

    lines.append("")
    return lines


# ==========================================================================
# Main Driver
# ==========================================================================


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.

    Returns:
        argparse.Namespace with the parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="Look up Russian noun declensions via the Ruslovar API."
    )

    parser.add_argument(
        "--word",
        required=True,
        help="The Russian noun to look up (Cyrillic, UTF-8).",
    )

    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require the word to be in dictionary form.",
    )

    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8000",
        help="Base URL of the Ruslovar API. Default: http://127.0.0.1:8000",
    )

    parser.add_argument(
        "--table",
        "-t",
        action="store_true",
        help="Format the response as a human-readable table instead of JSON.",
    )

    parser.add_argument(
        "--lang",
        choices=["ru", "en"],
        default="ru",
        help="Language for case labels in table output. Default: ru.",
    )

    parser.add_argument(
        "--color",
        choices=["auto", "always", "never"],
        default="auto",
        help="Control colored output. auto detects TTY. Default: auto.",
    )

    return parser.parse_args()


def main() -> None:
    """
    Main entry point. Calls the API and prints the response as formatted JSON.
    """
    args = parse_args()

    # Build the request URL.
    # The word is URL-encoded so Cyrillic characters are transmitted safely.
    endpoint = f"{args.url.rstrip('/')}/api/v1/nouns/{args.word}/declensions"
    params = {"strict": str(args.strict).lower()}

    try:
        # Make the request.
        # A short timeout prevents hanging if the server is unreachable.
        response = httpx.get(endpoint, params=params, timeout=5.0)

    except httpx.ConnectError:
        print(f"Error: Could not connect to API at {args.url}", file=sys.stderr)
        print("Is the server running?", file=sys.stderr)
        sys.exit(1)

    except httpx.TimeoutException:
        print("Error: Request timed out.", file=sys.stderr)
        sys.exit(1)

    # Handle non-200 responses gracefully.
    if response.status_code != 200:
        try:
            error_detail = response.json().get("detail", "Unknown error")
        except json.JSONDecodeError:
            error_detail = response.text

        print(f"Error ({response.status_code}): {error_detail}", file=sys.stderr)
        sys.exit(1)

    # Parse and pretty-print the response.
    result = response.json()

    if args.table:
        print_table(result, lang=args.lang, color=args.color)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
