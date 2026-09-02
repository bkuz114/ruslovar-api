/**
 * @fileoverview Minimal dependency-free test harness for ES modules.
 *
 * Provides assertion and test-running utilities suitable for Node's
 * ES module system without third-party dependencies. Designed for
 * projects that run tests directly via node or a simple aggregator
 * script.
 *
 * Usage:
 *
 *   import { assert, runAllTests } from './helpers/test-harness.js';
 *
 *   function testExample() {
 *       const value = 42;
 *       assert(value === 42, 'value should be 42');
 *   }
 *
 *   runAllTests('example-suite', [
 *       ['testExample', testExample],
 *   ]);
 *
 * Run with:
 *
 *   node tests/example.test.js
 *
 * On success, the script exits with code 0. On failure, it exits
 * with code 1 and prints a summary of passed and failed counts.
 *
 * Conventions:
 *
 * - Suite names should be concise and descriptive (e.g., 'wordlist-parser').
 * - Test names should be unique within a single runAllTests call.
 * - Assertion messages should be concise, present-tense, and omit
 *   trailing punctuation.
 * - Test functions should be synchronous. If async tests are needed
 *   in the future, extend runTest to await the returned promise.
 */

/**
 * Minimal assertion helper.
 *
 * Assertion messages should be concise, present-tense, and omit
 * trailing punctuation:
 *
 *   assert(x, 'should have two categories')
 *
 * Not:
 *   assert(x, 'Should have two categories.')
 *
 * @param {boolean} condition - Condition that must be true.
 * @param {string} message - Description of the assertion.
 * @throws {Error} If the condition is false.
 */
export function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Run a single named test.
 *
 * @param {string} name - Test name.
 * @param {Function} testFn - Test function.
 * @returns {boolean} True if the test passed, false otherwise.
 */
export function runTest(name, testFn) {
    console.log(`▶ ${name}`);
    try {
        testFn();
        console.log(`✓ ${name} passed`);
        return true;
    } catch (e) {
        console.error(`✗ ${name} failed`);
        console.error(`  ${e.message}`);
        return false;
    }
}

/**
 * Run an ordered collection of named tests under a named suite.
 *
 * @param {string} suiteName - Name of the test suite, used for the
 *   header. Should be concise and descriptive.
 * @param {Array<[string, Function]>} tests - Pairs of test name and
 *   test function, in execution order.
 * @throws {Error} If duplicate test names are found.
 */
export function runAllTests(suiteName, tests) {
    console.log(`\n========================================`);
    console.log(`Test Suite: ${suiteName}`);
    console.log(`========================================\n`);

    // Validate uniqueness before running anything.
    const seen = new Set();
    for (const [name] of tests) {
        if (seen.has(name)) {
            throw new Error(`Duplicate test name: ${name}`);
        }
        seen.add(name);
    }

    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        if (runTest(name, fn)) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}