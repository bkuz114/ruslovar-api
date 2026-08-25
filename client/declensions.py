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
from typing import TypedDict

import httpx

# ==========================================================================
# Language-specific display strings for table output
# ==========================================================================


class LanguageStrings(TypedDict):
    """Expected structure for a single language's table strings."""

    cases: dict[str, str]
    root: str
    gender: str
    animacy_animate: str
    animacy_inanimate: str
    invariant: str
    singular: str
    plural: str
    additional_forms: str
    no_forms: str


LANG_STRINGS: dict[str, LanguageStrings] = {
    "ru": {
        "cases": {
            "nominative": "Именительный",
            "genitive": "Родительный",
            "dative": "Дательный",
            "accusative": "Винительный",
            "instrumental": "Творительный",
            "prepositional": "Предложный",
        },
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
        "cases": {
            "nominative": "Nominative",
            "genitive": "Genitive",
            "dative": "Dative",
            "accusative": "Accusative",
            "instrumental": "Instrumental",
            "prepositional": "Prepositional",
        },
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
    CASE = "\033[0;36m"  # cyan
    META = "\033[2;33m"  # dim yellow
    WORD = "\033[1;37m"  # bold white
    RESET = "\033[0m"  # reset to terminal default

    @staticmethod
    def strip(text: str) -> str:
        """
        Remove ANSI escape codes from a string.

        Args:
            text (str): The text from which to strip ANSI codes.

        Returns:
            str: The same text without ANSI escape sequences.
        """
        import re

        return re.sub(r"\033\[[0-9;]*m", "", text)


# ==========================================================================
# Table formatting
# ==========================================================================


class TableFormatter:
    """
    Formats Ruslovar API responses as human-readable terminal tables.

    The formatter is constructed once with the desired display context
    (language strings and color mode) and can then be reused to format
    multiple API responses.
    """

    def __init__(self, strings: LanguageStrings, use_color: bool) -> None:
        """
        Args:
            strings (LanguageStrings): Display strings for the selected
                language.
            use_color (bool): Whether ANSI colors are enabled.
        """
        self.strings = strings
        self.use_color = use_color

    def format(self, data: dict) -> str:
        """
        Format the full API response as a human-readable table string.

        Each match in the response is rendered as a separate block,
        joined by horizontal separators.

        Example (abbreviated, without color):

            Root: кролик
            Gender: masculine  animate

            Singular:
              Nominative     кролик
              ...

            Plural:
              Nominative     кролики
              ...

            ────────────────────────────────────────────

            Root: кролика
            ...

        Args:
            data (dict): Parsed JSON response from the API. Expected to
                contain a "matches" key holding a list of match objects.

        Returns:
            str: The formatted output. If no matches are found, returns
                the string "No matches found."
        """
        matches = data.get("matches", [])
        if not matches:
            return "No matches found."

        tables = [self._format_match(match) for match in matches]
        separator = self._colorize("─" * 60, Colors.META)
        return f"\n{separator}\n".join(tables)

    # ------------------------------------------------------------------
    # Internal formatting methods
    # ------------------------------------------------------------------

    def _format_match(self, match: dict) -> str:
        """
        Format a single match as a table block.

        A match block consists of:

        1. Metadata (root, gender, animacy, invariant marker)
        2. Singular case table
        3. One or more plural case tables
        4. Additional forms, if present

        Args:
            match (dict): A single match object from the API response.
                Expected keys: "root" (str), "gender" (str or None),
                "animacy" (bool or None), "invariant" (bool or None),
                "singular" (dict), "plural" (list[dict]),
                "additional_forms" (dict).

        Returns:
            str: The formatted table block for this match.
        """
        lines: list[str] = []

        lines.extend(self._metadata_lines(match))
        lines.extend(
            self._case_table_lines(
                self.strings["singular"],
                match.get("singular", {}),
            )
        )

        plurals = match.get("plural", [])
        for plural_index, plural_forms in enumerate(plurals):
            heading = self.strings["plural"]
            if len(plurals) > 1:
                heading = f"{heading} ({plural_index + 1})"
            lines.extend(self._case_table_lines(heading, plural_forms))

        lines.extend(self._additional_forms_lines(match.get("additional_forms", {})))

        return "\n".join(lines).rstrip()

    def _metadata_lines(self, match: dict) -> list[str]:
        """
        Format the metadata block shown above the case tables.

        Includes the root word, grammatical gender, animacy, and an
        "invariant" marker when applicable.

        Example output (without color):

            Root: кролик
            Gender: masculine  animate

        Args:
            match (dict): A single match object from the API response.
                Expected keys: "root" (str), "gender" (str or None),
                "animacy" (bool or None), "invariant" (bool or None).

        Returns:
            list[str]: Lines to append to the match table.
        """
        lines: list[str] = []

        root = match.get("root", "?")
        lines.append(
            self._colorize(
                f"{self.strings['root']}: {root}",
                Colors.HEADER,
            )
        )

        meta_parts: list[str] = []

        # gender returns as Ru strings in response
        # (e.g. муж, жен)
        gender = match.get("gender")
        if gender:
            meta_parts.append(f"{self.strings['gender']}: {gender}")

        # animacy data returned as a boolean.
        # so can easily localize
        animacy = match.get("animacy")
        if animacy is not None:
            animacy_text = (
                self.strings["animacy_animate"]
                if animacy
                else self.strings["animacy_inanimate"]
            )
            meta_parts.append(animacy_text)

        # invariant also a boolean; only display text if its invariant
        # (e.g. no "Invariant" or "Not invariant", just "Invariant" or nothing)
        if match.get("invariant"):
            meta_parts.append(self.strings["invariant"])

        if meta_parts:
            lines.append(self._colorize("  ".join(meta_parts), Colors.META))

        lines.append("")
        return lines

    def _case_table_lines(self, heading: str, forms: dict) -> list[str]:
        """
        Format a single case table (e.g., singular or plural).

        Iterates the six grammatical cases in display order and prints
        only those present in the API response.

        Example output (without color):

            Singular:
              Nominative     кролик
              Genitive       кролика
              Dative         кролику
              Accusative     кролика
              Instrumental   кроликом
              Prepositional  кролике

        Args:
            heading (str): Section heading, e.g. "Singular" or "Plural (2)".
            forms (dict): Mapping of case key to word form. Case keys are
                lower-case English names ("nominative", "genitive", etc.).
                Missing or empty values are skipped.

        Returns:
            list[str]: Lines to append to the match table.
        """
        lines: list[str] = []

        lines.append(self._colorize(f"{heading}:", Colors.HEADER))

        entries: list[tuple[str, str]] = []
        for case_key, case_label in self.strings["cases"].items():
            if case_key in forms and forms[case_key]:
                entries.append((case_label, forms[case_key]))

        if not entries:
            lines.append(f"  {self.strings['no_forms']}")
            lines.append("")
            return lines

        max_label_len = max(len(label) for label, _ in entries)

        for case_label, word in entries:
            padding = " " * (max_label_len - len(case_label))
            label_part = self._colorize(case_label, Colors.CASE)
            word_part = self._colorize(word, Colors.WORD)
            lines.append(f"  {label_part}{padding}  {word_part}")

        lines.append("")
        return lines

    def _additional_forms_lines(self, additional_forms: dict) -> list[str]:
        """
        Format optional noun forms such as locative or partitive.

        These are forms not covered by the six standard cases. Only
        non-empty values are included; empty dicts produce no output.

        Example output (without color):

            Additional forms:
              Locative    лесу
              Partitive   чаю

        Args:
            additional_forms (dict): Mapping of form name to word form.
                Keys are lower-case API field names (e.g., "locative",
                "partitive") and are capitalized for display.

        Returns:
            list[str]: Lines to append to the match table.
        """
        lines: list[str] = []

        entries: list[tuple[str, str]] = []
        for key, value in additional_forms.items():
            if value:
                entries.append((key.capitalize(), value))

        if not entries:
            return lines

        lines.append(
            self._colorize(
                f"{self.strings['additional_forms']}:",
                Colors.HEADER,
            )
        )

        max_label_len = max(len(label) for label, _ in entries)

        for label, word in entries:
            padding = " " * (max_label_len - len(label))
            label_part = self._colorize(label, Colors.CASE)
            word_part = self._colorize(word, Colors.WORD)
            lines.append(f"  {label_part}{padding}  {word_part}")

        lines.append("")
        return lines

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def _colorize(self, text: str, color_code: str) -> str:
        """
        Wrap text in ANSI color codes if colors are enabled.

        Args:
            text (str): The text to colorize.
            color_code (str): The ANSI color code from the Colors class.

        Returns:
            str: The colorized text, or the original text if colors are off.
        """
        if self.use_color:
            return f"{color_code}{text}{Colors.RESET}"
        return text


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


# ==========================================================================
# Main driver
# ==========================================================================


def main() -> None:
    """
    Main entry point.

    Queries the Ruslovar API and prints the response either as formatted
    JSON (default) or as a human-readable table (--table).
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
        use_color = args.color == "always" or (
            args.color == "auto" and sys.stdout.isatty()
        )
        strings = LANG_STRINGS[args.lang]
        formatter = TableFormatter(strings, use_color)
        print(formatter.format(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
