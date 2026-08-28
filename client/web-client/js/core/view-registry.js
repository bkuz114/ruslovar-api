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
 *
 * Dependencies:
 *   - None (standalone module)
 */

/**
 * Describes a demo view.
 *
 * @typedef {Object} ViewDescriptor
 * @property {string} id - Unique identifier (e.g., "noun-single").
 * @property {string} labelKey - i18n key for the navigation label.
 *     Must exist within the view's own strings table.
 * @property {Object} strings - Localized string table for this view.
 *     Keyed by language code (e.g., "ru", "en"), then by string key.
 * @property {Function} mount - Function called with the mount container
 *     element when the view becomes active. Responsible for building
 *     the view DOM and binding events.
 * @property {Function} [unmount] - Optional cleanup function called when
 *     the view is deactivated. Should remove event listeners and cancel
 *     any pending work.
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
 * @param {ViewDescriptor} view - The view descriptor to register.
 * @throws {Error} If the view is missing required fields.
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

    // Ensure no duplicate IDs are registered.
    if (views.some((existing) => existing.id === view.id)) {
        throw new Error(`registerView: View with id "${view.id}" is already registered`);
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