/**
 * Ruslovar API Demo — Application Shell
 *
 * Entry point for the demo application. Boots the core modules, renders
 * the view navigation, and manages the active view lifecycle.
 *
 * Responsibilities:
 *   - Import all view modules so they self-register with the view
 *     registry.
 *   - Load client configuration from config.json.
 *   - Restore the saved language preference from localStorage.
 *   - Render a dropdown for selecting among registered views.
 *   - Handle view switching (unmount old view, mount new view).
 *   - Preserve view state across mount/unmount cycles via the store.
 *   - Respect per-view request policies during unmount.
 *   - Bind the language switcher controls.
 *
 * Language switching does NOT re-mount views. All [data-i18n] elements
 * update in place via core/i18n.js applyLanguage().
 *
 * Dependencies:
 *   - core/config.js
 *   - core/i18n.js
 *   - core/dom/dom.js
 *   - core/store.js
 *   - core/data-layer/data-layer.js
 *   - core/view-registry.js
 *   - views/noun-single.js (self-registering)
 *   - views/noun-batch.js (self-registering)
 */

import {
    loadConfig,
    getConfig,
} from './core/config.js';
import {
    restoreLanguagePreference,
    getCurrentLanguage,
    setLanguage,
    applyLanguage,
    getString,
    I18N_VIEW_KEY,
} from './core/i18n.js';
import {
    clearElement,
    createElement
} from './core/dom/dom.js';
import {
    getState as getStoredState,
    setState as setStoredState,
    hasState as hasStoredState
} from './core/store.js';
import {
    createRequestContext,
    abortRequestsForView
} from './core/data-layer/data-layer.js';
import {
    getViews,
    getViewById
} from './core/view-registry.js';

// Import view modules. Each registers itself with the view registry
// via registerView() when this module is evaluated.
import './views/noun-single.js';
import './views/noun-batch.js';

/**
 * ID of the currently mounted view, or null if none is active.
 *
 * @type {string|null}
 */
let activeViewId = null;

/**
 * DOM element references for the shell.
 *
 * @type {Object}
 */
let elements = {};

/**
 * The base URL used for HTTP requests (retrieved from config.json
 * and read once during applicatino lifestyle)
 *
 * @type {string}
 */
let baseUrl = null;

/**
 * Boot the application.
 *
 * Called once when the module is loaded. Awaits configuration loading
 * (so API requests have the correct base URL), then restores language
 * and renders navigation.
 */
async function init() {
    cacheDomElements();

    // load config.json once during application lifecycle.
    // - After loadConfig() completes, getConfig() returns the resolved
    //   config object, which contains the user's specified base URL
    //   for making API requests.
    // - Save that base URL so it can be passed to the data layer
    //   when creating the context object for views to use for
    //   making HTTP requests.
    await loadConfig();
    baseUrl = getConfig().api_base_url;

    if (!baseUrl || typeof baseUrl !== 'string') {
        throw new Error(
            `app.js: Failed to initialize apiBaseUrl. ` +
            `Expected getConfig().api_base_url to be a non-empty string. ` +
            `Received: ${JSON.stringify(apiBaseUrl)}. ` +
            `Check config.json and DEFAULT_CONFIG in core/config.js.`
        );
    }

    // Restore the saved language preference before any view renders,
    // so all content appears in the correct language from the start.
    restoreLanguagePreference();

    bindLanguageSwitcher();
    renderNavigation();

    // Mount the first registered view by default.
    // Do BEFORE applyLanguage, as mounting view will
    // make i18n aware of what's the current view so
    // it can render view-specific elements.
    const views = getViews();
    if (views.length > 0) {
        mountView(views[0].id);
    }

    // Apply the current language to all [data-i18n] elements after the
    // initial view mount. Does NOT touch localStorage; we only want to
    // display the restored language, not overwrite the saved preference.
    applyLanguage(getCurrentLanguage());
}

/**
 * Cache references to shell DOM elements.
 */
function cacheDomElements() {
    elements = {
        viewNav: document.getElementById('view-nav'),
        viewMount: document.getElementById('view-mount'),
        langRu: document.getElementById('lang-ru'),
        langEn: document.getElementById('lang-en'),
    };
}

/**
 * Bind click handlers to the language switcher buttons.
 */
function bindLanguageSwitcher() {
    elements.langRu.addEventListener('click', () => {
        setLanguage('ru');
        updateLanguageSwitcherState();
        updateNavigationLabels();
    });

    elements.langEn.addEventListener('click', () => {
        setLanguage('en');
        updateLanguageSwitcherState();
        updateNavigationLabels();
    });

    // Sync active state on initial load.
    updateLanguageSwitcherState();
}

/**
 * Update the visual state of language buttons to reflect the current
 * language.
 */
function updateLanguageSwitcherState() {
    const lang = getCurrentLanguage();

    elements.langRu.classList.toggle('active', lang === 'ru');
    elements.langRu.setAttribute('aria-pressed', String(lang === 'ru'));

    elements.langEn.classList.toggle('active', lang === 'en');
    elements.langEn.setAttribute('aria-pressed', String(lang === 'en'));
}

/**
 * Render a dropdown for selecting among registered views.
 *
 * The dropdown scales to any number of views, unlike a fixed button
 * pair. Option labels are resolved from each view's own strings via
 * the view registry.
 */
function renderNavigation() {
    const views = getViews();

    const select = document.createElement('select');
    select.id = 'view-select';
    select.className = 'view-select';
    select.setAttribute('aria-label', 'Select demo');

    views.forEach((view) => {
        const option = document.createElement('option');
        option.value = view.id;
        option.textContent = getString(view.labelKey, {
            viewId: view.id
        });
        select.appendChild(option);
    });

    select.addEventListener('change', (event) => {
        mountView(event.target.value);
    });

    elements.viewNav.appendChild(select);

    // Store reference for language updates.
    elements.viewSelect = select;
}

/**
 * Update dropdown option labels when the language changes.
 *
 * <option> elements are not reliably targeted by document.querySelectorAll
 * with [data-i18n] across browsers, so we update them directly.
 */
function updateNavigationLabels() {
    if (!elements.viewSelect) return;

    const views = getViews();
    const options = elements.viewSelect.querySelectorAll('option');

    options.forEach((option, index) => {
        if (views[index]) {
            option.textContent = getString(views[index].labelKey, {
                viewId: views[index].id
            });
        }
    });
}

/**
 * Mount a view by ID.
 *
 * Unmounts the currently active view (if any), capturing its state via
 * getState() before unmount. Then passes the new view's saved state
 * (if any) to its mount function via the context object.
 *
 * Error handling: if any step fails (state capture, unmount, mount),
 * the error is logged and the application continues. A failed mount
 * renders a fallback error message in the mount container so the user
 * is not left with a blank screen.
 *
 * @param {string} viewId - ID of the view to mount.
 */
function mountView(viewId) {
    const view = getViewById(viewId);
    if (!view) {
        console.warn(`mountView: No view registered with id "${viewId}"`);
        return;
    }

    // Unmount the current view first, if one is active.
    if (activeViewId) {
        unmountActiveView();
    }

    // Clear the mount container of any leftover DOM.
    clearElement(elements.viewMount);

    // Build the request context for this view.
    //
    // The request context binds the view's identity and request policy
    // to every API call made through it. This is how the data layer
    // knows which view initiated a request, which in turn enables
    // per-view abort behavior during unmount.
    //
    // The view registry is the source of truth for the request policy.
    // If a view did not declare one, the view registry should have
    // assigned it a fallback of 'survive-unmount', meaning requests
    // continue after the view is unmounted and their results are cached.
    const requestContext = createRequestContext(
        viewId,
        view.requestPolicy,
        baseUrl
    );

    // Build the mount context. The context contains everything a view
    // needs to mount and restore itself:
    //
    //   - state:        Saved state from a previous mount, or undefined.
    //   - urlParams:    Current URL query parameters for deep-link support.
    //   - isFirstMount: True if no saved state exists for this view.
    //   - requestContext: Pre-bound API methods for this view's identity
    //                    and request policy (will allow view to make HTTP
    //                    requests and have them monitored by the data layer).
    const savedState = getStoredState(viewId);
    const context = {
        state: savedState,
        urlParams: new URLSearchParams(window.location.search),
        isFirstMount: !hasStoredState(viewId),
        requestContext
    };

    // set data-i18n-view on the view mount container
    // (container that the view will get loaded into)
    // so that i18n will be view-aware when applying language
    // after the mount
    elements.viewMount.setAttribute(I18N_VIEW_KEY, viewId);

    // Mount the new view. The view is responsible for building its own
    // DOM inside the container and restoring its state if context.state
    // is present.
    try {
        const result = view.mount(elements.viewMount, context);

        // If the view's mount function returns a Promise (async mount),
        // catch any rejection and render the error fallback. This
        // prevents an async mount failure from leaving the user with
        // a blank screen.
        if (result && typeof result.catch === 'function') {
            result.catch((error) => {
                console.error(`mountView: View "${viewId}" mount failed asynchronously:`, error);
                renderErrorFallback(elements.viewMount, error);
            });
        }
    } catch (error) {
        // Synchronous mount failure. Log and render the error fallback
        // so the user sees a message rather than a blank screen.
        console.error(`mountView: View "${viewId}" mount failed:`, error);
        renderErrorFallback(elements.viewMount, error);
    }

    activeViewId = viewId;
}

/**
 * Unmount the currently active view, if any.
 *
 * Captures the view's state via getState() before unmounting, stores it
 * in the state store, and respects the view's request policy. If the
 * view has `abort-on-unmount` policy, all in-flight requests for the
 * view are aborted.
 *
 * Error handling: if getState() or unmount() throws, the error is
 * logged and the unmount proceeds. State may be lost for the view, but
 * the application continues to function.
 */
function unmountActiveView() {
    // Defensive: this function should only be called when a view is active.
    // If activeViewId is missing, something called us in the wrong state
    // (e.g., before initial mount). Warn instead of failing silently.
    if (!activeViewId) {
        console.warn('unmountActiveView: Called with no active view');
        return;
    }

    // Defensive: activeViewId should always reference a registered view,
    // because mountView() only sets it after a successful registry lookup.
    // If it doesn't, state may have been corrupted or a view was unregistered.
    const view = getViewById(activeViewId);
    if (!view) {
        console.warn(`unmountActiveView: No view registered with id "${activeViewId}"`);
        return;
    }

    // Capture the view's state before unmounting. getState() is
    // optional (static informational views may not implement it), but
    // for views with user-modifiable state, it should be present.
    if (typeof view.getState === 'function') {
        try {
            const state = view.getState();
            if (state !== undefined) {
                setStoredState(activeViewId, state);
            }
        } catch (error) {
            console.error(`unmountActiveView: getState() failed for view "${activeViewId}":`, error);
        }
    }

    // Respect the view's request policy. If the view declares
    // abort-on-unmount, abort all in-flight requests associated with
    // the view. This prevents expensive requests from continuing when
    // the user has navigated away.
    if (view.requestPolicy === 'abort-on-unmount') {
        try {
            abortRequestsForView(activeViewId);
        } catch (error) {
            console.error(`unmountActiveView: abortRequestsForView failed for view "${activeViewId}":`, error);
        }
    }

    // Call the view's unmount function if it provides one. The unmount
    // function is responsible for cleanup (event listeners, timers,
    // etc.). State preservation is already handled above via getState().
    if (typeof view.unmount === 'function') {
        try {
            view.unmount();
        } catch (error) {
            console.error(`unmountActiveView: unmount() failed for view "${activeViewId}":`, error);
        }
    }

    // clear existing i18n-view data attribute on mount container
    // (a new mount will override it, but keep here for defensiveness)
    elements.viewMount.removeAttribute(I18N_VIEW_KEY);

    activeViewId = null;
}

/**
 * Render a fallback error message in the mount container.
 *
 * Called when a view's mount function throws synchronously or rejects
 * asynchronously. Prevents a broken view from bricking the entire
 * application by showing a clear error message and keeping the shell
 * functional.
 *
 * @param {HTMLElement} container - The mount container element.
 * @param {Error} error - The error that caused the mount failure.
 */
function renderErrorFallback(container, error) {
    clearElement(container);

    const errorDiv = createElement('div', {
        class: 'view-error-fallback',
        attrs: {
            role: 'alert',
        },
    });

    const heading = createElement('h2', {
        class: 'view-error-heading',
        text: getString('error_view_failed'),
        i18n: {
            "data-i18n": 'error_view_failed',
        },
    });

    const message = createElement('p', {
        class: 'view-error-message',
        text: error.message || getString('error_unknown'),
        i18n: {
            "data-i18n": error.message ? null : 'error_unknown',
        },
    });

    const hint = createElement('p', {
        class: 'view-error-hint',
        text: getString('error_view_failed_hint'),
        i18n: {
            "data-i18n": 'error_view_failed_hint',
        },
    });

    errorDiv.appendChild(heading);
    errorDiv.appendChild(message);
    errorDiv.appendChild(hint);
    container.appendChild(errorDiv);
}

// Boot the application when the module is loaded.
init();