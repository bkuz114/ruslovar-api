/**
 * @fileoverview Aggregator that runs all test files sequentially.
 *
 * Each test file is a standalone script that sets process.exitCode
 * on failure. Importing them here runs them in order.
 *
 * Usage:
 *
 *   node tests/run-all.js
 */
import './../wordlist-parser.test.js';