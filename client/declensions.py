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
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
