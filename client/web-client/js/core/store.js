/**
 * Ruslovar API Demo — Store
 *
 * Provides a minimal, framework-agnostic state container for view state
 * preservation. Each view is allocated its own namespace (typically its
 * view ID) and may store a single, JSON-serializable state slice.
 *
 * Design goals:
 *   - Keep the store intentionally dumb. It does not validate state
 *     shape, know about views, or interpret stored data in any way.
 *   - Provide a clear, synchronous API for reading and writing state.
 *   - Support pub/sub notification so future features (reactive UI,
 *     devtools, persistence hooks) can observe state changes without
 *     modifying the store itself.
 *   - Enforce immutability in development mode to catch accidental
 *     mutation of stored state before it becomes a production bug.
 *
 * State immutability contract:
 *   State objects are stored by reference. Callers MUST NOT mutate a
 *   state object returned by getState(). To update state, create a new
 *   object and call setState(). In development mode, retrieved state
 *   is deeply frozen so accidental mutation fails loudly.
 *
 * Persistence:
 *   The store core is in-memory only. Persistence may be enabled for
 *   individual namespaces via enablePersistence(), which accepts an
 *   adapter object (e.g., localStorage). This keeps the store core
 *   free of environment-specific dependencies.
 *
 * Dependencies:
 *   - None (standalone module)
 */

// ---------------------------------------------------------------------------
// Development Mode Flag
// ---------------------------------------------------------------------------

/**
 * Whether the application is running in development mode.
 *
 * When true, the store deep-freezes state objects on both get and set.
 * This catches accidental mutation of stored state during development.
 *
 * When false, no freezing is performed, eliminating the recursive
 * freeze overhead in production.
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
 * In-memory state storage.
 *
 * Maps namespace strings to their current state slice. State slices are
 * plain objects. By convention, every state slice should include a
 * `version` field so views can detect and migrate outdated state.
 *
 * @type {Map<string, Object>}
 */
const stateMap = new Map();

/**
 * Subscriber registry.
 *
 * Maps namespace strings to a Set of callback functions. Callbacks are
 * invoked with (newState, oldState) whenever setState() is called for
 * that namespace.
 *
 * Callbacks are stored in insertion order within each Set. This is the
 * native behavior of JavaScript Sets (insertion order is preserved for
 * string and symbol keys, which applies to function references).
 *
 * @type {Map<string, Set<Function>>}
 */
const subscribers = new Map();

/**
 * Persistence configuration registry.
 *
 * Maps namespace strings to persistence configuration objects. If a
 * namespace has no entry, its state is kept in memory only. If it has
 * an entry, the store will attempt to persist state on every setState()
 * and will restore persisted state during loadPersistedState().
 *
 * @type {Map<string, Object>}
 */
const persistenceConfig = new Map();

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Deeply freeze an object, making it immutable.
 *
 * Uses Object.freeze recursively on all enumerable own properties.
 * Handles nested objects, arrays, and primitive values. Does not freeze
 * Date, Map, Set, or other built-in objects (they will be frozen at the
 * top level but their internal state remains mutable). This is
 * acceptable because state slices are expected to be plain
 * JSON-serializable objects.
 *
 * The function short-circuits if the input is already frozen, avoiding
 * redundant recursion when the same object is frozen multiple times.
 * This matters because a state object stored via setState() and later
 * retrieved via getState() would otherwise be frozen twice.
 *
 * @param {*} obj - The value to freeze.
 * @returns {*} The same value, now deeply frozen.
 */
function deepFreeze(obj) {
    // Primitives and null are already immutable. Objects that are
    // already frozen can be returned immediately — this prevents
    // infinite recursion on circular references and avoids redundant
    // work when the same object is frozen multiple times.
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
        return obj;
    }

    // Freeze the object itself before recursing into its children.
    // This prevents circular references from causing infinite loops:
    // if a property points back to an ancestor, that ancestor is
    // already frozen by the time we encounter the reference.
    Object.freeze(obj);

    // Recurse into all enumerable own properties. Note that we use
    // Object.values() rather than Object.keys() + property access
    // because it's more concise and handles array indices correctly.
    for (const value of Object.values(obj)) {
        deepFreeze(value);
    }

    return obj;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the current state slice for a namespace.
 *
 * Returns undefined if no state has been stored for the namespace.
 * The returned object is a direct reference to the store's internal
 * state. Callers MUST NOT mutate it. To modify state, create a new
 * object and pass it to setState().
 *
 * In development mode, the returned state is deeply frozen. Any
 * accidental mutation will either throw (in strict mode) or fail
 * silently (in sloppy mode, the mutation is ignored). Both outcomes
 * are preferable to corrupting stored state, and the developer is
 * alerted to the contract violation.
 *
 * @param {string} namespace - The namespace to retrieve (typically a view ID).
 * @returns {Object|undefined} The stored state slice, or undefined.
 */
export function getState(namespace) {
    const state = stateMap.get(namespace);

    if (DEV_MODE && state !== undefined) {
        return deepFreeze(state);
    }

    return state;
}

/**
 * Store a state slice for a namespace.
 *
 * Replaces any previously stored state for the namespace with the new
 * state. The store does not merge state objects — full replacement is
 * the only supported operation. This keeps the store's behavior
 * predictable and avoids shape-aware merge logic.
 *
 * After storing, all subscribers for the namespace are notified with
 * (newState, oldState). Subscribers are notified synchronously, after
 * the state has been fully stored. If a subscriber throws, the error
 * is logged but does not prevent other subscribers from being notified.
 *
 * In development mode, the state is deeply frozen before storage. This
 * ensures that the store's internal reference cannot be mutated by the
 * caller after setState() returns.
 *
 * @param {string} namespace - The namespace to store under.
 * @param {Object} state - The state slice to store. Must be JSON-serializable.
 */
export function setState(namespace, state) {
    // Retrieve the old state before overwriting, so we can pass it to
    // subscribers. This must happen before deepFreeze because deepFreeze
    // returns the same object reference (it mutates in place), and we
    // want subscribers to receive the old, unmodified object.
    const oldState = stateMap.get(namespace);

    // Freeze the new state in development mode. This catches accidental
    // mutation of the state object after it has been stored.
    const storedState = DEV_MODE ? deepFreeze(state) : state;

    // Store the state. This replaces any previous state for the
    // namespace. No merging is performed.
    stateMap.set(namespace, storedState);

    // Persist to an external adapter if persistence is enabled for this
    // namespace. Failures are logged but do not prevent the in-memory
    // store from being updated — the application continues to function
    // even if persistence is unavailable (e.g., localStorage quota
    // exceeded, private browsing mode).
    const config = persistenceConfig.get(namespace);
    if (config) {
        try {
            const serialized = config.serialize(storedState);
            config.adapter.setItem(`view-state:${namespace}`, serialized);
        } catch (error) {
            console.warn(
                `store: Failed to persist state for namespace "${namespace}":`,
                error
            );
        }
    }

    // Notify subscribers. Each subscriber is called synchronously in
    // insertion order. If a subscriber throws, the error is logged but
    // does not interrupt notification of remaining subscribers.
    const namespaceSubscribers = subscribers.get(namespace);
    if (namespaceSubscribers) {
        for (const callback of namespaceSubscribers) {
            try {
                callback(storedState, oldState);
            } catch (error) {
                console.error(
                    `store: Subscriber for namespace "${namespace}" threw:`,
                    error
                );
            }
        }
    }
}

/**
 * Check whether a namespace has stored state.
 *
 * This is useful for distinguishing between "no state saved" and
 * "state saved but undefined" (though the latter should never occur,
 * as setState() with undefined would be a bug).
 *
 * @param {string} namespace - The namespace to check.
 * @returns {boolean} True if the namespace has stored state.
 */
export function hasState(namespace) {
    return stateMap.has(namespace);
}

/**
 * Remove stored state for a namespace.
 *
 * Also removes any persistence configuration for the namespace and
 * notifies subscribers with (undefined, oldState).
 *
 * @param {string} namespace - The namespace to clear.
 */
export function clearState(namespace) {
    const oldState = stateMap.get(namespace);
    stateMap.delete(namespace);

    // Remove persisted state if persistence is enabled for this namespace.
    const config = persistenceConfig.get(namespace);
    if (config) {
        try {
            config.adapter.removeItem(`view-state:${namespace}`);
        } catch (error) {
            console.warn(
                `store: Failed to remove persisted state for namespace "${namespace}":`,
                error
            );
        }
    }

    // Notify subscribers that state has been cleared.
    const namespaceSubscribers = subscribers.get(namespace);
    if (namespaceSubscribers) {
        for (const callback of namespaceSubscribers) {
            try {
                callback(undefined, oldState);
            } catch (error) {
                console.error(
                    `store: Subscriber for namespace "${namespace}" threw:`,
                    error
                );
            }
        }
    }
}

/**
 * Subscribe to state changes for a namespace.
 *
 * The callback is invoked synchronously whenever setState() or
 * clearState() is called for the namespace. The callback receives
 * (newState, oldState), where newState may be undefined if the state
 * was cleared.
 *
 * Returns an unsubscribe function. Calling it removes the callback
 * from the subscriber set. It is safe to call unsubscribe multiple
 * times — subsequent calls are no-ops.
 *
 * @param {string} namespace - The namespace to observe.
 * @param {Function} callback - Function called with (newState, oldState).
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(namespace, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('store.subscribe: callback must be a function');
    }

    // Lazily create the subscriber set for this namespace.
    if (!subscribers.has(namespace)) {
        subscribers.set(namespace, new Set());
    }

    const namespaceSubscribers = subscribers.get(namespace);
    namespaceSubscribers.add(callback);

    // Return an unsubscribe function. We use a closure to capture the
    // namespace and callback, so the returned function can be called
    // without arguments.
    return function unsubscribe() {
        const currentSubscribers = subscribers.get(namespace);
        if (currentSubscribers) {
            currentSubscribers.delete(callback);

            // Clean up the namespace entry if no subscribers remain.
            // This prevents unbounded growth of the subscribers Map.
            if (currentSubscribers.size === 0) {
                subscribers.delete(namespace);
            }
        }
    };
}

/**
 * Enable persistence for a namespace.
 *
 * Persistence is opt-in. By default, all state is kept in memory only
 * and is lost when the page is reloaded. Enabling persistence causes
 * setState() to write the serialized state to an external adapter
 * (e.g., localStorage) and clearState() to remove it.
 *
 * The adapter must implement:
 *   - getItem(key) → string|null
 *   - setItem(key, value)
 *   - removeItem(key)
 *
 * This matches the Web Storage API (localStorage, sessionStorage).
 * Other adapters (e.g., IndexedDB wrappers, custom backends) can be
 * used as long as they implement this interface.
 *
 * @param {string} namespace - The namespace to enable persistence for.
 * @param {Object} options - Persistence options.
 * @param {Object} options.adapter - Storage adapter object.
 * @param {Function} [options.serialize] - Custom serializer. Defaults to JSON.stringify.
 * @param {Function} [options.deserialize] - Custom deserializer. Defaults to JSON.parse.
 */
export function enablePersistence(namespace, options) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('store.enablePersistence: options must be an object');
    }

    if (!options.adapter || typeof options.adapter !== 'object') {
        throw new TypeError('store.enablePersistence: options.adapter must be an object');
    }

    if (
        typeof options.adapter.getItem !== 'function' ||
        typeof options.adapter.setItem !== 'function' ||
        typeof options.adapter.removeItem !== 'function'
    ) {
        throw new TypeError(
            'store.enablePersistence: options.adapter must implement getItem, setItem, and removeItem'
        );
    }

    persistenceConfig.set(namespace, {
        adapter: options.adapter,
        serialize: options.serialize || JSON.stringify,
        deserialize: options.deserialize || JSON.parse
    });
}

/**
 * Disable persistence for a namespace.
 *
 * Stops future setState() and clearState() calls from touching the
 * external adapter. Does not remove any previously persisted state —
 * call clearState() first if you want to remove persisted data.
 *
 * @param {string} namespace - The namespace to disable persistence for.
 */
export function disablePersistence(namespace) {
    persistenceConfig.delete(namespace);
}

/**
 * Load persisted state for all namespaces with persistence enabled.
 *
 * Iterates over each namespace in the persistence configuration, reads
 * the serialized state from the adapter, deserializes it, and stores it
 * in the in-memory state map.
 *
 * This function should be called once during application startup,
 * before any views are mounted, so that views see persisted state on
 * first mount.
 *
 * If deserialization fails for a namespace, the error is logged and
 * the persisted data is left untouched. The in-memory state for that
 * namespace remains undefined. This is a deliberate choice: the
 * developer should see the error and fix the underlying issue rather
 * than silently discarding user data.
 */
export function loadPersistedState() {
    for (const [namespace, config] of persistenceConfig.entries()) {
        try {
            const serialized = config.adapter.getItem(`view-state:${namespace}`);

            // If no persisted data exists for this namespace, skip it.
            // The in-memory state remains undefined, which is correct.
            if (serialized === null || serialized === undefined) {
                continue;
            }

            const state = config.deserialize(serialized);

            // Freeze in dev mode before storing, matching setState() behavior.
            const storedState = DEV_MODE ? deepFreeze(state) : state;
            stateMap.set(namespace, storedState);

            // Do not notify subscribers here. This is a bulk load
            // operation at startup, and no views are mounted yet.
            // Notifying would be premature and could cause views to
            // render before the shell is ready.
        } catch (error) {
            console.error(
                `store: Failed to load persisted state for namespace "${namespace}":`,
                error
            );
        }
    }
}