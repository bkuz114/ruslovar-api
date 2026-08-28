/**
 * Ruslovar API Demo — API Client
 *
 * Centralizes all HTTP communication with the Ruslovar FastAPI server.
 * Views import functions from this module rather than constructing
 * fetch requests directly.
 *
 * Responsibilities:
 *   - Build endpoint URLs from the configured base URL.
 *   - Serialize request bodies.
 *   - Check HTTP status codes and parse JSON responses.
 *   - Normalize failures into typed ApiError subclasses.
 *
 * Dependencies:
 *   - errors.js (NetworkError, HttpError, ParseError)
 *   - config.js (getConfig)
 */

import {
    getConfig
} from './config.js';
import {
    NetworkError,
    HttpError,
    ParseError
} from './errors.js';

/**
 * Send a GET request and return the parsed JSON response.
 *
 * @param {string} url - Full request URL.
 * @returns {Promise<Object>} Parsed JSON response body.
 * @throws {NetworkError} If the network request fails.
 * @throws {HttpError} If the server returns a non-2xx status.
 * @throws {ParseError} If the response body is not valid JSON.
 */
async function requestJson(url) {
    let response;

    try {
        response = await fetch(url);
    } catch (error) {
        // fetch only rejects on network failure. Preserve the original
        // error message for debugging but wrap it in a typed error so
        // callers can distinguish this from HTTP-level failures.
        throw new NetworkError(error.message || 'Network request failed');
    }

    if (!response.ok) {
        throw await buildHttpError(response);
    }

    try {
        return await response.json();
    } catch (error) {
        throw new ParseError(`Could not parse JSON response from ${url}`);
    }
}

/**
 * Build an HttpError from a non-2xx response.
 *
 * Attempts to extract a machine-readable error code or detail message
 * from the response body, if the API provides one.
 *
 * @param {Response} response - The fetch Response object.
 * @returns {Promise<HttpError>} Typed error with status and code.
 */
async function buildHttpError(response) {
    let code = null;
    let message = `Request failed with status ${response.status}`;

    // The FastAPI error response shape is { detail: string }.
    // Try to parse it, but don't fail if the body isn't JSON.
    try {
        const data = await response.json();
        if (data && typeof data.detail === 'string') {
            message = data.detail;
        }
    } catch {
        // Non-JSON error body; keep the default message.
    }

    return new HttpError(message, response.status, code);
}

/**
 * Fetch declension data for a single noun.
 *
 * @param {string} word - The Russian noun to look up (Cyrillic, UTF-8).
 * @param {boolean} strict - Whether strict dictionary-form matching is enabled.
 * @returns {Promise<Object>} Parsed NounLookupResponse JSON.
 * @throws {ApiError} Subclass depending on failure mode.
 */
export async function fetchNounDeclensions(word, strict) {
    const baseUrl = getConfig().api_base_url;
    const url = `${baseUrl}/api/v1/nouns/${encodeURIComponent(word)}/declensions?strict=${strict}`;
    return requestJson(url);
}

/**
 * Fetch declension data for multiple nouns in a single batch request.
 *
 * @param {string[]} words - List of Russian nouns to look up.
 * @param {boolean} strict - Whether strict dictionary-form matching is enabled.
 * @returns {Promise<Object>} Parsed NounBatchResponse JSON.
 * @throws {ApiError} Subclass depending on failure mode.
 */
export async function fetchNounBatch(words, strict) {
    const baseUrl = getConfig().api_base_url;
    const url = `${baseUrl}/api/v1/nouns/batch`;

    let response;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                words,
                strict
            }),
        });
    } catch (error) {
        throw new NetworkError(error.message || 'Network request failed');
    }

    if (!response.ok) {
        throw await buildHttpError(response);
    }

    try {
        return await response.json();
    } catch (error) {
        throw new ParseError(`Could not parse JSON response from ${url}`);
    }
}