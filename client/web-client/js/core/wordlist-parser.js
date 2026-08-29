/**
 * Ruslovar API Demo — Word List Parser
 *
 * Parses plain-text word list files into a structured object for use by
 * batch lookup views. Supports optional YAML-style frontmatter for
 * metadata, markdown-style category headings (#, ##, ###, etc.), and
 * arbitrary category nesting depth.
 *
 * Input format:
 *
 *     ---
 *     title: My batch
 *     description: Practice words
 *     ---
 *     # Nouns
 *     кролик
 *     лук
 *
 *     ## Masculine
 *     стол
 *
 *     ## Feminine
 *     лука
 *
 *     # Adjectives
 *     красный
 *
 * Rules:
 *   - Frontmatter is optional. If present, it must be at the top of the
 *     file, enclosed by lines containing exactly "---".
 *   - Frontmatter keys and values are separated by a colon and optional
 *     whitespace.
 *   - Category headings start with one or more '#' characters. The
 *     number of '#' characters determines the nesting level: '#' is
 *     level 1, '##' is level 2, etc.
 *   - Words are any non-empty lines that do not start with '#' and are
 *     not inside the frontmatter block.
 *   - Blank lines are ignored.
 *
 * Malformed input throws an Error with a descriptive message including
 * the line number where the problem occurred.
 *
 * Dependencies:
 *   - None (standalone module)
 */

/** Frontmatter delimiter line. */
const FRONTMATTER_DELIMITER = '---';

/**
 * Find the index of the first non-blank line in the file.
 *
 * Leading blank lines are ignored so files can start with whitespace
 * without affecting parsing. The returned index preserves the original
 * line numbering for error messages.
 *
 * @param {string[]} lines - All file lines.
 * @returns {number} Index of the first non-blank line, or lines.length
 *     if all lines are blank.
 */
function findFirstNonBlankLineIndex(lines) {
    let index = 0;
    while (index < lines.length && lines[index].trim() === '') {
        index++;
    }
    return index;
}

/**
 * Parse a word list file into a structured object.
 *
 * @param {string} text - Raw file contents.
 * @returns {WordListDocument} Parsed document with metadata and categories.
 * @throws {Error} If the input is malformed.
 */
export function parseWordList(text) {
    const lines = text.split(/\r?\n/);
    // find lin number of first non-blank line instead
    // of trimming so error messages can print line numbers
    const firstNonBlankIndex = findFirstNonBlankLineIndex(lines);

    // Parse optional frontmatter if the first line is a delimiter.
    let metadata = {};
    let categoryLinesStartIndex = firstNonBlankIndex;

    if (firstNonBlankIndex < lines.length && lines[firstNonBlankIndex].trim() === FRONTMATTER_DELIMITER) {
        const frontmatterResult = parseFrontmatter(lines, firstNonBlankIndex);
        metadata = frontmatterResult.metadata;
        categoryLinesStartIndex = frontmatterResult.nextIndex;
    }

    const categories = parseCategories(lines, categoryLinesStartIndex);

    return {
        metadata,
        categories,
    };
}

/**
 * Parse YAML-style frontmatter from the beginning of the file.
 *
 * Expected format:
 *
 *     ---
 *     title: My batch
 *     description: Practice words
 *     ---
 *
 * The opening delimiter must be at the given startIndex. The closing
 * delimiter must appear on a subsequent line. Key-value pairs are
 * separated by a colon.
 *
 * @param {string[]} lines - All file lines, including the opening delimiter.
 * @param {number} startIndex - Index of the opening delimiter line.
 * @returns {{metadata: Object, nextIndex: number}} Parsed metadata and
 *     the index of the first line after the closing delimiter.
 * @throws {Error} If the closing delimiter is missing, or if a key-value
 *     pair is malformed.
 */
function parseFrontmatter(lines, startIndex) {
    const metadata = {};

    // Start at startIndex + 1; startIndex is the opening delimiter.
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Closing delimiter.
        if (trimmed === FRONTMATTER_DELIMITER) {
            return {
                metadata,
                nextIndex: i + 1,
            };
        }

        // Skip blank lines inside frontmatter.
        if (!trimmed) continue;

        // Parse key: value pair.
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            throw new Error(
                `Line ${i + 1}: Malformed frontmatter entry. Expected "key: value".`
            );
        }

        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        if (!key) {
            throw new Error(
                `Line ${i + 1}: Malformed frontmatter entry. Missing key before colon.`
            );
        }

        metadata[key] = value;
    }

    // If we reach the end without a closing delimiter, the input is
    // malformed.
    throw new Error(
        `Frontmatter block is missing closing "${FRONTMATTER_DELIMITER}" line.`
    );
}

/**
 * Parse category headings and words into a hierarchical tree.
 *
 * @param {string[]} lines - All file lines.
 * @param {number} startIndex - Index of the first line to parse (after
 *     frontmatter, if any).
 * @returns {Array<CategoryNode>} Top-level categories.
 * @throws {Error} If a word appears before any category heading, or if
 *     heading levels are inconsistent.
 */
function parseCategories(lines, startIndex) {
    const rootCategories = [];
    const stack = [];
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip blank lines.
        if (!trimmed) continue;

        if (trimmed.startsWith('#')) {
            // Category heading.
            const level = getHeadingLevel(trimmed);
            const name = trimmed.slice(level).trim();

            if (!name) {
                throw new Error(
                    `Line ${i + 1}: Category heading is missing a name.`
                );
            }

            const category = createCategoryNode(name, level);

            if (level === 1) {
                rootCategories.push(category);
                stack.length = 0;
                stack.push(category);
            } else {
                // Find the parent category: the most recent category with
                // a level one less than this one.
                while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }

                if (stack.length === 0) {
                    throw new Error(
                        `Line ${i + 1}: Heading "${trimmed}" has no parent heading. ` +
                        `A level ${level} heading must follow a level ${level - 1} heading.`
                    );
                }

                const parent = stack[stack.length - 1];
                parent.subcategories.push(category);
                stack.push(category);
            }

            continue;
        }

        // Word line.
        if (stack.length === 0) {
            throw new Error(
                `Line ${i + 1}: Word "${trimmed}" appears before any category heading. ` +
                `Words must be placed under a heading starting with '#'.`
            );
        }

        const currentCategory = stack[stack.length - 1];
        currentCategory.words.push(trimmed);
    }

    return rootCategories;
}

/**
 * Determine the heading level of a category line.
 *
 * The level is the number of leading '#' characters.
 *
 * Example:
 *   getHeadingLevel("# Nouns") → 1
 *   getHeadingLevel("## Masculine") → 2
 *
 * @param {string} line - Trimmed category heading line.
 * @returns {number} Heading level (1 or greater).
 */
function getHeadingLevel(line) {
    let level = 0;
    while (line[level] === '#') {
        level++;
    }
    return level;
}

/**
 * Create a category node.
 *
 * @param {string} name - Category name.
 * @param {number} level - Heading level (1 or greater).
 * @returns {CategoryNode} New category node.
 */
function createCategoryNode(name, level) {
    return {
        name,
        level,
        words: [],
        subcategories: [],
    };
}

// ==========================================================================
// Type Definitions
// ==========================================================================

/**
 * @typedef {Object} WordListDocument
 * @property {Object} metadata - Frontmatter metadata (key-value pairs).
 * @property {Array<CategoryNode>} categories - Top-level categories.
 */

/**
 * @typedef {Object} CategoryNode
 * @property {string} name - Category name (without '#' characters).
 * @property {number} level - Heading level (1 or greater).
 * @property {string[]} words - Words directly under this category.
 * @property {Array<CategoryNode>} subcategories - Nested subcategories.
 */