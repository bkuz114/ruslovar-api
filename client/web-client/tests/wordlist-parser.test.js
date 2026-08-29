import {
    parseWordList
} from '../js/core/wordlist-parser.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

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

    const result = parseWordList(input);

    assert(result.metadata.title === 'Test Batch', 'metadata.title should be "Test Batch"');
    assert(result.metadata.description === 'Practice words', 'metadata.description should be "Practice words"');
    assert(result.categories.length === 2, 'should have two top-level categories');

    const nouns = result.categories[0];
    assert(nouns.name === 'Nouns', 'first category should be "Nouns"');
    assert(nouns.level === 1, 'first category level should be 1');
    assert(nouns.words.length === 2, 'Nouns should have two direct words');
    assert(nouns.words[0] === 'кролик', 'first word should be "кролик"');
    assert(nouns.subcategories.length === 2, 'Nouns should have two subcategories');

    const masculine = nouns.subcategories[0];
    assert(masculine.name === 'Masculine', 'first subcategory should be "Masculine"');
    assert(masculine.level === 2, 'Masculine level should be 2');
    assert(masculine.words.length === 1, 'Masculine should have one word');
    assert(masculine.words[0] === 'стол', 'Masculine word should be "стол"');

    const adjectives = result.categories[1];
    assert(adjectives.name === 'Adjectives', 'second category should be "Adjectives"');
    assert(adjectives.words.length === 1, 'Adjectives should have one word');
    assert(adjectives.words[0] === 'красный', 'Adjectives word should be "красный"');
}

function testNoFrontmatter() {
    const input = `# Nouns
кролик
`;

    const result = parseWordList(input);

    assert(Object.keys(result.metadata).length === 0, 'metadata should be empty');
    assert(result.categories.length === 1, 'should have one category');
    assert(result.categories[0].name === 'Nouns', 'category should be "Nouns"');
    assert(result.categories[0].words.length === 1, 'Nouns should have one word');
}

function testEmptyFile() {
    const input = ``;

    const result = parseWordList(input);

    assert(Object.keys(result.metadata).length === 0, 'metadata should be empty');
    assert(result.categories.length === 0, 'categories should be empty');
}

function testWhitespaceOnlyFile() {
    const input = `   
    
    `;

    const result = parseWordList(input);

    assert(Object.keys(result.metadata).length === 0, 'metadata should be empty');
    assert(result.categories.length === 0, 'categories should be empty');
}

function testLeadingBlankLinesBeforeFrontmatter() {
    const input = `

---
title: Test
---
# Nouns
кролик
`;

    const result = parseWordList(input);

    assert(result.metadata.title === 'Test', 'metadata.title should be "Test"');
    assert(result.categories.length === 1, 'should have one category');
}

function testMissingClosingFrontmatterDelimiter() {
    // No '#' heading after the frontmatter, so the parser reaches the
    // end of the file without finding the closing delimiter.
    const input = `---
title: Test
`;

    let threw = false;
    try {
        parseWordList(input);
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

    const result = parseWordList(input);

    assert(result.categories.length === 1, 'should have one category');
    assert(result.categories[0].name === '', 'implicit category name should be empty');
    assert(result.categories[0].level === 1, 'implicit category level should be 1');
    assert(result.categories[0].words.length === 2, 'should have two words');
    assert(result.categories[0].words[0] === 'удочка', 'first word should be удочка');
    assert(result.categories[0].words[1] === 'леска', 'second word should be леска');
    assert(result.categories[0].subcategories.length === 0, 'should have no subcategories');
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

    const result = parseWordList(input);

    assert(result.categories.length === 2, 'should have two top-level categories');
    assert(result.categories[0].name === '', 'first category should be implicit');
    assert(result.categories[0].words.length === 2, 'implicit should have two words');
    assert(result.categories[1].name === 'Рыбы', 'second category should be Рыбы');
    assert(result.categories[1].words.length === 1, 'Рыбы should have one word');
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

    const result = parseWordList(input);

    assert(result.categories.length === 1, 'should have one category');
    assert(result.categories[0].name === 'Рыбы', 'category should be Рыбы');
    assert(result.categories[0].words.length === 1, 'Рыбы should have one word');
    assert(result.categories[0].words[0] === 'щука', 'word should be щука');
}

function testNestedHeadingWithoutParent() {
    const input = `## Masculine
стол
`;

    let threw = false;
    try {
        parseWordList(input);
    } catch (e) {
        threw = true;
    }

    assert(threw, 'should throw on nested heading without parent');
}

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
        parseWordList(input);
    } catch (e) {
        threw = true;
        assert(e.message.includes('Malformed frontmatter'), 'error should mention malformed frontmatter');
    }

    assert(threw, 'should throw on malformed frontmatter entry');
}

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✓ ${name}`);
    } catch (e) {
        console.error(`✗ ${name}`);
        console.error(`  ${e.message}`);
        process.exitCode = 1;
    }
}

// Run all tests
runTest('testValidInput', testValidInput);
runTest('testNoFrontmatter', testNoFrontmatter);
runTest('testEmptyFile', testEmptyFile);
runTest('testWhitespaceOnlyFile', testWhitespaceOnlyFile);
runTest('testLeadingBlankLinesBeforeFrontmatter', testLeadingBlankLinesBeforeFrontmatter);
runTest('testMissingClosingFrontmatterDelimiter', testMissingClosingFrontmatterDelimiter);
runTest('testNestedHeadingWithoutParent', testNestedHeadingWithoutParent);
runTest('testMalformedFrontmatterEntry', testMalformedFrontmatterEntry);
runTest('testImplicitCategoryOnly', testImplicitCategoryOnly);
runTest('testImplicitCategoryWithExplicitCategories', testImplicitCategoryWithExplicitCategories);
runTest('testExplicitCategoriesOnly', testExplicitCategoriesOnly);

if (!process.exitCode) {
    console.log('All tests passed');
}