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
 * This is the main entry point. It orchestrates three parsing steps:
 *   1. parseFrontmatterBlock — optional YAML-style metadata block.
 *   2. parseImplicitCategory — leading words before any heading.
 *   3. parseCategories — explicit heading-based categories.
 *
 * @param {string} text - Raw file contents.
 * @returns {WordListDocument} Parsed document with metadata and categories.
 * @throws {Error} If the input is malformed.
 */
export function parseWordList(text) {
    const lines = text.split(/\r?\n/);

    // Parse optional frontmatter
    const frontmatterResult = parseFrontmatterBlock(lines);
    const metadata = frontmatterResult.metadata;
    let index = frontmatterResult.nextIndex; // EOF or end of yaml

    // Parse non-categorized words
    const uncategorizedResult = parseImplicitCategory(lines, index);
    const implicitCategory = uncategorizedResult.category;
    index = uncategorizedResult.nextIndex; // EOF or end of uncategorized

    // Parse categorized words
    const categories = parseCategories(lines, index);

    // If an implicit category was found before the first heading, prepend it
    // to the explicit categories. Otherwise, just use the explicit list.
    const allCategories = implicitCategory ? [implicitCategory, ...categories] :
        categories;

    return {
        metadata: metadata,
        categories: allCategories,
    };
}

/**
 * Detect and parse an optional YAML frontmatter block.
 *
 * Scans from the beginning of the file for an opening delimiter. If
 * found, delegates to parseFrontmatter to read the key-value pairs.
 * If no frontmatter is present, returns empty metadata and the index
 * of the first non-blank line.
 *
 * Expected frontmatter format:
 *
 *     ---
 *     title: My batch
 *     description: Practice words
 *     ---
 *
 * @param {string[]} lines - All file lines.
 * @returns {{metadata: Object, nextIndex: number}} Parsed metadata (or
 *     empty object if no frontmatter) and the index of the first line
 *     after the frontmatter block (or first non-blank line if none).
 * @throws {Error} If the closing delimiter is missing, or if a
 *     key-value pair is malformed.
 */
function parseFrontmatterBlock(lines) {
    let metadata = {};
    // line that starts next block of file
    // (immediately following end of YAML frontmatter,
    // or first non-blank line if no YAML frontmatter.)
    let endLine = 0;

    // find line number of first non-blank line instead
    // of trimming so error messages can print line numbers
    const firstNonBlankIndex = findFirstNonBlankLineIndex(lines);

    if (lines && firstNonBlankIndex < lines.length && lines[firstNonBlankIndex].trim() === FRONTMATTER_DELIMITER) {
        // YAML frontmatter detected.
        const metadataResult = parseFrontmatter(lines, firstNonBlankIndex);
        metadata = metadataResult.metadata;
        endLine = metadataResult.nextIndex; // line following yaml close
    } else {
        // first non-blank line was NOT frontmatter delim
        // so there is no YAML frontmatter.
        endLine = firstNonBlankIndex;
    }

    return {
        metadata: metadata,
        nextIndex: endLine
    }
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
 * Parse leading words that appear before any category heading.
 *
 * The parser supports category-less word lists. Words at the top of the
 * file, before the first '#' heading, are grouped into an implicit
 * category with an empty name. This category is later merged with the
 * explicit categories returned by parseCategories.
 *
 * Example input:
 *
 *     удочка
 *     леска
 *
 *     # Рыбы
 *     щука
 *
 * Returns:
 *
 *     {
 *         category: {
 *             name: "",
 *             level: 1,
 *             words: ["удочка", "леска"],
 *             subcategories: []
 *         },
 *         nextIndex: 4  // points to the line containing "# Рыбы"
 *     }
 *
 * If the first non-blank line is a heading, or if there are no words
 * before the first heading, the category is null and nextIndex is the
 * same as startIndex.
 *
 * @param {string[]} lines - All file lines.
 * @param {number} startIndex - Index of the first line to parse (after
 *     frontmatter, if any).
 * @returns {{category: CategoryNode|null, nextIndex: number}} The implicit
 *     category (or null if none), and the index of the first line after
 *     the implicit word block.
 * @throws {Error} If a malformed heading is encountered while scanning.
 */
function parseImplicitCategory(lines, startIndex) {
    // initialize an empty category node to represent
    // the implicit category (words with no category defined).
    // only create it if non-categorized nodes found
    // (that's how caller will know if such words were found)
    let category = null;
    let index = startIndex;

    for (index = startIndex; index < lines.length; index++) {
        const trimmed = lines[index].trim();

        // Stop at the first category heading. The heading itself is not
        // consumed here; parseCategories will handle it.
        if (trimmed.startsWith('#')) {
            break;
        }

        // Skip blank lines but continue scanning. We don't want blank
        // lines to terminate the implicit block prematurely.
        if (trimmed) {
            if (!category) {
                category = createCategoryNode('', 1);
            }
            category.words.push(trimmed);
        }
    }

    return {
        category,
        nextIndex: index,
    };
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
    /**
     * Top-level categories in the parsed document.
     *
     * Each entry is a CategoryNode with `name`, `level`, `words`, and
     * `subcategories`. Words and subcategories are nested within their
     * respective parent category.
     *
     * @type {Array<Object>}
     */
    const rootCategories = [];

    /**
     * Stack of category nodes representing the current nesting path.
     *
     * The last element is the category that new words or subcategories
     * should be added to. When a heading appears, the stack is adjusted
     * so that the correct parent is on top.
     *
     * Example for input:
     *   # A
     *   ## B
     *   ### C
     *   word
     *
     * After processing "### C", the stack is [A, B, C]. "word" is added
     * to C.
     *
     * @type {Array<Object>}
     */
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
                `parseCategories: internal error — encountered word "${trimmed}" at line ${i + 1} ` +
                `before any active category detected. parseCategories should only be called at EOF ` +
                `or at a line starting with '#'.`
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