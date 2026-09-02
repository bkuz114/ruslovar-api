import {
    WordListDocument,
    CategoryNode,
    WordNode,
} from '../js/core/parsers/wordlist-parser.js';

import {
    assert,
    runAllTests,
} from './helpers/test-harness.js';

/**
 * Helper to parse input text into a WordListDocument.
 *
 * @param {string} text - Raw word list file contents.
 * @param {Object} [options] - Parser options.
 * @returns {WordListDocument} Parsed document.
 */
function parse(text, options) {
    const doc = new WordListDocument(text, options);
    doc.parse();
    return doc;
}

/**
 * Test: parses a full document with frontmatter, nested categories,
 * and words. Verifies metadata, top-level categories, subcategories,
 * word counts, and word text.
 */
function testValidInput() {
    const input = `---
title: Test Batch
description: Practice words
---
# Nouns
кролик
лук

## Masculine
стол

## Feminine
лука

# Adjectives
красный
`;

    const doc = parse(input);

    assert(doc.hasBeenParsed, 'hasBeenParsed should be true after parse()');
    assert(doc.metadata.title === 'Test Batch', 'metadata.title should be "Test Batch"');
    assert(doc.metadata.description === 'Practice words', 'metadata.description should be "Practice words"');
    assert(doc.categories.length === 2, 'should have two top-level categories');

    const nouns = doc.categories[0];
    assert(nouns instanceof CategoryNode, 'first category should be a CategoryNode');
    assert(nouns.type === 'category', 'category type should be "category"');
    assert(nouns.name === 'Nouns', 'first category should be "Nouns"');
    assert(nouns.level === 1, 'first category level should be 1');
    assert(nouns.words.length === 2, 'Nouns should have two direct words');
    assert(nouns.words[0].word === 'кролик', 'first word should be "кролик"');
    assert(nouns.words[1].word === 'лук', 'second word should be "лук"');
    assert(nouns.subcategories.length === 2, 'Nouns should have two subcategories');

    const masculine = nouns.subcategories[0];
    assert(masculine instanceof CategoryNode, 'subcategory should be a CategoryNode');
    assert(masculine.name === 'Masculine', 'first subcategory should be "Masculine"');
    assert(masculine.level === 2, 'Masculine level should be 2');
    assert(masculine.words.length === 1, 'Masculine should have one word');
    assert(masculine.words[0].word === 'стол', 'Masculine word should be "стол"');

    const adjectives = doc.categories[1];
    assert(adjectives.name === 'Adjectives', 'second category should be "Adjectives"');
    assert(adjectives.words.length === 1, 'Adjectives should have one word');
    assert(adjectives.words[0].word === 'красный', 'Adjectives word should be "красный"');
}

/**
 * Test: parses a document without frontmatter. Verifies metadata is
 * empty and the single category is parsed correctly.
 */
function testNoFrontmatter() {
    const input = `# Nouns
кролик
`;

    const doc = parse(input);

    assert(Object.keys(doc.metadata).length === 0, 'metadata should be empty');
    assert(doc.categories.length === 1, 'should have one category');
    assert(doc.categories[0].name === 'Nouns', 'category should be "Nouns"');
    assert(doc.categories[0].words.length === 1, 'Nouns should have one word');
    assert(doc.categories[0].words[0].word === 'кролик', 'word should be "кролик"');
}

/**
 * Test: parses an empty file. Verifies metadata and categories are
 * both empty.
 */
function testEmptyFile() {
    const input = ``;

    const doc = parse(input);

    assert(Object.keys(doc.metadata).length === 0, 'metadata should be empty');
    assert(doc.categories.length === 0, 'categories should be empty');
    assert(doc.countWords() === 0, 'word count should be 0');
    assert(doc.allWords().length === 0, 'allWords should be empty');
}

/**
 * Test: parses a whitespace-only file. Verifies metadata and
 * categories are both empty.
 */
function testWhitespaceOnlyFile() {
    const input = `   
    
    `;

    const doc = parse(input);

    assert(Object.keys(doc.metadata).length === 0, 'metadata should be empty');
    assert(doc.categories.length === 0, 'categories should be empty');
    assert(doc.countWords() === 0, 'word count should be 0');
    assert(doc.allWords().length === 0, 'allWords should be empty');
}

/**
 * Test: leading blank lines before frontmatter are ignored. Verifies
 * frontmatter is still parsed and categories are present.
 */
function testLeadingBlankLinesBeforeFrontmatter() {
    const input = `

---
title: Test
---
# Nouns
кролик
`;

    const doc = parse(input);

    assert(doc.metadata.title === 'Test', 'metadata.title should be "Test"');
    assert(doc.categories.length === 1, 'should have one category');
    assert(doc.categories[0].name === 'Nouns', 'category should be "Nouns"');
}

/**
 * Test: frontmatter without a closing delimiter throws an error.
 */
function testMissingClosingFrontmatterDelimiter() {
    // No closing delimiter before end of file.
    const input = `---
title: Test
`;

    let threw = false;
    try {
        parse(input);
    } catch (e) {
        threw = true;
        assert(e.message.includes('missing closing'), 'error should mention missing closing delimiter');
    }

    assert(threw, 'should throw on missing closing delimiter');
}

/**
 * Test: words without any heading produce a single implicit category.
 *
 * Input:
 *     удочка
 *     леска
 *
 * Expected: one category with empty name containing both words.
 */
function testImplicitCategoryOnly() {
    const input = `удочка
леска
`;

    const doc = parse(input);

    assert(doc.categories.length === 1, 'should have one category');
    assert(doc.categories[0].name === '', 'implicit category name should be empty');
    assert(doc.categories[0].level === 1, 'implicit category level should be 1');
    assert(doc.categories[0].words.length === 2, 'should have two words');
    assert(doc.categories[0].words[0].word === 'удочка', 'first word should be удочка');
    assert(doc.categories[0].words[1].word === 'леска', 'second word should be леска');
    assert(doc.categories[0].subcategories.length === 0, 'should have no subcategories');
}

/**
 * Test: implicit category (words before any heading) coexists with
 * explicit categories.
 *
 * Input:
 *     удочка
 *     леска
 *
 *     # Рыбы
 *     щука
 *
 * Expected: two top-level categories. The first has an empty name
 * (implicit). The second is named "Рыбы".
 */
function testImplicitCategoryWithExplicitCategories() {
    const input = `удочка
леска

# Рыбы
щука
`;

    const doc = parse(input);

    assert(doc.categories.length === 2, 'should have two top-level categories');
    assert(doc.categories[0].name === '', 'first category should be implicit');
    assert(doc.categories[0].words.length === 2, 'implicit should have two words');
    assert(doc.categories[1].name === 'Рыбы', 'second category should be Рыбы');
    assert(doc.categories[1].words.length === 1, 'Рыбы should have one word');
}

/**
 * Test: explicit category headings only (no implicit category).
 *
 * Input:
 *     # Рыбы
 *     щука
 *
 * Expected: one category named "Рыбы" with one word.
 */
function testExplicitCategoriesOnly() {
    const input = `# Рыбы
щука
`;

    const doc = parse(input);

    assert(doc.categories.length === 1, 'should have one category');
    assert(doc.categories[0].name === 'Рыбы', 'category should be Рыбы');
    assert(doc.categories[0].words.length === 1, 'Рыбы should have one word');
    assert(doc.categories[0].words[0].word === 'щука', 'word should be щука');
}

/**
 * Test: nested heading without a parent throws an error.
 */
function testNestedHeadingWithoutParent() {
    const input = `## Masculine
стол
`;

    let threw = false;
    try {
        parse(input);
    } catch (e) {
        threw = true;
        assert(e.message.includes('no parent heading'), 'error should mention no parent heading');
    }

    assert(threw, 'should throw on nested heading without parent');
}

/**
 * Test: malformed frontmatter entry (missing colon) throws an error.
 */
function testMalformedFrontmatterEntry() {
    // Missing colon on a frontmatter line.
    const input = `---
title
---
# Nouns
кролик
`;

    let threw = false;
    try {
        parse(input);
    } catch (e) {
        threw = true;
        assert(e.message.includes('Malformed frontmatter'), 'error should mention malformed frontmatter');
    }

    assert(threw, 'should throw on malformed frontmatter entry');
}

/**
 * Test: countWords returns the total number of words across all
 * categories and subcategories.
 */
function testCountWords() {
    const input = `# Nouns
кролик
лук

## Masculine
стол

# Adjectives
красный
`;

    const doc = parse(input);

    assert(doc.countWords() === 4, 'should count 4 total words');
}

/**
 * Test: allWords returns a flat array of all word strings in document
 * order.
 */
function testAllWords() {
    const input = `# Nouns
кролик

## Masculine
стол

# Adjectives
красный
`;

    const doc = parse(input);

    const words = doc.allWords();

    assert(Array.isArray(words), 'allWords should return an array');
    assert(words.length === 3, 'should return 3 words');
    assert(words[0] === 'кролик', 'first word should be "кролик"');
    assert(words[1] === 'стол', 'second word should be "стол"');
    assert(words[2] === 'красный', 'third word should be "красный"');
}

/**
 * Test: getNodeById returns the correct node for a given line-based ID.
 */
function testGetNodeById() {
    const input = `# Nouns
кролик
`;

    const doc = parse(input);

    const category = doc.categories[0];
    const word = category.words[0];

    const foundCategory = doc.getNodeById(category.id);
    const foundWord = doc.getNodeById(word.id);

    assert(foundCategory === category, 'should find category by ID');
    assert(foundWord === word, 'should find word by ID');
    assert(doc.getNodeById('line-999') === null, 'should return null for unknown ID');
}

/**
 * Test: allNodes returns all nodes (categories and words) in document
 * order.
 */
function testAllNodes() {
    const input = `# Nouns
кролик

## Masculine
стол
`;

    const doc = parse(input);

    const nodes = doc.allNodes();

    assert(Array.isArray(nodes), 'allNodes should return an array');
    assert(nodes.length === 4, 'should return 4 nodes (2 categories + 2 words)');
    assert(nodes[0] instanceof CategoryNode, 'first node should be a category');
    assert(nodes[0].name === 'Nouns', 'first node should be "Nouns"');
    assert(nodes[1] instanceof WordNode, 'second node should be a word');
    assert(nodes[1].word === 'кролик', 'second node should be "кролик"');
    assert(nodes[2] instanceof CategoryNode, 'third node should be a category');
    assert(nodes[2].name === 'Masculine', 'third node should be "Masculine"');
    assert(nodes[3] instanceof WordNode, 'fourth node should be a word');
    assert(nodes[3].word === 'стол', 'fourth node should be "стол"');
}

/**
 * Test: toJSON returns a plain serializable object matching the live
 * node structure, including rawText, freeze, isParsed, lineNumber,
 * and per-node freeze state.
 */
function testToJSON() {
    const input = `---
title: Test
---
# Nouns
кролик
`;

    const doc = parse(input, {
        freeze: true
    });
    const json = doc.toJSON();

    // Document-level fields.
    assert(json.rawText === input, 'JSON should include rawText');
    assert(json.freeze === true, 'JSON should include freeze');
    assert(json.isParsed === true, 'JSON should include isParsed');

    // Metadata.
    assert(json.metadata.title === 'Test', 'JSON metadata should include title');

    // Categories.
    assert(Array.isArray(json.categories), 'JSON categories should be an array');
    assert(json.categories.length === 1, 'JSON should have one category');

    const category = json.categories[0];
    assert(category.type === 'category', 'JSON category should have type "category"');
    assert(category.id === 'line-4', 'JSON category id should be "line-4"');
    assert(category.lineNumber === 4, 'JSON category should include lineNumber');
    assert(category.name === 'Nouns', 'JSON category should be "Nouns"');
    assert(category.level === 1, 'JSON category level should be 1');
    assert(category.freeze === true, 'JSON category should include freeze');
    assert(Array.isArray(category.words), 'JSON category words should be an array');
    assert(category.words.length === 1, 'JSON category should have one word');

    const word = category.words[0];
    assert(word.type === 'word', 'JSON word should have type "word"');
    assert(word.id === 'line-5', 'JSON word id should be "line-5"');
    assert(word.lineNumber === 5, 'JSON word should include lineNumber');
    assert(word.word === 'кролик', 'JSON word should be "кролик"');
    assert(word.freeze === true, 'JSON word should include freeze');

    // Ensure it can be stringified without circular reference errors.
    const stringified = JSON.stringify(json);
    assert(typeof stringified === 'string', 'toJSON result should be JSON-stringifiable');
}

/**
 * Test: parse() can be called multiple times and resets state.
 */
function testReparse() {
    const input = `# Nouns
кролик
`;

    const doc = new WordListDocument(input);
    doc.parse();

    assert(doc.hasBeenParsed, 'hasBeenParsed should be true after first parse');
    assert(doc.categories.length === 1, 'should have one category after first parse');

    // Parse again — should produce identical results.
    doc.parse();

    assert(doc.hasBeenParsed, 'hasBeenParsed should still be true after reparse');
    assert(doc.categories.length === 1, 'should have one category after reparse');
    assert(doc.categories[0].name === 'Nouns', 'category should be "Nouns" after reparse');
}

/**
 * Test: freeze option deeply freezes the document and its nodes.
 */
function testFreezeOption() {
    const input = `# Nouns
кролик
`;

    const doc = parse(input, {
        freeze: true
    });

    assert(Object.isFrozen(doc), 'document should be frozen');
    assert(Object.isFrozen(doc.categories), 'categories array should be frozen');
    assert(Object.isFrozen(doc.categories[0]), 'category should be frozen');
    assert(Object.isFrozen(doc.categories[0].words), 'words array should be frozen');
    assert(Object.isFrozen(doc.categories[0].words[0]), 'word node should be frozen');
}

/**
 * Test: accessing parsed data before parse() throws an error.
 */
function testAccessBeforeParseThrows() {
    const doc = new WordListDocument('# Nouns\nкролик\n');

    let threw = false;
    try {
        doc.countWords();
    } catch (e) {
        threw = true;
        assert(e.message.includes('parse() must be called'), 'error should mention calling parse()');
    }

    assert(threw, 'should throw when accessing countWords before parse()');

    threw = false;
    try {
        doc.getNodeById('line-1');
    } catch (e) {
        threw = true;
    }

    assert(threw, 'should throw when accessing getNodeById before parse()');
}

/**
 * Test: invalid constructor arguments throw TypeError.
 */
function testConstructorValidation() {
    let threw = false;

    // Non-string.
    try {
        new WordListDocument(42);
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'non-string should throw TypeError');
    }
    assert(threw, 'should throw on non-string');

    threw = false;

    // Invalid freeze option.
    try {
        new WordListDocument('text', {
            freeze: 'yes'
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'invalid freeze should throw TypeError');
    }
    assert(threw, 'should throw on invalid freeze option');
}

/**
 * Test: WordNode and CategoryNode have correct type fields and
 * deterministic IDs.
 */
function testNodeTypesAndIds() {
    const input = `# Nouns
кролик
`;

    const doc = parse(input);
    const category = doc.categories[0];
    const word = category.words[0];

    assert(category.type === 'category', 'category type should be "category"');
    assert(word.type === 'word', 'word type should be "word"');
    assert(category.id.startsWith('line-'), 'category ID should start with "line-"');
    assert(word.id.startsWith('line-'), 'word ID should start with "line-"');
    assert(category.id !== word.id, 'category and word IDs should be different');
}

/**
 * Test: WordNode exposes lineNumber getter and includes it in toJSON().
 */
function testWordNodeLineNumber() {
    const word = new WordNode('кролик', 5);

    assert(word.lineNumber === 5, 'lineNumber getter should return 5');
    assert(word.id === 'line-5', 'id should be "line-5"');

    const json = word.toJSON();
    assert(json.lineNumber === 5, 'toJSON should include lineNumber');
}

/**
 * Test: CategoryNode exposes lineNumber getter and includes it in
 * toJSON().
 */
function testCategoryNodeLineNumber() {
    const category = new CategoryNode('Nouns', 1, 4);

    assert(category.lineNumber === 4, 'lineNumber getter should return 4');
    assert(category.id === 'line-4', 'id should be "line-4"');

    const json = category.toJSON();
    assert(json.lineNumber === 4, 'toJSON should include lineNumber');
}

/**
 * Test: WordNode toJSON includes freeze state and fromJSON restores it.
 */
function testWordNodeRoundTrip() {
    const word = new WordNode('кролик', 5, true);
    const json = word.toJSON();

    assert(json.freeze === true, 'toJSON should report freeze as true');

    const restored = WordNode.fromJSON(json);

    assert(restored instanceof WordNode, 'restored should be a WordNode');
    assert(restored.word === 'кролик', 'restored word should be "кролик"');
    assert(restored.lineNumber === 5, 'restored lineNumber should be 5');
    assert(restored.id === 'line-5', 'restored id should be "line-5"');
    assert(Object.isFrozen(restored), 'restored node should be frozen');
}

/**
 * Test: WordNode fromJSON without freeze preserves unfrozen state.
 */
function testWordNodeRoundTripUnfrozen() {
    const word = new WordNode('кролик', 5, false);
    const json = word.toJSON();

    assert(json.freeze === false, 'toJSON should report freeze as false');

    const restored = WordNode.fromJSON(json);

    assert(!Object.isFrozen(restored), 'restored node should not be frozen');
}

/**
 * Test: WordNode fromJSON with missing required fields throws.
 */
function testWordNodeFromJSONValidation() {
    let threw = false;

    try {
        WordNode.fromJSON({
            word: 'кролик'
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'missing fields should throw TypeError');
        assert(e.message.includes('missing required field'), 'error should mention missing required fields');
    }

    assert(threw, 'should throw on missing fields');
}

/**
 * Test: CategoryNode round-trip preserves structure, nesting, and
 * freeze state.
 */
function testCategoryNodeRoundTrip() {
    const word = new WordNode('стол', 6, false);
    const subcategory = new CategoryNode('Masculine', 2, 5, [word], [], false);
    const category = new CategoryNode('Nouns', 1, 4, [], [subcategory], true);

    const json = category.toJSON();
    const restored = CategoryNode.fromJSON(json);

    assert(restored instanceof CategoryNode, 'restored should be a CategoryNode');
    assert(restored.name === 'Nouns', 'restored name should be "Nouns"');
    assert(restored.level === 1, 'restored level should be 1');
    assert(restored.lineNumber === 4, 'restored lineNumber should be 4');
    assert(restored.id === 'line-4', 'restored id should be "line-4"');
    assert(restored.subcategories.length === 1, 'restored should have one subcategory');
    assert(restored.subcategories[0].name === 'Masculine', 'restored subcategory should be "Masculine"');
    assert(restored.subcategories[0].words.length === 1, 'restored subcategory should have one word');
    assert(restored.subcategories[0].words[0].word === 'стол', 'restored word should be "стол"');
    assert(Object.isFrozen(restored), 'restored category should be frozen');
    assert(Object.isFrozen(restored.words), 'restored words array should be frozen');
    assert(Object.isFrozen(restored.subcategories), 'restored subcategories array should be frozen');
}

/**
 * Test: CategoryNode fromJSON with missing required fields throws.
 */
function testCategoryNodeFromJSONValidation() {
    let threw = false;

    try {
        CategoryNode.fromJSON({
            name: 'Nouns'
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'missing fields should throw TypeError');
        assert(e.message.includes('missing required field'), 'error should mention missing required fields');
    }

    assert(threw, 'should throw on missing fields');
}

/**
 * Test: WordListDocument fromJSON reconstructs a parsed document with
 * full state (rawText, freeze, isParsed, metadata, categories).
 */
function testWordListDocumentRoundTrip() {
    const input = `---
title: Test Batch
---
# Nouns
кролик
`;

    const doc = parse(input, {
        freeze: true
    });
    const json = doc.toJSON();

    assert(json.rawText === input, 'toJSON should include rawText');
    assert(json.freeze === true, 'toJSON should include freeze');
    assert(json.isParsed === true, 'toJSON should include isParsed');

    const restored = WordListDocument.fromJSON(json);

    assert(restored instanceof WordListDocument, 'restored should be a WordListDocument');
    assert(restored.hasBeenParsed, 'restored should be parsed');
    assert(restored.metadata.title === 'Test Batch', 'restored metadata should include title');
    assert(restored.categories.length === 1, 'restored should have one category');
    assert(restored.categories[0].name === 'Nouns', 'restored category should be "Nouns"');
    assert(restored.categories[0].words[0].word === 'кролик', 'restored word should be "кролик"');
    assert(restored.countWords() === 1, 'restored countWords should work');
    assert(restored.allWords()[0] === 'кролик', 'restored allWords should work');
    assert(restored.getNodeById(restored.categories[0].id) === restored.categories[0], 'restored getNodeById should find category');
    assert(restored.getNodeById(restored.categories[0].words[0].id) === restored.categories[0].words[0], 'restored getNodeById should find word');
    assert(Object.isFrozen(restored), 'restored document should be frozen');
    assert(Object.isFrozen(restored.categories), 'restored categories array should be frozen');
    assert(Object.isFrozen(restored.categories[0]), 'restored category should be frozen');
    assert(Object.isFrozen(restored.categories[0].words[0]), 'restored word should be frozen');
}

/**
 * Test: WordListDocument fromJSON accepts a JSON string (not just a
 * plain object).
 */
function testWordListDocumentFromJSONString() {
    const input = `# Nouns
кролик
`;

    const doc = parse(input);
    const jsonString = JSON.stringify(doc);

    const restored = WordListDocument.fromJSON(jsonString);

    assert(restored instanceof WordListDocument, 'restored should be a WordListDocument');
    assert(restored.hasBeenParsed, 'restored should be parsed');
    assert(restored.categories[0].name === 'Nouns', 'restored category should be "Nouns"');
}

/**
 * Test: WordListDocument fromJSON with missing required fields throws.
 */
function testWordListDocumentFromJSONValidation() {
    let threw = false;

    try {
        WordListDocument.fromJSON({
            rawText: '# Nouns'
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'missing fields should throw TypeError');
        assert(e.message.includes('missing required field'), 'error should mention missing required fields');
    }

    assert(threw, 'should throw on missing fields');
}

/**
 * Test: WordListDocument fromJSON preserves unparsed state.
 *
 * A document constructed but not parsed cannot be serialized via
 * toJSON() (it throws), so this case is not reachable through normal
 * round-trip. However, fromJSON() should still handle it if given
 * valid data with isParsed: false.
 */
function testWordListDocumentFromJSONUnparsed() {
    const data = {
        rawText: '# Nouns\nкролик\n',
        freeze: false,
        isParsed: false,
        metadata: {},
        categories: [],
    };

    const restored = WordListDocument.fromJSON(data);

    assert(restored instanceof WordListDocument, 'restored should be a WordListDocument');
    assert(restored.hasBeenParsed === false, 'restored should not be parsed');

    let threw = false;
    try {
        restored.countWords();
    } catch (e) {
        threw = true;
    }

    assert(threw, 'should throw when accessing countWords on unparsed restored document');
}

/**
 * Test: WordNode and CategoryNode fromJSON validate freeze field type.
 */
function testFromJSONFreezeValidation() {
    let threw = false;

    try {
        WordNode.fromJSON({
            type: 'word',
            id: 'line-5',
            lineNumber: 5,
            word: 'кролик',
            freeze: 'yes',
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'invalid freeze should throw TypeError');
    }

    assert(threw, 'should throw on invalid freeze in WordNode.fromJSON');
}

// Run all tests
runAllTests([
    ['testValidInput', testValidInput],
    ['testNoFrontmatter', testNoFrontmatter],
    ['testEmptyFile', testEmptyFile],
    ['testWhitespaceOnlyFile', testWhitespaceOnlyFile],
    ['testLeadingBlankLinesBeforeFrontmatter', testLeadingBlankLinesBeforeFrontmatter],
    ['testMissingClosingFrontmatterDelimiter', testMissingClosingFrontmatterDelimiter],
    ['testNestedHeadingWithoutParent', testNestedHeadingWithoutParent],
    ['testMalformedFrontmatterEntry', testMalformedFrontmatterEntry],
    ['testImplicitCategoryOnly', testImplicitCategoryOnly],
    ['testImplicitCategoryWithExplicitCategories', testImplicitCategoryWithExplicitCategories],
    ['testExplicitCategoriesOnly', testExplicitCategoriesOnly],
    ['testCountWords', testCountWords],
    ['testAllWords', testAllWords],
    ['testGetNodeById', testGetNodeById],
    ['testAllNodes', testAllNodes],
    ['testToJSON', testToJSON],
    ['testReparse', testReparse],
    ['testFreezeOption', testFreezeOption],
    ['testAccessBeforeParseThrows', testAccessBeforeParseThrows],
    ['testConstructorValidation', testConstructorValidation],
    ['testNodeTypesAndIds', testNodeTypesAndIds],
    ['testWordNodeLineNumber', testWordNodeLineNumber],
    ['testCategoryNodeLineNumber', testCategoryNodeLineNumber],
    ['testWordNodeRoundTrip', testWordNodeRoundTrip],
    ['testWordNodeRoundTripUnfrozen', testWordNodeRoundTripUnfrozen],
    ['testWordNodeFromJSONValidation', testWordNodeFromJSONValidation],
    ['testCategoryNodeRoundTrip', testCategoryNodeRoundTrip],
    ['testCategoryNodeFromJSONValidation', testCategoryNodeFromJSONValidation],
    ['testWordListDocumentRoundTrip', testWordListDocumentRoundTrip],
    ['testWordListDocumentFromJSONString', testWordListDocumentFromJSONString],
    ['testWordListDocumentFromJSONValidation', testWordListDocumentFromJSONValidation],
    ['testWordListDocumentFromJSONUnparsed', testWordListDocumentFromJSONUnparsed],
    ['testFromJSONFreezeValidation', testFromJSONFreezeValidation],
]);
