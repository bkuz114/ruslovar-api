#!/usr/bin/env python3
"""
Generate a JSON manifest of all .txt files in a directory tree.
Used for generating the manifest.json file used by the batch file
example file explorer (See usage example below for directions on how
to generate).

The script walks the given directory, finds all .txt files, and creates
a flat list of file entries. Each entry contains the relative path and
a display name (derived from YAML frontmatter if available, otherwise
from the filename).

Usage:
    python generate_manifest.py [--directory DIR] [--output FILE]

Examples:

    # create the manifest file for the file explorer
    # (execute form client/web-client)
    python utils/generate_manifest.py --directory batch-examples/ --tree --output batch-examples/manifest.json

    python generate_manifest.py
    python generate_manifest.py --directory ./batch-examples
    python generate_manifest.py --directory ./batch-examples --output manifest.json

"""

import argparse
import json
import re
from pathlib import Path
from typing import Optional


def parse_yaml_frontmatter(content: str) -> dict:
    """
    Parse YAML frontmatter from file content.

    Looks for a block delimited by --- at the start of the file.
    Returns a dict of key-value pairs from the frontmatter.
    Only handles simple key: value pairs (no nested structures).

    Args:
        content: The full text content of the file.

    Returns:
        A dict of frontmatter key-value pairs, or an empty dict if
        no frontmatter is present.
    """
    # Check if file starts with ---
    if not content.startswith("---"):
        return {}

    # Find the closing ---
    end_match = re.search(r"\n---\s*\n", content)
    if not end_match:
        return {}

    # Extract the frontmatter block
    frontmatter_text = content[4 : end_match.start()]

    # Parse simple key: value pairs
    frontmatter = {}
    for line in frontmatter_text.split("\n"):
        line = line.strip()
        if ":" in line:
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip().strip('"').strip("'")

    return frontmatter


def count_files(node: dict) -> int:
    """
    Count the number of file nodes in a manifest structure.

    Works for both flat and tree manifests. For a flat manifest,
    returns the length of the 'files' list. For a tree manifest,
    recursively counts all nodes with type 'file'.

    Args:
        node: A manifest dict (either flat with 'files' key or tree with 'children').

    Returns:
        The number of file entries in the manifest.
    """
    if "files" in node:
        return len(node["files"])

    if node.get("type") == "file":
        return 1

    return sum(count_files(child) for child in node.get("children", []))


def get_display_name(file_path: Path) -> str:
    """
    Get the display name for a file.

    Checks for a 'title' attribute in YAML frontmatter first.
    If not found, falls back to the filename without extension.

    Args:
        file_path: Path to the file.

    Returns:
        The display name as a string.
    """
    try:
        content = file_path.read_text(encoding="utf-8")
        frontmatter = parse_yaml_frontmatter(content)

        if "title" in frontmatter:
            return frontmatter["title"]
    except (UnicodeDecodeError, OSError):
        # If we can't read the file, fall back to filename
        pass

    # Fallback: use filename without extension
    return file_path.stem


def find_txt_files(directory: Path) -> list[Path]:
    """
    Recursively find all .txt files in the given directory.

    Args:
        directory: The root directory to search.

    Returns:
        A sorted list of Path objects for all .txt files found.
    """
    txt_files = []

    for file_path in directory.rglob("*.txt"):
        if file_path.is_file():
            txt_files.append(file_path)

    return sorted(txt_files)


def generate_manifest(directory: Path, normalize_paths: bool = True) -> dict:
    """
    Generate the manifest dict from all .txt files in the directory.

    Args:
        directory: The root directory to search for .txt files.
        normalize_paths: If True, convert path separators to forward slashes.

    Returns:
        A dict with a 'files' key containing a list of file entries.
        Each entry has 'path' (relative to directory) and 'name'.
    """
    txt_files = find_txt_files(directory)
    manifest_files = []

    for file_path in txt_files:
        # Get the relative path from the directory
        relative_path = file_path.relative_to(directory)

        # Convert to string and normalize separators if requested
        path_str = str(relative_path)
        if normalize_paths:
            path_str = path_str.replace("\\", "/")

        # Get the display name
        display_name = get_display_name(file_path)

        manifest_files.append({"path": path_str, "name": display_name})

    return {"files": manifest_files}


def generate_tree_manifest(directory: Path) -> dict:
    """
    Generate a tree-structured manifest from all .txt files in the directory.

    Unlike generate_manifest, which returns a flat list, this returns a
    nested tree structure where directories contain children nodes.

    Args:
        directory: The root directory to search for .txt files.

    Returns:
        A dict representing the directory tree with 'name', 'type', and
        'children' (for directories) or 'path' (for files).
    """
    txt_files = find_txt_files(directory)

    def create_node(name: str, node_type: str, path: Optional[str] = None) -> dict:
        """Helper to create a tree node."""
        node = {"name": name, "type": node_type}
        if path is not None:
            node["path"] = path
        else:
            node["children"] = []
        return node

    # Create root node
    root = create_node(directory.name, "directory")

    # Build tree from relative paths
    for file_path in txt_files:
        relative_path = file_path.relative_to(directory)
        path_parts = list(relative_path.parts)
        path_str = str(relative_path).replace("\\", "/")

        current_node = root

        # Traverse/create directory structure
        for part in path_parts[:-1]:
            child = next(
                (
                    c
                    for c in current_node["children"]
                    if c["type"] == "directory" and c["name"] == part
                ),
                None,
            )

            if child is None:
                child = create_node(part, "directory")
                current_node["children"].append(child)

            current_node = child

        # Add file node
        filename = path_parts[-1]
        display_name = get_display_name(file_path)

        file_node = create_node(filename, "file", path_str)
        if display_name != Path(filename).stem:
            file_node["displayName"] = display_name

        current_node["children"].append(file_node)

    return root


def write_manifest(manifest: dict, output_path: Path, pretty: bool = True) -> None:
    """
    Write the manifest dict to a JSON file.

    Args:
        manifest: The manifest dict to write.
        output_path: The path where the JSON file should be written.
        pretty: If True, indent the JSON for readability. If False, write compact JSON.
    """
    with output_path.open("w", encoding="utf-8") as f:
        if pretty:
            json.dump(manifest, f, indent=4, ensure_ascii=False)
        else:
            json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")  # Add trailing newline


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.

    Returns:
        The parsed arguments as an argparse.Namespace object.
    """
    parser = argparse.ArgumentParser(
        description="Generate a JSON manifest of all .txt files in a directory tree."
    )

    parser.add_argument(
        "--directory",
        type=Path,
        default=Path.cwd(),
        help="Root directory to search (defaults to current working directory)",
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=Path.cwd() / "manifest.json",
        help="Output file path (defaults to manifest.json in current directory)",
    )

    parser.add_argument(
        "--tree",
        action="store_true",
        help="Generate tree structure instead of flat list",
    )

    parser.add_argument(
        "--no-pretty",
        action="store_true",
        help="Write compact JSON without indentation",
    )

    return parser.parse_args()


def main() -> None:
    """
    Main entry point for the script.

    Parses arguments, generates the manifest, and writes it to the output file.
    """
    args = parse_args()

    # Resolve paths
    directory = args.directory.resolve()
    output_path = args.output.resolve()

    # Ensure directory exists
    if not directory.is_dir():
        print(f"Error: Directory '{directory}' does not exist.")
        return

    # Generate manifest
    print(f"Scanning directory: {directory}")

    if args.tree:
        manifest = generate_tree_manifest(directory)
        print("Generating tree structure...")
    else:
        manifest = generate_manifest(directory)
        print("Generating flat list...")

    # Write manifest
    write_manifest(manifest, output_path, pretty=not args.no_pretty)
    print(f"Manifest written to: {output_path}")
    print(f"Found {count_files(manifest)} .txt files.")


if __name__ == "__main__":
    main()
