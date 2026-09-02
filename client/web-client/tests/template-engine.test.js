/**
 * TemplateEngine test suite.
 *
 * Run with:
 *   node tests/template-engine.test.js
 *
 * Or if using Node's built-in test runner:
 *   node --test tests/template-engine.test.js
 */

import {
    TemplateEngine,
} from '../js/core/utils/template-engine.js';

import {
    assert,
    runAllTests,
} from './helpers/test-harness.js';

/**
 * Helper to create a TemplateEngine with default delimiters.
 *
 * @returns {TemplateEngine} Engine with default config.
 */
function createEngine() {
    return new TemplateEngine();
}

/**
 * Test: validates a template with no placeholders.
 */
function testValidateNoPlaceholders() {
    const engine = createEngine();

    const result = engine.validateTemplateString('No placeholders here');

    assert(result.valid === true, 'template with no placeholders should be valid');
    assert(result.error === null, 'error should be null for valid template');
}

/**
 * Test: validates a template with a single placeholder.
 */
function testValidateSinglePlaceholder() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found {count} words');

    assert(result.valid === true, 'template with single placeholder should be valid');
    assert(result.error === null, 'error should be null for valid template');
}

/**
 * Test: validates a template with multiple placeholders.
 */
function testValidateMultiplePlaceholders() {
    const engine = createEngine();

    const result = engine.validateTemplateString('{categories} and {words}');

    assert(result.valid === true, 'template with multiple placeholders should be valid');
    assert(result.error === null, 'error should be null for valid template');
}

/**
 * Test: validates a template with repeated placeholders.
 */
function testValidateRepeatedPlaceholder() {
    const engine = createEngine();

    const result = engine.validateTemplateString('{count} of {count}');

    assert(result.valid === true, 'repeated placeholders should be valid');
    assert(result.error === null, 'error should be null for valid template');
}

/**
 * Test: rejects a template with an unmatched opening delimiter.
 */
function testValidateUnmatchedOpenDelim() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found {count words');

    assert(result.valid === false, 'unmatched opening delimiter should be invalid');
    assert(result.error !== null, 'error should not be null for invalid template');
    assert(result.error.includes('Unmatched opening delimiter'), 'error should mention unmatched opening delimiter');
}

/**
 * Test: rejects a template with an unmatched closing delimiter.
 */
function testValidateUnmatchedCloseDelim() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found count} words');

    assert(result.valid === false, 'unmatched closing delimiter should be invalid');
    assert(result.error !== null, 'error should not be null for invalid template');
    assert(result.error.includes('Unmatched closing delimiter'), 'error should mention unmatched closing delimiter');
}

/**
 * Test: rejects a template with an empty placeholder.
 */
function testValidateEmptyPlaceholder() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found {} words');

    assert(result.valid === false, 'empty placeholder should be invalid');
    assert(result.error !== null, 'error should not be null for invalid template');
    assert(result.error.includes('Empty placeholder'), 'error should mention empty placeholder');
}

/**
 * Test: rejects a template with nested delimiters.
 */
function testValidateNestedDelimiter() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found {word{ending}} words');

    assert(result.valid === false, 'nested delimiters should be invalid');
    assert(result.error !== null, 'error should not be null for invalid template');
    assert(result.error.includes('Nested delimiter'), 'error should mention nested delimiter');
}

/**
 * Test: rejects a template with closing delimiter before opening.
 */
function testValidateCloseBeforeOpen() {
    const engine = createEngine();

    const result = engine.validateTemplateString('Found }count{ words');

    assert(result.valid === false, 'close before open should be invalid');
    assert(result.error !== null, 'error should not be null for invalid template');
    assert(result.error.includes('Unmatched closing delimiter'), 'error should mention unmatched closing delimiter');
}

/**
 * Test: applies basic substitution.
 */
function testApplyBasicSubstitution() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count} {word}', {
            count: 5,
            word: 'слов'
        }
    );

    assert(result.value === 'Found 5 слов', 'should substitute all placeholders');
    assert(result.errors.length === 0, 'should have no errors');
}

/**
 * Test: applies global replacement for repeated placeholders.
 */
function testApplyRepeatedPlaceholder() {
    const engine = createEngine();

    const result = engine.apply(
        '{count} of {count}', {
            count: 5
        }
    );

    assert(result.value === '5 of 5', 'should replace all occurrences');
    assert(result.errors.length === 0, 'should have no errors');
}

/**
 * Test: handles missing values for placeholders.
 */
function testApplyMissingValue() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count} {word}', {
            count: 5
        }
    );

    assert(result.value === 'Found 5 {word}', 'should leave unresolved placeholder visible');
    assert(result.errors.length > 0, 'should have at least one error');
    assert(result.errors[0].includes('{word}'), 'error should mention the unresolved placeholder');
}

/**
 * Test: ignores extra values not used in template.
 */
function testApplyExtraValues() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: 5,
            extra: 'unused'
        }
    );

    assert(result.value === 'Found 5', 'should substitute only used placeholders');
    assert(result.errors.length === 0, 'extra values should not cause errors');
}

/**
 * Test: rejects object values.
 */
function testApplyObjectValue() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: {
                value: 5
            }
        }
    );

    assert(result.errors.length > 0, 'object value should cause error');
    assert(result.errors[0].includes('Value type'), 'error should mention value type');
}

/**
 * Test: rejects null values.
 */
function testApplyNullValue() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: null
        }
    );

    assert(result.errors.length > 0, 'null value should cause error');
    assert(result.errors[0].includes('null'), 'error should mention null type');
}

/**
 * Test: rejects array values.
 */
function testApplyArrayValue() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: [1, 2, 3]
        }
    );

    assert(result.errors.length > 0, 'array value should cause error');
    assert(result.errors[0].includes('Value type'), 'error should mention value type');
}

/**
 * Test: rejects non-object values argument.
 */
function testApplyInvalidValuesArgument() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}',
        'not an object'
    );

    assert(result.errors.length > 0, 'invalid values argument should cause error');
    assert(result.errors[0].includes('Invalid values argument'), 'error should mention invalid values');
    assert(result.value === 'Found {count}', 'should return template unchanged on invalid values');
}

/**
 * Test: rejects array as values argument.
 */
function testApplyArrayAsValues() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}',
        [1, 2, 3]
    );

    assert(result.errors.length > 0, 'array as values should cause error');
    assert(result.errors[0].includes('Invalid values argument'), 'error should mention invalid values');
}

/**
 * Test: invalid template argument returns validation error.
 */
function testApplyInvalidTemplateType() {
    const engine = createEngine();

    const result = engine.apply(
        42, {
            count: 5
        }
    );

    assert(result.errors.length > 0, 'non-string template should cause error');
    assert(result.errors[0].includes('Invalid template argument'), 'error should mention invalid template');
}

/**
 * Test: applies substitution with custom delimiters.
 */
function testCustomDelimiters() {
    const engine = new TemplateEngine({
        openDelim: '[[',
        closeDelim: ']]'
    });

    const result = engine.apply(
        'Found [[count]] words', {
            count: 5
        }
    );

    assert(result.value === 'Found 5 words', 'should substitute with custom delimiters');
    assert(result.errors.length === 0, 'should have no errors with custom delimiters');
}

/**
 * Test: validates with custom delimiters.
 */
function testCustomDelimitersValidation() {
    const engine = new TemplateEngine({
        openDelim: '[[',
        closeDelim: ']]'
    });

    const validResult = engine.validateTemplateString('Found [[count]] words');
    assert(validResult.valid === true, 'valid template with custom delimiters should be valid');

    const invalidResult = engine.validateTemplateString('Found [[count words');
    assert(invalidResult.valid === false, 'invalid template with custom delimiters should be invalid');
    assert(invalidResult.error.includes('Unmatched opening delimiter'), 'error should mention unmatched opening delimiter');
}

/**
 * Test: constructor throws on invalid openDelim.
 */
function testConstructorInvalidOpenDelim() {
    let threw = false;

    try {
        new TemplateEngine({
            openDelim: ''
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'invalid openDelim should throw TypeError');
        assert(e.message.includes('openDelim'), 'error should mention openDelim');
    }

    assert(threw, 'should throw on invalid openDelim');
}

/**
 * Test: constructor throws on invalid closeDelim.
 */
function testConstructorInvalidCloseDelim() {
    let threw = false;

    try {
        new TemplateEngine({
            closeDelim: ''
        });
    } catch (e) {
        threw = true;
        assert(e instanceof TypeError, 'invalid closeDelim should throw TypeError');
        assert(e.message.includes('closeDelim'), 'error should mention closeDelim');
    }

    assert(threw, 'should throw on invalid closeDelim');
}

/**
 * Test: constructor throws when openDelim equals closeDelim.
 */
function testConstructorIdenticalDelimiters() {
    let threw = false;

    try {
        new TemplateEngine({
            openDelim: '{',
            closeDelim: '{'
        });
    } catch (e) {
        threw = true;
        assert(e.message.includes('must be different'), 'error should mention delimiters must be different');
    }

    assert(threw, 'should throw when delimiters are identical');
}

/**
 * Test: unused values produce warnings.
 */
function testApplyUnusedValuesProduceWarnings() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: 5,
            extra: 'unused'
        }
    );

    assert(result.value === 'Found 5', 'should substitute only used placeholders');
    assert(result.errors.length === 0, 'unused values should not cause errors');
    assert(result.warnings.length === 1, 'unused values should produce one warning');
    assert(
        result.warnings[0].includes('"extra"'),
        'warning should mention the unused key'
    );
    assert(
        result.warnings[0].includes('{extra}'),
        'warning should mention the unused placeholder'
    );
}

/**
 * Test: warnings array is empty when all values are used.
 */
function testApplyNoUnusedValuesNoWarnings() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count} {word}', {
            count: 5,
            word: 'слов'
        }
    );

    assert(result.value === 'Found 5 слов', 'should substitute all placeholders');
    assert(result.errors.length === 0, 'should have no errors');
    assert(result.warnings.length === 0, 'should have no warnings');
}

/**
 * Test: extractPlaceholders returns unique names in order of appearance.
 */
function testExtractPlaceholders() {
    const engine = createEngine();

    const placeholders = engine.extractPlaceholders(
        'Found {count} of {count} {word}'
    );

    assert(Array.isArray(placeholders), 'should return an array');
    assert(placeholders.length === 2, 'should return two unique placeholders');
    assert(placeholders[0] === 'count', 'first placeholder should be "count"');
    assert(placeholders[1] === 'word', 'second placeholder should be "word"');
}

/**
 * Test: extractPlaceholders returns empty array for no placeholders.
 */
function testExtractPlaceholdersEmpty() {
    const engine = createEngine();

    const placeholders = engine.extractPlaceholders('No placeholders here');

    assert(Array.isArray(placeholders), 'should return an array');
    assert(placeholders.length === 0, 'should return empty array for no placeholders');
}

/**
 * Test: extractPlaceholders works with custom delimiters.
 */
function testExtractPlaceholdersCustomDelimiters() {
    const engine = new TemplateEngine({
        openDelim: '[[',
        closeDelim: ']]'
    });

    const placeholders = engine.extractPlaceholders(
        'Found [[count]] and [[word]]'
    );

    assert(placeholders.length === 2, 'should return two placeholders');
    assert(placeholders[0] === 'count', 'first placeholder should be "count"');
    assert(placeholders[1] === 'word', 'second placeholder should be "word"');
}

/**
 * Test: validateSubstitutionValue returns null for valid primitives.
 */
function testValidateSubstitutionValueValidPrimitives() {
    const engine = createEngine();

    const stringResult = engine.validateSubstitutionValue('key', 'value');
    assert(stringResult === null, 'string value should return null');

    const numberResult = engine.validateSubstitutionValue('key', 5);
    assert(numberResult === null, 'number value should return null');

    const booleanResult = engine.validateSubstitutionValue('key', true);
    assert(booleanResult === null, 'boolean value should return null');
}

/**
 * Test: validateSubstitutionValue returns error for object.
 */
function testValidateSubstitutionValueObject() {
    const engine = createEngine();

    const result = engine.validateSubstitutionValue('key', {
        nested: true
    });

    assert(result !== null, 'object value should return error');
    assert(result.includes('Cannot substitute'), 'error should mention cannot substitute');
    assert(result.includes('{key}'), 'error should mention the placeholder');
    assert(result.includes('object'), 'error should mention object type');
}

/**
 * Test: validateSubstitutionValue returns error for null with correct type.
 */
function testValidateSubstitutionValueNull() {
    const engine = createEngine();

    const result = engine.validateSubstitutionValue('key', null);

    assert(result !== null, 'null value should return error');
    assert(result.includes('null'), 'error should mention null type');
    assert(!result.includes('object'), 'error should not mention object type');
}

/**
 * Test: validateSubstitutionValue returns error for array.
 */
function testValidateSubstitutionValueArray() {
    const engine = createEngine();

    const result = engine.validateSubstitutionValue('key', [1, 2, 3]);

    assert(result !== null, 'array value should return error');
    assert(result.includes('Cannot substitute'), 'error should mention cannot substitute');
    assert(result.includes('object'), 'error should mention object type');
}

/**
 * Test: apply handles placeholder names with special characters.
 */
function testApplySpecialCharactersInPlaceholderNames() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {word.1} and {word-1}', {
            'word.1': 'first',
            'word-1': 'second'
        }
    );

    assert(result.value === 'Found first and second', 'should substitute special character names');
    assert(result.errors.length === 0, 'should have no errors');
}

/**
 * Test: apply handles empty template string.
 */
function testApplyEmptyTemplate() {
    const engine = createEngine();

    const result = engine.apply('', {
        count: 5
    });

    assert(result.value === '', 'should return empty string');
    assert(result.errors.length === 0, 'should have no errors');
    assert(result.warnings.length === 1, 'should warn about unused value');
    assert(result.warnings[0].includes('"count"'), 'warning should mention the unused key');
}

/**
 * Test: apply handles values with undefined.
 */
function testApplyUndefinedValue() {
    const engine = createEngine();

    const result = engine.apply(
        'Found {count}', {
            count: undefined
        }
    );

    assert(result.value === 'Found {count}', 'should leave placeholder visible');
    assert(result.errors.length > 0, 'undefined value should cause error');
    assert(result.errors[0].includes('Value type'), 'error should mention value type');
    assert(result.errors[0].includes('undefined'), 'error should mention undefined type');
}

// Run all tests
runAllTests('template-engine', [
    ['testValidateNoPlaceholders', testValidateNoPlaceholders],
    ['testValidateSinglePlaceholder', testValidateSinglePlaceholder],
    ['testValidateMultiplePlaceholders', testValidateMultiplePlaceholders],
    ['testValidateRepeatedPlaceholder', testValidateRepeatedPlaceholder],
    ['testValidateUnmatchedOpenDelim', testValidateUnmatchedOpenDelim],
    ['testValidateUnmatchedCloseDelim', testValidateUnmatchedCloseDelim],
    ['testValidateEmptyPlaceholder', testValidateEmptyPlaceholder],
    ['testValidateNestedDelimiter', testValidateNestedDelimiter],
    ['testValidateCloseBeforeOpen', testValidateCloseBeforeOpen],
    ['testApplyBasicSubstitution', testApplyBasicSubstitution],
    ['testApplyRepeatedPlaceholder', testApplyRepeatedPlaceholder],
    ['testApplyMissingValue', testApplyMissingValue],
    ['testApplyExtraValues', testApplyExtraValues],
    ['testApplyUnusedValuesProduceWarnings', testApplyUnusedValuesProduceWarnings],
    ['testApplyNoUnusedValuesNoWarnings', testApplyNoUnusedValuesNoWarnings],
    ['testApplyObjectValue', testApplyObjectValue],
    ['testApplyNullValue', testApplyNullValue],
    ['testApplyArrayValue', testApplyArrayValue],
    ['testApplyInvalidValuesArgument', testApplyInvalidValuesArgument],
    ['testApplyArrayAsValues', testApplyArrayAsValues],
    ['testApplyInvalidTemplateType', testApplyInvalidTemplateType],
    ['testApplySpecialCharactersInPlaceholderNames', testApplySpecialCharactersInPlaceholderNames],
    ['testApplyEmptyTemplate', testApplyEmptyTemplate],
    ['testApplyUndefinedValue', testApplyUndefinedValue],
    ['testExtractPlaceholders', testExtractPlaceholders],
    ['testExtractPlaceholdersEmpty', testExtractPlaceholdersEmpty],
    ['testExtractPlaceholdersCustomDelimiters', testExtractPlaceholdersCustomDelimiters],
    ['testValidateSubstitutionValueValidPrimitives', testValidateSubstitutionValueValidPrimitives],
    ['testValidateSubstitutionValueObject', testValidateSubstitutionValueObject],
    ['testValidateSubstitutionValueNull', testValidateSubstitutionValueNull],
    ['testValidateSubstitutionValueArray', testValidateSubstitutionValueArray],
    ['testCustomDelimiters', testCustomDelimiters],
    ['testCustomDelimitersValidation', testCustomDelimitersValidation],
    ['testConstructorInvalidOpenDelim', testConstructorInvalidOpenDelim],
    ['testConstructorInvalidCloseDelim', testConstructorInvalidCloseDelim],
    ['testConstructorIdenticalDelimiters', testConstructorIdenticalDelimiters],
]);