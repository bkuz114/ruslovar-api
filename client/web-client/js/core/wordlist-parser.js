/**
 * Ruslovar API Demo — Word List Parser
 *
 * Parses plain-text word list files into a structured, class-based object
 * model for use by batch lookup views. Supports optional YAML-style
 * frontmatter for metadata, markdown-style category headings
 * (#, ##, ###, etc.), and arbitrary category nesting depth.
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
 * Usage:
 *
 *     const doc = new WordListDocument(rawText, { freeze: true });
 *     doc.parse();
 *
 *     doc.metadata;       // { title: "My batch", description: "..." }
 *     doc.categories;     // [CategoryNode, CategoryNode, ...]
 *     doc.countWords();   // 6
 *     doc.allWords();     // ["кролик", "лук", "стол", ...]
 *     doc.hasBeenParsed;  // true
 *     doc.getNodeById('line-5'); // WordNode or CategoryNode or null
 *     doc.allNodes();     // [CategoryNode|WordNode, ...] in document order
 *
 * The toJSON() methods return plain objects suitable for JSON
 * serialization and state restoration. The fromJSON() methods
 * reconstruct live documents and nodes from those plain objects,
 * enabling full round-trip serialization. View render functions
 * should accept these plain objects, which mirror the live node
 * getters.
 *
 * Dependencies:
 *   - None (standalone module)
 */

/** Frontmatter delimiter line. */
const FRONTMATTER_DELIMITER = '---';

/**
 * Create a deterministic ID from a line number.
 *
 * Context:
 * - A unique id will be needed by state management in batch
 *   view to re-open categories and words when navigating back
 *   and reloading previous state.
 * - Line number is chosen as the base for IDs because:
 *   1. they will be unique per document
 *   2. deterministic (same word/category in a document generates same id)
 *   3. helpful in debugging or inspecting saved state
 *
 * @param {number} line - Line number from the source file.
 * @returns {string} Deterministic line-based ID.
 */
function createLineId(line) {
    if (!Number.isInteger(line) || line < 1) {
        throw new TypeError(
            `createLineId: line must be a positive integer. Got ${line}`
        );
    }

    // prefix with line- so it's clear what the number represents
    return `line-${line}`;
}

/**
 * Validate that a plain object contains all required fields.
 *
 * Uses the `in` operator so falsy values (null, false, empty string,
 * empty array, empty object) are considered present. Only missing
 * properties trigger a TypeError.
 *
 * @param {Object} data - Object to validate.
 * @param {string[]} requiredFields - Field names that must exist.
 * @param {string} source - Name of the calling method for error messages.
 * @throws {TypeError} If data is not an object or any required field
 *     is missing.
 */
function validateRequiredFields(data, requiredFields, source) {
    if (!data || typeof data !== 'object') {
        throw new TypeError(
            `${source}: data must be a plain object`
        );
    }

    const missing = requiredFields.filter(field => !(field in data));

    if (missing.length > 0) {
        throw new TypeError(
            `${source}: data is missing required field(s): ${missing.join(', ')}`
        );
    }
}

/**
 * Represents a single word in the parsed document.
 *
 * A word node wraps a word string with a deterministic ID derived from
 * the line number where the word appears in the source file.
 *
 * Supports JSON serialization via toJSON() and reconstruction via
 * WordNode.fromJSON().
 */
export class WordNode {
    /**
     * @param {string} word - The word text.
     * @param {number} lineNumber - Line number where the word appears.
     * @param {boolean} [freeze=false] - Whether to freeze this instance.
     * @throws {TypeError} If word is not a non-empty string, lineNumber
     *     is not a positive integer, or freeze is not a boolean.
     */
    constructor(word, lineNumber, freeze = false) {
        if (typeof word !== 'string' || word.trim().length === 0) {
            throw new TypeError(
                'WordNode: word must be a non-empty string'
            );
        }

        if (!Number.isInteger(lineNumber) || lineNumber < 1) {
            throw new TypeError(
                'WordNode: lineNumber must be a positive integer'
            );
        }

        if (typeof freeze !== 'boolean') {
            throw new TypeError(
                'WordNode: freeze must be a boolean'
            );
        }

        this._type = 'word';
        this._id = createLineId(lineNumber);
        this._word = word;
        this._lineNumber = lineNumber;

        if (freeze) {
            Object.freeze(this);
        }
    }

    /** @returns {string} Node type discriminator. */
    get type() {
        return this._type;
    }

    /** @returns {string} Deterministic line-based ID. */
    get id() {
        return this._id;
    }

    /** @returns {string} The word text. */
    get word() {
        return this._word;
    }

    /** @returns {number} 1-based source line number. */
    get lineNumber() {
        return this._lineNumber;
    }

    /**
     * Convert this node to a plain serializable object.
     *
     * The returned object mirrors the live getters so view render
     * functions can work with either live nodes or plain JSON.
     *
     * @returns {{type: string, id: string, lineNumber: number,
     *     word: string, freeze: boolean}} Plain object representation.
     */
    toJSON() {
        return {
            type: this._type,
            id: this._id,
            lineNumber: this._lineNumber,
            word: this._word,
            freeze: Object.isFrozen(this),
        };
    }

    /**
     * Reconstruct a WordNode from a plain object produced by toJSON().
     *
     * The input must include type, id, lineNumber, word, and freeze
     * fields. The freeze field determines whether the reconstructed
     * node is frozen.
     *
     * @param {Object} data - Plain object produced by toJSON().
     * @returns {WordNode} Reconstructed word node.
     * @throws {TypeError} If data is malformed or missing required
     *     fields.
     */
    static fromJSON(data) {
        validateRequiredFields(
            data,
            ['type', 'id', 'lineNumber', 'word', 'freeze'],
            'WordNode.fromJSON'
        );

        return new WordNode(data.word, data.lineNumber, data.freeze);
    }
}

/**
 * Represents a category heading and its contents.
 *
 * A category node wraps a heading name, nesting level, and child word
 * and category nodes. It gets a deterministic ID derived from the line
 * number where the heading appears in the source file.
 *
 * Supports JSON serialization via toJSON() and reconstruction via
 * CategoryNode.fromJSON().
 */
export class CategoryNode {
    /**
     * @param {string} name - Category name (empty for implicit category).
     * @param {number} level - Heading level (1 or greater).
     * @param {number} lineNumber - Line number where the heading appears.
     * @param {WordNode[]} [words=[]] - Word nodes directly under this category.
     * @param {CategoryNode[]} [subcategories=[]] - Nested category nodes.
     * @param {boolean} [freeze=false] - Whether to freeze this instance
     *     and its arrays.
     * @throws {TypeError} If any argument has an invalid type.
     */
    constructor(
        name,
        level,
        lineNumber,
        words = [],
        subcategories = [],
        freeze = false
    ) {
        if (typeof name !== 'string') {
            throw new TypeError(
                'CategoryNode: name must be a string'
            );
        }

        if (!Number.isInteger(level) || level < 1) {
            throw new TypeError(
                'CategoryNode: level must be a positive integer'
            );
        }

        if (!Number.isInteger(lineNumber) || lineNumber < 1) {
            throw new TypeError(
                'CategoryNode: lineNumber must be a positive integer'
            );
        }

        if (!Array.isArray(words)) {
            throw new TypeError(
                'CategoryNode: words must be an array'
            );
        }

        if (!Array.isArray(subcategories)) {
            throw new TypeError(
                'CategoryNode: subcategories must be an array'
            );
        }

        if (typeof freeze !== 'boolean') {
            throw new TypeError(
                'CategoryNode: freeze must be a boolean'
            );
        }

        this._type = 'category';
        this._id = createLineId(lineNumber);
        this._name = name;
        this._level = level;
        this._lineNumber = lineNumber;
        this._words = words;
        this._subcategories = subcategories;

        if (freeze) {
            Object.freeze(this._words);
            Object.freeze(this._subcategories);
            Object.freeze(this);
        }
    }

    /** @returns {string} Node type discriminator. */
    get type() {
        return this._type;
    }

    /** @returns {string} Deterministic line-based ID. */
    get id() {
        return this._id;
    }

    /** @returns {string} Category name (without '#' characters). */
    get name() {
        return this._name;
    }

    /** @returns {number} Heading level (1 or greater). */
    get level() {
        return this._level;
    }

    /** @returns {number} 1-based source line number. */
    get lineNumber() {
        return this._lineNumber;
    }

    /** @returns {WordNode[]} Word nodes directly under this category. */
    get words() {
        return this._words;
    }

    /** @returns {CategoryNode[]} Nested subcategories. */
    get subcategories() {
        return this._subcategories;
    }

    /**
     * Count the total number of words in this category and all
     * descendants.
     *
     * Recursively includes words from nested subcategories.
     *
     * @returns {number} Total word count.
     */
    countWords() {
        let total = this._words.length;

        for (const subcategory of this._subcategories) {
            total += subcategory.countWords();
        }

        return total;
    }

    /**
     * Get all word strings in this category and all descendants.
     *
     * Returns a flat array in depth-first order, with words from this
     * category before words from subcategories.
     *
     * @returns {string[]} All word strings.
     */
    allWords() {
        const words = this._words.map(wordNode => wordNode.word);

        for (const subcategory of this._subcategories) {
            words.push(...subcategory.allWords());
        }

        return words;
    }

    /**
     * Convert this node and all descendants to a plain serializable
     * object.
     *
     * The returned object mirrors the live getters so view render
     * functions can work with either live nodes or plain JSON.
     *
     * @returns {{type: string, id: string, lineNumber: number,
     *     name: string, level: number, words: Object[],
     *     subcategories: Object[], freeze: boolean}} Plain object
     *     representation.
     */
    toJSON() {
        return {
            type: this._type,
            id: this._id,
            lineNumber: this._lineNumber,
            name: this._name,
            level: this._level,
            words: this._words.map(wordNode => wordNode.toJSON()),
            subcategories: this._subcategories.map(
                categoryNode => categoryNode.toJSON()
            ),
            freeze: Object.isFrozen(this),
        };
    }

    /**
     * Reconstruct a CategoryNode from a plain object produced by
     * toJSON().
     *
     * The input must include type, id, lineNumber, name, level, words,
     * subcategories, and freeze fields. Word and subcategory objects
     * are recursively reconstructed.
     *
     * @param {Object} data - Plain object produced by toJSON().
     * @returns {CategoryNode} Reconstructed category node.
     * @throws {TypeError} If data is malformed or missing required
     *     fields.
     */
    static fromJSON(data) {
        validateRequiredFields(
            data,
            ['type', 'id', 'lineNumber', 'name', 'level', 'words', 'subcategories', 'freeze'],
            'CategoryNode.fromJSON'
        );

        const words = data.words.map(
            wordData => WordNode.fromJSON(wordData)
        );

        const subcategories = data.subcategories.map(
            categoryData => CategoryNode.fromJSON(categoryData)
        );

        return new CategoryNode(
            data.name,
            data.level,
            data.lineNumber,
            words,
            subcategories,
            data.freeze
        );
    }
}

/**
 * Represents a complete parsed word list document.
 *
 * This is the main entry point for parsing word list files. It holds
 * the raw text and exposes the parsed structure via getters after
 * calling parse().
 *
 * When constructed with { freeze: true }, the document becomes deeply
 * frozen as the final step of parse(). After that point, the document
 * is immutable and parse() cannot be called again.
 *
 * Supports JSON serialization via toJSON() and full round-trip
 * reconstruction via WordListDocument.fromJSON().
 */
export class WordListDocument {
    /**
     * @param {string} rawText - Raw word list file contents.
     * @param {Object} [options] - Parser options.
     * @param {boolean} [options.freeze=false] - Whether to deeply freeze
     *     this document, its categories, and its word nodes as the final
     *     step of parse(). Once frozen, the document cannot be re-parsed.
     *     The freeze flag is preserved through toJSON()/fromJSON().
     * @throws {TypeError} If rawText is not a string, options is not an
     *     object, or options.freeze is not a boolean.
     */
    constructor(rawText, {
        freeze = false
    } = {}) {
        if (typeof rawText !== 'string') {
            throw new TypeError(
                'WordListDocument: rawText must be a string'
            );
        }

        if (typeof freeze !== 'boolean') {
            throw new TypeError(
                'WordListDocument: options.freeze must be a boolean'
            );
        }

        this._rawText = rawText;
        this._freeze = freeze;
        this._metadata = {};
        this._categories = [];
        this._isParsed = false;
        // ID → node for O(1) lookup in getNodeById()
        this._nodeMap = new Map();
    }

    /** @returns {Object} Frontmatter metadata (key-value pairs). */
    get metadata() {
        return this._metadata;
    }

    /** @returns {CategoryNode[]} Top-level category nodes. */
    get categories() {
        return this._categories;
    }

    /** @returns {boolean} Whether parse() has been called successfully. */
    get hasBeenParsed() {
        return this._isParsed;
    }

    /**
     * Parse the raw text and populate this document's metadata and
     * categories.
     *
     * Can be called multiple times to re-parse after modifying the raw
     * text, unless the document was constructed with { freeze: true }.
     * In that case, parse() becomes single-use: the document is deeply
     * frozen as the final step of parsing, and any subsequent call to
     * parse() throws.
     *
     * @returns {void}
     * @throws {Error} If the input is malformed, or if parse() is called
     *     on a frozen document.
     */
    parse() {
        if (Object.isFrozen(this)) {
            throw new Error(
                'WordListDocument: parse() cannot be called on a frozen document'
            );
        }

        const lines = this._rawText.split(/\r?\n/);

        // Reset parsed state.
        this._metadata = {};
        this._categories = [];
        this._nodeMap = new Map();

        // Parse optional frontmatter
        const frontmatterResult = this._parseFrontmatterBlock(lines);
        this._metadata = frontmatterResult.metadata;
        let index = frontmatterResult.nextIndex; // EOF or end of yaml

        // Parse non-categorized words
        const uncategorizedResult = this._parseImplicitCategory(lines, index);
        const implicitCategory = uncategorizedResult.category;
        index = uncategorizedResult.nextIndex; // EOF or end of uncategorized

        // Parse categorized words
        const categories = this._parseCategories(lines, index);

        // If an implicit category was found before the first heading, prepend it
        // to the explicit categories. Otherwise, just use the explicit list.
        this._categories = implicitCategory ? [implicitCategory, ...categories] :
            categories;

        this._isParsed = true;

        // Apply document-level freeze after the tree is fully built.
        if (this._freeze) {
            this._deepFreezeDocument();
        }
    }

    /**
     * Count the total number of words in the parsed document.
     *
     * @returns {number} Total word count.
     * @throws {Error} If parse() has not been called.
     */
    countWords() {
        this._assertParsed();

        let total = 0;

        for (const category of this._categories) {
            total += category.countWords();
        }

        return total;
    }

    /**
     * Get all word strings in the parsed document.
     *
     * Returns a flat array in depth-first order, preserving document
     * order across categories and subcategories.
     *
     * @returns {string[]} All word strings.
     * @throws {Error} If parse() has not been called.
     */
    allWords() {
        this._assertParsed();

        const words = [];

        for (const category of this._categories) {
            words.push(...category.allWords());
        }

        return words;
    }

    /**
     * Get a node by its deterministic line-based ID.
     *
     * @param {string} id - Node ID (e.g. "line-42").
     * @returns {WordNode|CategoryNode|null} Node if found, null otherwise.
     * @throws {Error} If parse() has not been called.
     * @throws {TypeError} If id is not a non-empty string.
     */
    getNodeById(id) {
        this._assertParsed();

        if (typeof id !== 'string' || id.length === 0) {
            throw new TypeError(
                'WordListDocument.getNodeById: id must be a non-empty string'
            );
        }

        return this._nodeMap.get(id) || null;
    }

    /**
     * Get all nodes (words and categories) in document order.
     *
     * Nodes are returned in the order they appear in the source document:
     * category headings and their nested contents are visited depth-first,
     * with a category node preceding its words and subcategories.
     *
     * @returns {Array<WordNode|CategoryNode>} All nodes in document order.
     * @throws {Error} If parse() has not been called.
     */
    allNodes() {
        this._assertParsed();

        const nodes = [];

        for (const category of this._categories) {
            this._collectCategoryNodes(category, nodes);
        }

        return nodes;
    }

    /**
     * Convert the parsed document to a plain serializable object.
     *
     * The returned object mirrors the live getters so view render
     * functions can work with either live nodes or plain JSON.
     *
     * Includes rawText, freeze, and isParsed so that fromJSON() can
     * reconstruct the document in its exact current state.
     *
     * @returns {{rawText: string, freeze: boolean, isParsed: boolean,
     *     metadata: Object, categories: Object[]}} Plain object
     *     representation.
     * @throws {Error} If parse() has not been called.
     */
    toJSON() {
        this._assertParsed();

        return {
            rawText: this._rawText,
            freeze: this._freeze,
            isParsed: this._isParsed,
            metadata: {
                ...this._metadata
            },
            categories: this._categories.map(
                categoryNode => categoryNode.toJSON()
            ),
        };
    }

    /**
     * Reconstruct a WordListDocument from a JSON string or plain object.
     *
     * The input must have the shape produced by toJSON():
     *     {
     *         rawText: string,
     *         freeze: boolean,
     *         isParsed: boolean,
     *         metadata: Object,
     *         categories: Array<Object>
     *     }
     *
     * Each category and word object must include a lineNumber field.
     * The id field is derived from lineNumber during reconstruction.
     *
     * @param {string|Object} json - JSON string or plain object produced
     *     by toJSON().
     * @returns {WordListDocument} Reconstructed document in the same
     *     state (parsed or unparsed) as when toJSON() was called.
     * @throws {TypeError} If json is not a string or object, or if the
     *     structure is malformed or missing required fields.
     */
    static fromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;

        validateRequiredFields(
            data,
            ['rawText', 'freeze', 'isParsed', 'metadata', 'categories'],
            'WordListDocument.fromJSON'
        );

        // Construct an unfrozen document first. Property assignment
        // below requires the document to be mutable. Freezing (if
        // requested) happens only after the document is fully built.
        const doc = new WordListDocument(data.rawText, {
            freeze: data.freeze,
        });

        doc._metadata = {
            ...data.metadata
        };

        // Reconstruct the category tree. Nodes may already be frozen
        // individually (because their serialized freeze flag was true).
        // This is fine: frozen nodes can be assembled into the tree
        // without issue, and Object.freeze() is idempotent.
        doc._categories = data.categories.map(
            categoryData => CategoryNode.fromJSON(categoryData)
        );

        // Create a fresh mutable Map for node registration. This must
        // happen before _deepFreezeDocument() because the _registerNode
        // calls below add entries via Map.set(), which cannot be called
        // on a frozen Map.
        doc._nodeMap = new Map();

        // Register all nodes so getNodeById() works without re-parsing.
        // This mutates _nodeMap, which is still unfrozen at this point.
        for (const category of doc._categories) {
            doc._registerTree(category);
        }

        // Restore the parsed state. This must happen before freezing
        // because assigning to _isParsed on a frozen document would
        // throw in strict mode.
        doc._isParsed = data.isParsed;

        // If the original document was frozen, freeze the reconstructed
        // document to match. This is idempotent for nodes that were
        // already frozen during their own fromJSON() calls.
        if (doc._isParsed && doc._freeze) {
            doc._deepFreezeDocument();
        }

        return doc;
    }

    /**
     * Ensure the document has been parsed before allowing access to
     * parsed state.
     *
     * @returns {void}
     * @throws {Error} If parse() has not been called.
     * @private
     */
    _assertParsed() {
        if (!this._isParsed) {
            throw new Error(
                'WordListDocument: parse() must be called before ' +
                'accessing parsed data'
            );
        }
    }

    /**
     * Recursively register a category and all its descendants in the
     * document's ID lookup map.
     *
     * Why this is needed in addition to _registerNode:
     *
     * During normal parsing, nodes are registered incrementally as the
     * parser builds the tree. Each CategoryNode and WordNode is added
     * to _nodeMap as soon as it is created, ensuring getNodeById()
     * works immediately after parse() completes.
     *
     * However, when reconstructing a document via fromJSON(), nodes are
     * created through CategoryNode.fromJSON() and WordNode.fromJSON().
     * These static methods build the tree structure but do not register
     * nodes with any document, because they are standalone and have no
     * reference to a WordListDocument instance leaving _nodeMap empty.
     *
     * This method fills that gap. It walks the reconstructed tree and
     * registers every node, restoring the invariant that all nodes in
     * the document are present in _nodeMap. Without this step,
     * getNodeById() would return null for every ID in a reconstructed
     * document.
     *
     * @param {CategoryNode} category - Category node to register,
     *     along with all of its descendants.
     * @returns {void}
     * @private
     */
    _registerTree(category) {
        // Register the category itself first.
        this._registerNode(category);

        // Register all word nodes directly under this category.
        for (const wordNode of category.words) {
            this._registerNode(wordNode);
        }

        // Recursively register all subcategories and their contents.
        for (const subcategory of category.subcategories) {
            this._registerTree(subcategory);
        }
    }

    /**
     * Register a node in the document's ID lookup map.
     *
     * @param {WordNode|CategoryNode} node - Node to register.
     * @returns {void}
     * @private
     */
    _registerNode(node) {
        this._nodeMap.set(node.id, node);
    }

    /**
     * Recursively freeze the parsed document tree.
     *
     * Freezes metadata, categories, all nested subcategories, and all
     * word nodes. This is applied only after parsing completes, so the
     * parser can build the tree using mutable nodes.
     *
     * @returns {void}
     * @private
     */
    _deepFreezeDocument() {
        Object.freeze(this._metadata);

        for (const category of this._categories) {
            this._deepFreezeCategory(category);
        }

        Object.freeze(this._categories);
        // freeze the WordListParser itself
        Object.freeze(this);
    }

    /**
     * Recursively freeze a category node and its descendants.
     *
     * @param {CategoryNode} category - Category node to freeze.
     * @returns {void}
     * @private
     */
    _deepFreezeCategory(category) {
        Object.freeze(category.words);

        for (const wordNode of category.words) {
            Object.freeze(wordNode);
        }

        Object.freeze(category.subcategories);

        for (const subcategory of category.subcategories) {
            this._deepFreezeCategory(subcategory);
        }

        Object.freeze(category);
    }

    /**
     * Recursively collect a category and all its descendants in document
     * order.
     *
     * Order: category node first, then its words, then each subcategory
     * (recursively, depth-first).
     *
     * @param {CategoryNode} category - Category node to collect.
     * @param {Array<WordNode|CategoryNode>} nodes - Accumulator array.
     * @returns {void}
     * @private
     */
    _collectCategoryNodes(category, nodes) {
        nodes.push(category);

        for (const wordNode of category.words) {
            nodes.push(wordNode);
        }

        for (const subcategory of category.subcategories) {
            this._collectCategoryNodes(subcategory, nodes);
        }
    }

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
     * @private
     */
    _findFirstNonBlankLineIndex(lines) {
        let index = 0;
        while (index < lines.length && lines[index].trim() === '') {
            index++;
        }
        return index;
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
     * @private
     */
    _parseFrontmatterBlock(lines) {
        let metadata = {};
        // line that starts next block of file
        // (immediately following end of YAML frontmatter,
        // or first non-blank line if no YAML frontmatter.)
        let endLine = 0;

        // find line number of first non-blank line instead
        // of trimming so error messages can print line numbers
        const firstNonBlankIndex = this._findFirstNonBlankLineIndex(lines);

        if (lines && firstNonBlankIndex < lines.length && lines[firstNonBlankIndex].trim() === FRONTMATTER_DELIMITER) {
            // YAML frontmatter detected.
            const metadataResult = this._parseFrontmatter(lines, firstNonBlankIndex);
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
     * @private
     */
    _parseFrontmatter(lines, startIndex) {
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
     *             words: [
     *                 { word: "удочка", id: "line-5" },
     *                 { word: "леска", id: "line-6" }
     *                 // (note: id is unique string generated in
     *                 // createWordNode based on line number word appears on)
     *             ],
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
     * @private
     */
    _parseImplicitCategory(lines, startIndex) {
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
                // Word Hit.

                // No node yet for word's category - create before adding WordNode to it
                if (!category) {
                    // Ensure CategoryNode NOT frozen during parsing: freezing during parsing
                    // would prevent subsequent words from being added to the category. (The
                    // document will be deep-frozen after parsing if this._freeze is true.)
                    category = new CategoryNode('', 1, index + 1, [], [], false);
                    this._registerNode(category);
                }

                // Ensure WordNode is NOT frozen during parsing: freezing during parsing
                // would prevent subsequent operations on it. (Document will be deep-frozen
                // after parsing if this._freeze is true.)
                const wordNode = new WordNode(trimmed, index + 1, false);
                category.words.push(wordNode);
                this._registerNode(wordNode);
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
     * @private
     */
    _parseCategories(lines, startIndex) {
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
                const level = this._getHeadingLevel(trimmed);
                const name = trimmed.slice(level).trim();

                if (!name) {
                    throw new Error(
                        `Line ${i + 1}: Category heading is missing a name.`
                    );
                }

                // Ensure node is NOT frozen during parsing: freezing during parsing
                // would prevent subsequent words from being added to the category. (The
                // document will be deep-frozen as a whole after parsing if this._freeze is true.)
                const category = new CategoryNode(
                    name,
                    level,
                    i + 1,
                    [],
                    [],
                    false
                );
                this._registerNode(category);

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

            // get the word's category to add it to
            const currentCategory = stack[stack.length - 1];

            // Create WordNode for the word.

            // Ensure WordNode is NOT frozen during parsing: freezing during parsing
            // would prevent subsequent operations on it. (Document will be deep-frozen
            // after parsing if this._freeze is true.)
            const wordNode = new WordNode(trimmed, i + 1, false);
            currentCategory.words.push(wordNode);
            this._registerNode(wordNode);
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
     * @private
     */
    _getHeadingLevel(line) {
        let level = 0;
        while (line[level] === '#') {
            level++;
        }
        return level;
    }
}