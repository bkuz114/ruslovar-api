/**
 * Ruslovar API Demo — Data Layer
 *
 * Provides the complete request lifecycle management layer for the
 * application. The data layer is responsible for:
 *
 *   - Caching successful responses with time-to-live (TTL) expiration.
 *   - Deduplicating identical in-flight requests (same cache key → same
 *     underlying promise).
 *   - Tracking active requests per view so they can be aborted when a
 *     view unmounts (if the view's request policy requires it).
 *   - Cancelling the previous request for a view when a new request is
 *     submitted for the same view (prevents stale request races).
 *   - Providing a synchronous cache lookup so views can check for
 *     cached results on mount without triggering a fetch.
 *   - Creating request contexts bound to a view's identity and request
 *     policy, giving views a clean interface for API calls without
 *     requiring them to pass their own ID or policy at every call site.
 *
 * The data layer owns request lifecycle. Views do not manage caching,
 * deduplication, or abort logic. Views receive a request context from
 * the shell and call methods on that context. The context supplies the
 * view's identity and policy to the underlying generic request manager.
 *
 * Design principles:
 *   - The generic request manager (`request()`) is endpoint-agnostic.
 *     It takes a cache key, a fetcher function, and optional lifecycle
 *     options, and manages the request around those.
 *   - Endpoint-specific logic (URL construction, request bodies,
 *     response parsing, typed errors) lives in the request context
 *     factory, not in the generic request manager.
 *   - The request context is created by the shell at mount time and
 *     passed to the view. It binds the view's ID and request policy to
 *     every endpoint call made through it.
 *   - Requests survive view unmount by default (`survive-unmount`
 *     policy). The result is cached and available on remount.
 *   - Views that declare `abort-on-unmount` policy have their active
 *     requests aborted when the shell calls `abortRequestsForView()`.
 *   - A new request for the same view aborts the previous request for
 *     that view. This prevents stale responses from overwriting newer,
 *     more relevant results.
 *
 * Dependencies:
 *   - core/errors.js (NetworkError, HttpError, ParseError)
 */

import {
    NetworkError,
    HttpError,
    ParseError
} from './../errors.js';

// ---------------------------------------------------------------------------
// Development Mode Flag
// ---------------------------------------------------------------------------

/**
 * Whether the application is running in development mode.
 *
 * When true, the data layer logs request lifecycle events (start,
 * completion, abortion, cache hits) to the console. This provides
 * visibility into what the data layer is doing, which is especially
 * valuable during development and debugging.
 *
 * When false, no logging is performed.
 *
 * TODO: Move this to a dedicated environment module (e.g., core/env.js)
 * when the project grows to include build configuration or multiple
 * deployment environments.
 *
 * @type {boolean}
 */
const DEV_MODE = true;

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

/**
 * Default time-to-live for cached responses, in milliseconds.
 *
 * Cached responses older than this are considered stale and will be
 * refetched on the next request. The TTL is configurable per request.
 *
 * @type {number}
 */
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Cache for successful API responses.
 *
 * Maps cache keys to cache entry objects:
 *   {
 *     data: Object,       // The parsed API response
 *     timestamp: number,  // Date.now() when the entry was created
 *     ttl: number         // TTL that was specified when cached
 *   }
 *
 * Entries are considered fresh if Date.now() - timestamp < ttl.
 * The TTL is captured at request time and stored with the entry so
 * each cached result can have a different TTL.
 *
 * @type {Map<string, {data: Object, timestamp: number, ttl: number}>}
 */
const cache = new Map();

/**
 * Registry of in-flight requests.
 *
 * Maps cache keys to pending request objects:
 *   {
 *     promise: Promise<Object>,          // The fetch promise
 *     controller: AbortController|null,  // Abort controller for cancellation
 *     viewIds: Set<string>               // Views that have requested this key
 *   }
 *
 * When a request completes (success or failure), the entry is removed
 * from this map. If multiple views request the same key while the
 * request is in-flight, they all share the same pending request entry
 * and the same underlying promise.
 *
 * @type {Map<string, {promise: Promise<Object>, controller: AbortController|null, viewIds: Set<string>}>}
 */
const pendingRequests = new Map();

/**
 * Registry of active requests per view.
 *
 * Maps view IDs to a Set of cache keys that the view has requested and
 * that are currently in-flight. This allows the data layer to abort
 * all requests for a view when the view unmounts (if the view's policy
 * is `abort-on-unmount`) or when the view submits a new request for the
 * same endpoint.
 *
 * @type {Map<string, Set<string>>}
 */
const viewRequests = new Map();

// ---------------------------------------------------------------------------
// Cache Key Generation
// ---------------------------------------------------------------------------

/**
 * Build a cache key from an endpoint identifier and parameters.
 *
 * The key is a string that uniquely identifies a request. The same
 * endpoint and the same parameters (regardless of object key order)
 * produce the same cache key, enabling deduplication and cache hits.
 *
 * Parameters are canonicalized by sorting their keys and serializing
 * to JSON. This ensures that { a: 1, b: 2 } and { b: 2, a: 1 } produce
 * the same cache key.
 *
 * If params is null or undefined, the key is simply the endpoint.
 *
 * @param {string} endpoint - Endpoint identifier (e.g., 'noun-declensions').
 * @param {Object|undefined} params - Request parameters.
 * @returns {string} Canonical cache key.
 * @throws {TypeError} If endpoint is not a non-empty string.
 */
export function buildCacheKey(endpoint, params) {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
        throw new TypeError('data-layer.buildCacheKey: endpoint must be a non-empty string');
    }

    if (params === null || params === undefined) {
        return endpoint;
    }

    if (typeof params !== 'object') {
        throw new TypeError('data-layer.buildCacheKey: params must be an object, null, or undefined');
    }

    // Sort the keys of the params object to ensure deterministic
    // serialization order. Object.keys() returns keys in insertion
    // order, which may vary between call sites.
    const sortedParams = {};
    for (const key of Object.keys(params).sort()) {
        sortedParams[key] = params[key];
    }

    return `${endpoint}:${JSON.stringify(sortedParams)}`;
}

// ---------------------------------------------------------------------------
// View Request Tracking
// ---------------------------------------------------------------------------

/**
 * Associate a cache key with a view.
 *
 * Adds the cache key to the view's set of active request keys in the
 * viewRequests registry. This allows the data layer to find and abort
 * all requests for a view when needed.
 *
 * @param {string} viewId - The ID of the requesting view.
 * @param {string} cacheKey - The cache key of the in-flight request.
 */
function trackRequestForView(viewId, cacheKey) {
    if (!viewRequests.has(viewId)) {
        viewRequests.set(viewId, new Set());
    }
    viewRequests.get(viewId).add(cacheKey);
}

/**
 * Remove a cache key from a view's set of active request keys.
 *
 * Called when a request completes (success or failure) or is aborted.
 * If the view's set becomes empty, the view entry is removed from the
 * registry to prevent unbounded growth.
 *
 * @param {string} viewId - The ID of the requesting view.
 * @param {string} cacheKey - The cache key to remove.
 */
function untrackRequestForView(viewId, cacheKey) {
    const keys = viewRequests.get(viewId);
    if (keys) {
        keys.delete(cacheKey);

        if (keys.size === 0) {
            viewRequests.delete(viewId);
        }
    }
}

// ---------------------------------------------------------------------------
// Cache Management
// ---------------------------------------------------------------------------

/**
 * Check whether a cache entry exists and is fresh.
 *
 * An entry is fresh if its age (Date.now() - timestamp) is less than
 * the TTL that was specified when the entry was created.
 *
 * @param {string} cacheKey - The cache key to check.
 * @returns {boolean} True if a fresh cache entry exists.
 */
function isCacheFresh(cacheKey) {
    const entry = cache.get(cacheKey);
    if (!entry) {
        return false;
    }

    const age = Date.now() - entry.timestamp;
    return age < entry.ttl;
}

/**
 * Retrieve cached data for a cache key.
 *
 * Returns undefined if no cache entry exists or if the entry is stale.
 * Stale entries are automatically removed from the cache.
 *
 * @param {string} cacheKey - The cache key to retrieve.
 * @returns {Object|undefined} The cached data, or undefined.
 */
function getCachedData(cacheKey) {
    const entry = cache.get(cacheKey);

    if (!entry) {
        return undefined;
    }

    // If the entry is stale, remove it and return undefined. This
    // prevents the cache from growing unbounded with stale entries.
    if (Date.now() - entry.timestamp >= entry.ttl) {
        cache.delete(cacheKey);
        return undefined;
    }

    return entry.data;
}

/**
 * Store data in the cache.
 *
 * The entry records the current timestamp and the TTL that was
 * specified for the request. Freshness is determined relative to this
 * timestamp and TTL.
 *
 * @param {string} cacheKey - The cache key to store under.
 * @param {Object} data - The data to cache.
 * @param {number} ttl - Time-to-live in milliseconds.
 */
function setCachedData(cacheKey, data, ttl) {
    cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl
    });

    if (DEV_MODE) {
        console.log(`[data-layer] Cached response for "${cacheKey}" (TTL: ${ttl}ms)`);
    }
}

// ---------------------------------------------------------------------------
// Development Logging
// ---------------------------------------------------------------------------

/**
 * Log a data layer event in development mode.
 *
 * This is a thin wrapper around console.log that only logs when
 * DEV_MODE is true. It exists so that logging calls can be made
 * without cluttering the main logic with conditional checks.
 *
 * @param {string} message - The log message.
 */
function log(message) {
    if (DEV_MODE) {
        console.log(message);
    }
}

// ---------------------------------------------------------------------------
// Generic Request Manager
// ---------------------------------------------------------------------------

/**
 * Request data with caching, deduplication, and lifecycle management.
 *
 * The generic request manager is endpoint-agnostic. It takes a cache
 * key, a fetcher function, and optional lifecycle options. The caller
 * is responsible for supplying a fetcher that performs the actual
 * network request.
 *
 * The data layer manages the request lifecycle. The caller provides:
 *
 *   - A unique cache key that identifies the request. If the same key
 *     is requested while the previous request is still in-flight, the
 *     same underlying promise is returned (deduplication). If the key
 *     is in the cache and fresh, the cached data is returned
 *     immediately without calling the fetcher.
 *
 *   - A fetcher function that performs the actual network request and
 *     returns a Promise resolving to the parsed response data. The
 *     fetcher receives an AbortSignal so it can cancel the request if
 *     the data layer needs to abort it.
 *
 *   - A view ID (optional) that associates the request with a view.
 *     This enables per-view request tracking and abort-on-unmount
 *     behavior.
 *
 *   - A request policy (optional) that determines what happens when
 *     the view unmounts. See the requestPolicy parameter documentation
 *     for details.
 *
 *   - A TTL (optional) that determines how long the cached response
 *     remains fresh. Defaults to 5 minutes.
 *
 * The request policy only matters if `viewId` is provided. If no
 * viewId is provided, the request is not tracked per view and behaves
 * as if it had the `survive-unmount` policy.
 *
 * If the same view submits a new request with a different cache key,
 * the previous request for that view is aborted. This prevents stale
 * responses from older requests overwriting newer ones. Note that this
 * behavior is per-view: a new request from view A does not abort
 * requests from view B.
 *
 * @param {Object} options - Request options.
 * @param {string} options.cacheKey - Unique cache key for this request.
 * @param {Function} options.fetcher - Function that performs the fetch.
 *     Receives an AbortSignal and returns a Promise resolving to the
 *     parsed response data.
 * @param {string} [options.viewId] - ID of the requesting view.
 * @param {string} [options.requestPolicy] - Request lifecycle policy.
 *     'survive-unmount' (default): request continues after view unmount,
 *       result is cached, view can read cache on remount.
 *     'abort-on-unmount': request is aborted when abortRequestsForView()
 *       is called for the view (typically during unmount).
 * @param {number} [options.ttl] - Cache time-to-live in milliseconds.
 *     Defaults to 5 minutes (300000 ms).
 * @returns {Object} Request handle with `promise` and `cancel()`.
 * @throws {TypeError} If required options are missing or invalid.
 */
export function request(options) {
    // Validate required arguments before doing any work.
    if (!options || typeof options !== 'object') {
        throw new TypeError('data-layer.request: options must be an object');
    }

    if (typeof options.cacheKey !== 'string' || options.cacheKey.length === 0) {
        throw new TypeError('data-layer.request: options.cacheKey must be a non-empty string');
    }

    if (typeof options.fetcher !== 'function') {
        throw new TypeError('data-layer.request: options.fetcher must be a function');
    }

    // Take the options passed in and assign defaults
    const {
        cacheKey,
        fetcher,
        viewId = null,
        requestPolicy = 'survive-unmount',
        ttl = DEFAULT_TTL
    } = options;

    // Validate the request policy if provided. An invalid policy is a
    // programming error and should fail loudly rather than silently
    // behaving like the default.
    if (requestPolicy !== 'survive-unmount' && requestPolicy !== 'abort-on-unmount') {
        throw new TypeError(
            `data-layer.request: requestPolicy must be 'survive-unmount' or 'abort-on-unmount', got "${requestPolicy}"`
        );
    }

    // -------------------------------------------------------------------
    // Cache Check
    // -------------------------------------------------------------------

    // Check if we have a fresh cached response. If so, return it
    // immediately without calling the fetcher. This is the fast path
    // for repeated requests within the TTL window.
    const cachedData = getCachedData(cacheKey);
    if (cachedData !== undefined) {
        log(`[data-layer] Cache hit for "${cacheKey}"`);
        return {
            promise: Promise.resolve(cachedData),
            cancel() {
                // No-op: cached responses cannot be cancelled. The
                // data is already available and no fetch is in-flight.
            }
        };
    }

    // -------------------------------------------------------------------
    // Deduplication Check
    // -------------------------------------------------------------------

    // Check if an identical request is already in-flight. If so, return
    // the same pending request entry. This prevents duplicate fetches
    // for the same data.
    const existingPending = pendingRequests.get(cacheKey);
    if (existingPending) {
        log(`[data-layer] Deduplicated request for "${cacheKey}"`);

        // Associate this view with the pending request so that
        // abort-on-unmount and cancel-on-new-request work correctly.
        if (viewId) {
            existingPending.viewIds.add(viewId);
            trackRequestForView(viewId, cacheKey);
        }

        return {
            promise: existingPending.promise,
            cancel() {
                // Abort the shared pending request. This cancels the
                // fetch for all views that were sharing it, which is
                // the correct behavior for deduplicated requests.
                if (existingPending.controller) {
                    existingPending.controller.abort();
                }
            }
        };
    }

    // -------------------------------------------------------------------
    // New Request
    // -------------------------------------------------------------------

    // If a viewId is provided, abort any previous requests for this
    // view. This prevents stale responses from older requests
    // overwriting newer ones.
    if (viewId && viewRequests.has(viewId)) {
        const previousKeys = Array.from(viewRequests.get(viewId));
        for (const previousKey of previousKeys) {
            const previousRequest = pendingRequests.get(previousKey);
            if (previousRequest && previousRequest.controller) {
                log(`[data-layer] Aborting previous request "${previousKey}" for view "${viewId}" (new request submitted)`);
                previousRequest.controller.abort();
            }
            // Note: The pending request entry is not removed here.
            // Removal happens when the aborted promise rejects or
            // resolves. Removing it here could cause a race condition
            // if the aborted promise is still being awaited.
        }
    }

    // Create an AbortController so the request can be cancelled.
    // The signal is passed to the fetcher so it can listen for
    // cancellation and abort the underlying fetch.
    const controller = new AbortController();

    // Log the start of the request in development mode.
    log(`[data-layer] Request started: "${cacheKey}" (view: ${viewId || 'none'}, policy: ${requestPolicy})`);

    // Create the pending request entry. The promise is created by
    // calling the fetcher with the abort signal. If the fetcher throws
    // synchronously (which should not happen for well-behaved fetchers),
    // the error will propagate to the caller.
    const promise = fetcher(controller.signal)
        .then((data) => {
            // Request completed successfully. Cache the result and
            // clean up the pending request entry.
            setCachedData(cacheKey, data, ttl);
            pendingRequests.delete(cacheKey);

            if (viewId) {
                untrackRequestForView(viewId, cacheKey);
            }

            log(`[data-layer] Request completed: "${cacheKey}" (view: ${viewId || 'none'})`);

            return data;
        })
        .catch((error) => {
            // Request failed or was aborted. Remove the pending entry
            // so future requests can start fresh.
            pendingRequests.delete(cacheKey);

            if (viewId) {
                untrackRequestForView(viewId, cacheKey);
            }

            // Check if the error is an abort. AbortController.abort()
            // causes the fetch to reject with an AbortError DOMException.
            // We log aborted requests differently from real failures.
            if (error && error.name === 'AbortError') {
                log(`[data-layer] Request aborted: "${cacheKey}" (view: ${viewId || 'none'})`);
            } else {
                log(`[data-layer] Request failed: "${cacheKey}" (view: ${viewId || 'none'})`);
            }

            // Re-throw the error so callers can handle it. Abort errors
            // are also re-thrown; callers should check error.name ===
            // 'AbortError' to distinguish aborts from real failures.
            throw error;
        });

    // Store the pending request entry BEFORE returning so that
    // deduplication works if another request for the same key comes in
    // before this one completes.
    const pendingEntry = {
        promise,
        controller,
        viewIds: new Set(viewId ? [viewId] : [])
    };

    pendingRequests.set(cacheKey, pendingEntry);

    // Associate the view with this request if a viewId was provided.
    if (viewId) {
        trackRequestForView(viewId, cacheKey);
    }

    // Return the request handle. The promise resolves to the parsed
    // response data. The cancel function aborts the request.
    return {
        promise,
        cancel() {
            if (controller) {
                log(`[data-layer] Request cancelled by caller: "${cacheKey}" (view: ${viewId || 'none'})`);
                controller.abort();
            }
        }
    };
}

/**
 * Check the cache for a fresh response without triggering a fetch.
 *
 * This is useful for views that want to check for cached results on
 * mount before deciding whether to submit a new request. If fresh data
 * is available, the view can render it immediately. If not, the view
 * can submit a request or show a placeholder.
 *
 * @param {string} cacheKey - The cache key to check.
 * @returns {Object|undefined} The cached data, or undefined if no
 *     fresh cache entry exists.
 * @throws {TypeError} If cacheKey is not a non-empty string.
 */
export function getCached(cacheKey) {
    if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
        throw new TypeError('data-layer.getCached: cacheKey must be a non-empty string');
    }

    return getCachedData(cacheKey);
}

/**
 * Abort all active requests for a view.
 *
 * This function is called by the shell when a view unmounts and the
 * view's request policy is `abort-on-unmount`. It aborts every request
 * associated with the view and removes them from the pending requests
 * registry.
 *
 * If the view has no active requests, this function does nothing.
 *
 * @param {string} viewId - The ID of the view whose requests to abort.
 * @throws {TypeError} If viewId is not a non-empty string.
 */
export function abortRequestsForView(viewId) {
    if (typeof viewId !== 'string' || viewId.length === 0) {
        throw new TypeError('data-layer.abortRequestsForView: viewId must be a non-empty string');
    }

    const keys = viewRequests.get(viewId);
    if (!keys || keys.size === 0) {
        return;
    }

    // Copy the keys to an array before iterating because aborting a
    // request may remove it from the viewRequests Set, which would
    // otherwise invalidate the iterator.
    const keyArray = Array.from(keys);

    for (const cacheKey of keyArray) {
        const pending = pendingRequests.get(cacheKey);
        if (pending && pending.controller) {
            log(`[data-layer] Aborting request "${cacheKey}" for view "${viewId}" (view unmounted)`);
            pending.controller.abort();
        }
        // The pending entry is NOT removed here. Removal happens in
        // the promise's catch handler when the abort rejection
        // propagates. Removing it here could cause a race condition.
    }
}

/**
 * Remove all cached entries and clear all pending request tracking.
 *
 * This is primarily useful for testing or for scenarios where the
 * application needs to reset to a clean state (e.g., user logout,
 * configuration change that invalidates all cached data).
 *
 * After calling this function, all subsequent requests will miss the
 * cache and start fresh fetches.
 */
export function clearCache() {
    cache.clear();
    pendingRequests.clear();
    viewRequests.clear();

    log('[data-layer] Cache and pending requests cleared');
}

// ---------------------------------------------------------------------------
// HTTP Helpers
// ---------------------------------------------------------------------------

/**
 * Send an HTTP request and return the parsed JSON response.
 *
 * This is a thin wrapper around fetch() that handles status checking,
 * error normalization, and JSON parsing. The caller specifies the
 * request method and any body via the options parameter.
 *
 * @param {string} url - Full request URL.
 * @param {Object} [options] - Fetch options (method, headers, body, etc.).
 *     If omitted, defaults to a GET request.
 * @returns {Promise<Object>} Parsed JSON response body.
 * @throws {TypeError} If url is not a non-empty string or options is
 *     not an object.
 * @throws {NetworkError} If the network request fails.
 * @throws {HttpError} If the server returns a non-2xx status.
 * @throws {ParseError} If the response body is not valid JSON.
 *
 * @example
 * // GET request
 * const data = await requestJson('https://example.com/api/nouns/кролик');
 *
 * @example
 * // POST request with JSON body
 * const data = await requestJson('https://example.com/api/nouns/batch', {
 *     method: 'POST',
 *     headers: {
 *         'Content-Type': 'application/json',
 *     },
 *     body: JSON.stringify({ words: ['кролик', 'лук'], strict: false }),
 * });
 */
async function requestJson(url, options = {}) {
    if (typeof url !== 'string' || url.length === 0) {
        throw new TypeError('requestJson: url must be a non-empty string');
    }

    if (options === null || typeof options !== 'object') {
        throw new TypeError('requestJson: options must be an object, null, or undefined');
    }

    let response;

    try {
        response = await fetch(url, options);
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
    } catch {
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

// ---------------------------------------------------------------------------
// Endpoint Convenience Functions
//
// - Convenience functions that views use to contact the FastAPI server
// - Attached to the request context object created by the shell and passed
//   to each view during mount
// - The context also carries the view's ID and request policy, so the data
//   layer knows which view made each request and can manage it accordingly
//   (caching, deduplication, abort-on-unmount, etc.)
// - Declare any new endpoint functions here and attach them in
//   createRequestContext()
// ---------------------------------------------------------------------------

/**
 * Fetch declension data for a single noun.
 *
 * Constructs the endpoint URL, builds a cache key, and delegates to the
 * generic request manager with the supplied view ID and request policy.
 * This function is called by the request context returned from
 * createRequestContext(), which supplies the view's identity and policy.
 *
 * @param {string} viewId - The ID of the requesting view.
 * @param {string} requestPolicy - The request policy for the view.
 *     Must be 'survive-unmount' or 'abort-on-unmount'.
 * @param {string} baseUrl - The base URL for API requests.
 * @param {string} word - The Russian noun to look up (Cyrillic, UTF-8).
 * @param {boolean} strict - Whether strict dictionary-form matching is enabled.
 * @returns {Promise<Object>} Parsed NounLookupResponse JSON.
 * @throws {TypeError} If arguments are missing or invalid.
 * @throws {ApiError} Subclass depending on failure mode.
 */
function fetchNounDeclensionsForView(viewId, requestPolicy, baseUrl, word, strict) {
    if (typeof viewId !== 'string' || viewId.length === 0) {
        throw new TypeError('fetchNounDeclensionsForView: viewId must be a non-empty string');
    }

    if (requestPolicy !== 'survive-unmount' && requestPolicy !== 'abort-on-unmount') {
        throw new TypeError(
            `fetchNounDeclensionsForView: requestPolicy must be 'survive-unmount' or 'abort-on-unmount', got "${requestPolicy}"`
        );
    }

    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        throw new TypeError(`fetchNounDeclensionsForView: baseUrl must be a non-empty string, got "${baseUrl}"`);
    }

    if (typeof word !== 'string' || word.length === 0) {
        throw new TypeError('fetchNounDeclensionsForView: word must be a non-empty string');
    }

    if (typeof strict !== 'boolean') {
        throw new TypeError('fetchNounDeclensionsForView: strict must be a boolean');
    }


    const url = `${baseUrl}/api/v1/nouns/${encodeURIComponent(word)}/declensions?strict=${strict}`;

    // Build a canonical cache key. The key uniquely identifies this
    // request so the data layer can deduplicate identical in-flight
    // requests and cache the result for future use.
    const cacheKey = buildCacheKey('noun-declensions', {
        word,
        strict
    });

    // send the GET request and return promise
    return request({
        cacheKey,
        fetcher: () => requestJson(url),
        viewId,
        requestPolicy
    }).promise;
}

/**
 * Fetch declension data for multiple nouns in a batch request.
 *
 * Constructs the endpoint URL and request body, builds a cache key, and
 * delegates to the generic request manager with the supplied view ID
 * and request policy. This function is called by the request context
 * returned from createRequestContext(), which supplies the view's
 * identity and policy.
 *
 * @param {string} viewId - The ID of the requesting view.
 * @param {string} requestPolicy - The request policy for the view.
 *     Must be 'survive-unmount' or 'abort-on-unmount'.
 * @param {string} baseUrl - The base URL for API requests.
 * @param {string[]} words - List of Russian nouns to look up.
 * @param {boolean} strict - Whether strict dictionary-form matching is enabled.
 * @returns {Promise<Object>} Parsed NounBatchResponse JSON.
 * @throws {TypeError} If arguments are missing or invalid.
 * @throws {ApiError} Subclass depending on failure mode.
 */
function fetchNounBatchForView(viewId, requestPolicy, baseUrl, words, strict) {
    if (typeof viewId !== 'string' || viewId.length === 0) {
        throw new TypeError('fetchNounBatchForView: viewId must be a non-empty string');
    }

    if (requestPolicy !== 'survive-unmount' && requestPolicy !== 'abort-on-unmount') {
        throw new TypeError(
            `fetchNounBatchForView: requestPolicy must be 'survive-unmount' or 'abort-on-unmount', got "${requestPolicy}"`
        );
    }

    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        throw new TypeError('fetchNounBatchForView: baseUrl must be a non-empty string');
    }

    if (!Array.isArray(words)) {
        throw new TypeError('fetchNounBatchForView: words must be an array');
    }

    if (words.length === 0) {
        throw new TypeError('fetchNounBatchForView: words must not be empty');
    }

    if (typeof strict !== 'boolean') {
        throw new TypeError('fetchNounBatchForView: strict must be a boolean');
    }

    const url = `${baseUrl}/api/v1/nouns/batch`;

    // Build a canonical cache key from the words array and strict flag.
    // Note: the words array is serialized as-is. If the order of words
    // changes, the cache key changes. This is correct because the API
    // response is order-dependent (results are returned in request
    // order).
    const cacheKey = buildCacheKey('noun-batch', {
        words,
        strict
    });

    // send the POST request and return promise
    return request({
        cacheKey,
        fetcher: () => requestJson(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                words,
                strict
            }),
        }),
        viewId,
        requestPolicy
    }).promise;
}

// ---------------------------------------------------------------------------
// Request Context Factory
// ---------------------------------------------------------------------------

/**
 * Create a request context bound to a view's identity and policy.
 *
 * The request context provides pre-bound endpoint methods that views
 * can call directly. Each method internally invokes the generic
 * `request()` function with the view's ID and request policy already
 * attached. Views do not need to pass their own ID or policy at call
 * time.
 *
 * This keeps call sites clean and ensures request ownership is tracked
 * consistently without requiring the view to repeat its identity or
 * request preference that it already declared at registration time
 * (e.g. abort-on-unmount)
 *
 * Intended to be used by the shell (app.js). When the shell mounts a
 * view, it calls this function with the view's ID and registered
 * request policy, then passes the returned context to the view via
 * the mount context object. The view then stores that context and calls
 * its endpoint methods when it needs to contact the FastAPI server.
 *
 * Example flow:
 *   1. View registers itself once at module load time.
 *   2. Each time the view is mounted again (new navigation), the shell
 *      reads the view descriptor from the registry.
 *   3. Shell calls this function:
 *        createRequestContext(view.id, view.requestPolicy).
 *   4. Shell mounts the view and passes this context to it:
 *        view.mount(container, { requestContext }).
 *   5. View receives the context within its mount and stores it:
 *        mount(container, context) {
 *            requestContext = context.requestContext;
 *        }
 *   6. When the view needs to contact the FastAPI server (user submits
 *      a request), it calls the saved context:
 *        requestContext.fetchNounDeclensions(word, strict)
 *
 *      --> The data layer receives the request and calls the
 *          convenience method, which calls request(). Since the context
 *          also carries the view's identity, the data layer can track
 *          which view made the request and handle aborting it if needed.
 *
 * @param {string} viewId - The ID of the view that will use this context.
 * @param {string} requestPolicy - The request policy for the view.
 *     Must be 'survive-unmount' or 'abort-on-unmount'.
 * @param {string} baseUrl - The base URL for API requests, supplied by
 *     the shell when creating the request context (shell should obtain
 *     it from config.json via config.js getConfig())
 * @returns {Object} Request context with pre-bound endpoint methods.
 * @throws {TypeError} If viewId is not a non-empty string or if
 *     requestPolicy is invalid.
 */
export function createRequestContext(viewId, requestPolicy, baseUrl) {
    if (typeof viewId !== 'string' || viewId.length === 0) {
        throw new TypeError('data-layer.createRequestContext: viewId must be a non-empty string');
    }

    if (requestPolicy !== 'survive-unmount' && requestPolicy !== 'abort-on-unmount') {
        throw new TypeError(
            `data-layer.createRequestContext: requestPolicy must be 'survive-unmount' or 'abort-on-unmount', got "${requestPolicy}"`
        );
    }

    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        throw new TypeError('data-layer.createRequestContext: baseUrl must be a non-empty string');
    }

    // this is what gets returned to the shell and passed to
    // the individual views. so a view will then, when they
    // want to make an HTTP request, call one of these conveneicne
    // functions:
    // 		viewContext.fetchNounDeclensions(word, strict);
    return {
        fetchNounDeclensions: (word, strict) =>
            fetchNounDeclensionsForView(viewId, requestPolicy, baseUrl, word, strict),

        fetchNounBatch: (words, strict) =>
            fetchNounBatchForView(viewId, requestPolicy, baseUrl, words, strict),
    };
}
