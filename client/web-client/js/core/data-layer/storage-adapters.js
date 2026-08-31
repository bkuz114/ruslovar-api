/**
 * Ruslovar API Demo — Storage Adapters
 *
 * Provides storage adapter objects that implement the Web Storage API
 * interface (getItem, setItem, removeItem). These adapters are used by
 * the store (core/store.js) when persistence is enabled for a namespace.
 *
 * The store does not depend on any specific storage backend. It accepts
 * any object that implements the adapter interface. This module provides
 * adapters for the two most common browser storage backends:
 *
 *   - localStorage: persistent across browser sessions.
 *   - sessionStorage: persistent only for the current tab session.
 *
 * Both adapters are defensive: if the underlying storage backend is
 * unavailable (e.g., blocked by browser privacy settings, disabled by
 * the user, or throws a SecurityError in a sandboxed iframe), the
 * adapter falls back to an in-memory implementation. This prevents the
 * store from crashing or throwing when persistence is enabled but the
 * environment does not support it.
 *
 * The in-memory fallback is per-adapter-instance. Each adapter that
 * falls back to in-memory storage has its own isolated Map, so data
 * does not leak between adapters or between namespaces.
 *
 * Dependencies:
 *   - None (standalone module)
 */

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Detect whether a storage backend is available and functional.
 *
 * Attempts to write a test key to the storage backend and immediately
 * remove it. If the write fails (which can happen in private browsing
 * modes, sandboxed iframes, or when storage is disabled), the backend
 * is considered unavailable.
 *
 * This detection is done once per adapter at module evaluation time.
 * The result is cached so the adapter doesn't attempt to use a broken
 * backend on every operation.
 *
 * @param {Storage} storageBackend - The storage backend to test
 *     (e.g., window.localStorage or window.sessionStorage).
 * @returns {boolean} True if the backend is functional.
 */
function isStorageAvailable(storageBackend) {
    const testKey = '__storage_test__';

    try {
        storageBackend.setItem(testKey, 'test');
        storageBackend.removeItem(testKey);
        return true;
    } catch {
        // Any exception (SecurityError, QuotaExceededError, etc.)
        // means the backend is not usable.
        return false;
    }
}

/**
 * Create an in-memory storage adapter.
 *
 * Returns an adapter object with the same interface as a Storage
 * backend, but backed by a JavaScript Map. This is used as a fallback
 * when the real storage backend is unavailable.
 *
 * The Map is local to the returned adapter, so each adapter instance
 * has its own isolated storage space.
 *
 * @returns {Object} An adapter with getItem, setItem, and removeItem.
 */
function createMemoryStorage() {
    const memoryMap = new Map();

    return {
        /**
         * Retrieve a value from in-memory storage.
         *
         * @param {string} key - The key to retrieve.
         * @returns {string|null} The stored value, or null if absent.
         */
        getItem(key) {
            return memoryMap.has(key) ? memoryMap.get(key) : null;
        },

        /**
         * Store a value in in-memory storage.
         *
         * @param {string} key - The key to store under.
         * @param {string} value - The string value to store.
         */
        setItem(key, value) {
            memoryMap.set(key, String(value));
        },

        /**
         * Remove a value from in-memory storage.
         *
         * @param {string} key - The key to remove.
         */
        removeItem(key) {
            memoryMap.delete(key);
        }
    };
}

// ---------------------------------------------------------------------------
// Storage Adapters
// ---------------------------------------------------------------------------

/**
 * LocalStorage adapter with in-memory fallback.
 *
 * Provides persistent storage across browser sessions. If localStorage
 * is unavailable, operations are performed against an in-memory Map
 * instead, so data is retained for the lifetime of the page even if it
 * won't survive a reload.
 *
 * @type {Object}
 */
export const localStorageAdapter = (function createLocalStorageAdapter() {
    // Access window.localStorage once and cache the reference. If the
    // browser doesn't expose localStorage (very old browsers, some
    // embedded webviews), this would throw at module load, so we guard
    // with typeof.
    const storageBackend = (typeof window !== 'undefined' && window.localStorage) ?
        window.localStorage :
        null;

    // Test whether the backend is actually usable. If not, fall back
    // to in-memory storage.
    const usable = storageBackend !== null && isStorageAvailable(storageBackend);

    if (usable) {
        return {
            /**
             * Retrieve a value from localStorage.
             *
             * @param {string} key - The key to retrieve.
             * @returns {string|null} The stored value, or null if absent.
             */
            getItem(key) {
                try {
                    return storageBackend.getItem(key);
                } catch {
                    // Log the failure but don't throw. Callers should
                    // treat null as "no data".
                    console.warn(`localStorageAdapter: getItem failed for key "${key}"`);
                    return null;
                }
            },

            /**
             * Store a value in localStorage.
             *
             * If the write fails (e.g., quota exceeded), the error is
             * logged but not thrown. The store's in-memory state is
             * still updated, so the application continues to function.
             *
             * @param {string} key - The key to store under.
             * @param {string} value - The string value to store.
             */
            setItem(key, value) {
                try {
                    storageBackend.setItem(key, value);
                } catch (error) {
                    console.warn(`localStorageAdapter: setItem failed for key "${key}":`, error);
                }
            },

            /**
             * Remove a value from localStorage.
             *
             * @param {string} key - The key to remove.
             */
            removeItem(key) {
                try {
                    storageBackend.removeItem(key);
                } catch (error) {
                    console.warn(`localStorageAdapter: removeItem failed for key "${key}":`, error);
                }
            }
        };
    } else {
        // Fall back to in-memory storage. Data will be lost on page
        // reload, but the application won't crash.
        console.warn(
            'localStorageAdapter: localStorage is unavailable. Falling back to in-memory storage.'
        );
        return createMemoryStorage();
    }
})();

/**
 * SessionStorage adapter with in-memory fallback.
 *
 * Provides storage that persists only for the current tab session.
 * If sessionStorage is unavailable, operations are performed against
 * an in-memory Map instead.
 *
 * @type {Object}
 */
export const sessionStorageAdapter = (function createSessionStorageAdapter() {
    // Access window.sessionStorage once and cache the reference.
    const storageBackend = (typeof window !== 'undefined' && window.sessionStorage) ?
        window.sessionStorage :
        null;

    const usable = storageBackend !== null && isStorageAvailable(storageBackend);

    if (usable) {
        return {
            /**
             * Retrieve a value from sessionStorage.
             *
             * @param {string} key - The key to retrieve.
             * @returns {string|null} The stored value, or null if absent.
             */
            getItem(key) {
                try {
                    return storageBackend.getItem(key);
                } catch {
                    console.warn(`sessionStorageAdapter: getItem failed for key "${key}"`);
                    return null;
                }
            },

            /**
             * Store a value in sessionStorage.
             *
             * @param {string} key - The key to store under.
             * @param {string} value - The string value to store.
             */
            setItem(key, value) {
                try {
                    storageBackend.setItem(key, value);
                } catch (error) {
                    console.warn(`sessionStorageAdapter: setItem failed for key "${key}":`, error);
                }
            },

            /**
             * Remove a value from sessionStorage.
             *
             * @param {string} key - The key to remove.
             */
            removeItem(key) {
                try {
                    storageBackend.removeItem(key);
                } catch (error) {
                    console.warn(`sessionStorageAdapter: removeItem failed for key "${key}":`, error);
                }
            }
        };
    } else {
        console.warn(
            'sessionStorageAdapter: sessionStorage is unavailable. Falling back to in-memory storage.'
        );
        return createMemoryStorage();
    }
})();