/**
 * Ruslovar API Demo — View Registry
 *
 * Provides a minimal registration mechanism for demo views. Each view
 * module registers itself with a unique ID, its localized strings, and
 * mount/unmount lifecycle functions. The application shell uses this
 * registry to populate navigation and swap views.
 *
 * This module is the single source of truth for view identity and all
 * view-related data, including strings. Other subsystems (e.g., i18n)
 * resolve view-specific data by referencing this registry.
 *
 * Responsibilities:
 *   - Store view descriptors in registration order.
 *   - Provide access to registered views for shell rendering.
 *   - Allow lookup of views by unique ID.
 *   - Validate view descriptors on registration.
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
 * When true, the registry logs warnings for view descriptors that
 * violate conventions (e.g., missing getState for a stateful view).
 * This provides visibility during development without blocking
 * legitimate static views that genuinely have no state to preserve.
 *
 * TODO: Move this to a dedicated environment module (e.g., core/env.js)
 * when the project grows to include build configuration or multiple
 * deployment environments.
 *
 * @type {boolean}
 */
const DEV_MODE = true;

/**
 * Describes a demo view.
 *
 * @typedef {Object} ViewDescriptor
 * @property {string} id - Unique identifier (e.g., "noun-single").
 * @property {string} labelKey - i18n key for the navigation label.
 *     Must exist within the view's own strings table.
 * @property {Object} strings - Localized string table for this view.
 *     Keyed by language code (e.g., "ru", "en"), then by string key.
 * @property {Function} mount - Function called with (container, context)
 *     when the view becomes active. Responsible for building the view
 *     DOM, binding events, and restoring state if context.state is
 *     present.
 *
 *     The context object contains:
 *       - state: The saved state slice for this view, or undefined if
 *         no state was previously saved. The view is responsible for
 *         validating and restoring this state internally.
 *       - urlParams: A URLSearchParams instance for the current URL.
 *         Views may use this for deep-linking support.
 *       - isFirstMount: True if no saved state exists for this view.
 *
 * @property {Function} [unmount] - Optional cleanup function called when
 *     the view is deactivated. Should remove event listeners and cancel
 *     any pending work. State preservation is handled by the shell
 *     calling getState() before unmount, so unmount does not need to
 *     save state itself.
 *
 * @property {Function} [getState] - Optional but strongly recommended
 *     for any view with user-modifiable state. Returns a plain,
 *     JSON-serializable object representing the current state of the
 *     view. The shell calls this function before unmounting the view
 *     and stores the result in the state store. On subsequent mount,
 *     the state is passed to mount() via context.state.
 *
 *     If getState is not provided, the view's state will be lost on
 *     unmount. This is acceptable for static informational views that
 *     have no user-modifiable state, but is a bug for views with forms,
 *     results, or other interactive elements.
 *
 * @property {string} [requestPolicy] - Optional request lifecycle policy
 *     for this view. Determines what happens to in-flight requests when
 *     the view unmounts.
 *
 *     'survive-unmount' (default): Requests continue after unmount.
 *       Results are cached and available on remount.
 *
 *     'abort-on-unmount': Requests are aborted when the shell unmounts
 *       the view. Use this for expensive requests that should not
 *       continue if the user navigates away.
 *
 *     If not provided, defaults to 'survive-unmount'.
 */

/**
 * Registered view descriptors in registration order.
 *
 * @type {ViewDescriptor[]}
 */
const views = [];

/**
 * Register a view descriptor with the application.
 *
 * Validates that the descriptor has all required fields and that the
 * values are of the correct type. Throws if validation fails — a
 * malformed view descriptor is a programming error and should be
 * caught during development, not at runtime.
 *
 * @param {ViewDescriptor} view - The view descriptor to register.
 * @throws {Error} If the view is missing required fields.
 * @throws {Error} If a view with the same ID is already registered.
 */
export function registerView(view) {
    if (!view || typeof view !== 'object') {
        throw new Error('registerView: View descriptor must be an object');
    }

    if (!view.id || typeof view.id !== 'string') {
        throw new Error('registerView: View descriptor must have a string "id"');
    }

    if (typeof view.mount !== 'function') {
        throw new Error(`registerView: View "${view.id}" must have a "mount" function`);
    }

    if (!view.strings || typeof view.strings !== 'object') {
        throw new Error(`registerView: View "${view.id}" must have a "strings" object`);
    }

    if (!view.labelKey || typeof view.labelKey !== 'string') {
        throw new Error(`registerView: View "${view.id}" must have a string "labelKey"`);
    }

    // supply a default requestPolicy if none supplied
    if (view.requestPolicy === undefined) {
        view.requestPolicy = 'survive-unmount';
    }

    // Validate requestPolicy if provided (or the default)
    if (view.requestPolicy !== undefined) {
        if (
            view.requestPolicy !== 'survive-unmount' &&
            view.requestPolicy !== 'abort-on-unmount'
        ) {
            throw new Error(
                `registerView: View "${view.id}" has invalid requestPolicy "${view.requestPolicy}". ` +
                `Must be 'survive-unmount' or 'abort-on-unmount'.`
            );
        }
    }

    // Validate getState if provided. It must be a function.
    if (view.getState !== undefined && typeof view.getState !== 'function') {
        throw new Error(`registerView: View "${view.id}" getState must be a function`);
    }

    // Validate unmount if provided. It must be a function.
    if (view.unmount !== undefined && typeof view.unmount !== 'function') {
        throw new Error(`registerView: View "${view.id}" unmount must be a function`);
    }

    // Ensure no duplicate IDs are registered.
    if (views.some((existing) => existing.id === view.id)) {
        throw new Error(`registerView: View with id "${view.id}" is already registered`);
    }

    // In development mode, warn if a view lacks getState. This is not
    // an error because some views (static informational pages) may
    // genuinely have no state to preserve. But for views with forms or
    // results, missing getState is likely a bug.
    if (DEV_MODE && typeof view.getState !== 'function') {
        console.warn(
            `registerView: View "${view.id}" does not implement getState(). ` +
            `State will be lost when the view is unmounted. ` +
            `If this view has user-modifiable state, implement getState() to preserve it.`
        );
    }

    views.push(view);
}

/**
 * Return all registered views in registration order.
 *
 * @returns {ViewDescriptor[]} Array of view descriptors.
 */
export function getViews() {
    return views;
}

/**
 * Find a view by its unique ID.
 *
 * @param {string} id - The view ID to search for.
 * @returns {ViewDescriptor|undefined} The matching view, or undefined.
 */
export function getViewById(id) {
    return views.find((view) => view.id === id);
}