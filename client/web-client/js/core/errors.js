/**
 * Ruslovar API Demo — Error Classes
 *
 * This module defines typed error classes used throughout the client.
 * Typed errors allow callers to distinguish between different failure
 * modes (network issues, HTTP errors, malformed responses) without
 * inspecting raw error strings or status codes.
 *
 * Dependencies:
 *   - None (standalone module)
 */

/**
 * Base error class for all API-related failures.
 *
 * Extends the native Error class so that standard error handling
 * mechanisms (try/catch, stack traces, logging) continue to work.
 *
 * @property {string} name    - Error class name ("ApiError").
 * @property {number|null} status - HTTP status code, if available.
 * @property {string|null} code   - Application-level error code, if available.
 */
export class ApiError extends Error {
    /**
     * @param {string} message - Human-readable error message.
     * @param {number|null} [status=null] - HTTP status code (e.g., 404, 500).
     * @param {string|null} [code=null] - Application-level error code from
     *     the API response body, if present.
     */
    constructor(message, status = null, code = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

/**
 * Thrown when the network request itself fails (e.g., DNS failure,
 * connection refused, timeout). No HTTP response was received.
 */
export class NetworkError extends ApiError {
    /**
     * @param {string} message - Human-readable error message.
     */
    constructor(message) {
        super(message, null, 'network_error');
        this.name = 'NetworkError';
    }
}

/**
 * Thrown when the server returns a non-2xx HTTP status code.
 *
 * The status property holds the HTTP status code, and the code property
 * may contain a machine-readable error code extracted from the response
 * body, if the API provides one.
 */
export class HttpError extends ApiError {
    /**
     * @param {string} message - Human-readable error message.
     * @param {number} status - HTTP status code.
     * @param {string|null} [code=null] - Error code from response body.
     */
    constructor(message, status, code = null) {
        super(message, status, code);
        this.name = 'HttpError';
    }
}

/**
 * Thrown when the response body cannot be parsed as JSON, or when the
 * parsed response does not match the expected schema.
 */
export class ParseError extends ApiError {
    /**
     * @param {string} message - Human-readable error message.
     */
    constructor(message) {
        super(message, null, 'parse_error');
        this.name = 'ParseError';
    }
}