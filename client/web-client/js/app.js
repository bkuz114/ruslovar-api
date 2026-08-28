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
 *   - Bind the language switcher controls.
 *
 * Language switching does NOT re-mount views. All [data-i18n] elements
 * update in place via core/i18n.js applyLanguage().
 *
 * Dependencies:
 *   - core/config.js
 *   - core/i18n.js
 *   - core/dom.js
 *   - core/view-registry.js
 *   - views/noun-single.js (self-registering)
 *   - views/noun-batch.js (self-registering)
 */

import {
    loadConfig
} from './core/config.js';
import {
    restoreLanguagePreference,
    getCurrentLanguage,
    setLanguage,
    applyLanguage,
    getString,
} from './core/i18n.js';
import {
    clearElement,
    createElement
} from './core/dom.js';
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
 * Boot the application.
 *
 * Called once when the module is loaded. Awaits configuration loading
 * (so API requests have the correct base URL), then restores language
 * and renders navigation.
 */
async function init() {
    cacheDomElements();

    // Configuration must be loaded before any view mounts, because
    // views may construct API URLs using the configured base URL.
    await loadConfig();

    // Restore the saved language preference before any view renders,
    // so all content appears in the correct language from the start.
    restoreLanguagePreference();

    bindLanguageSwitcher();
    renderNavigation();

    // Mount the first registered view by default.
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
        option.textContent = getString(view.labelKey, {viewId: view.id});
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
            option.textContent = getString(views[index].labelKey, {viewId: views[index].id});
        }
    });
}

/**
 * Mount a view by ID.
 *
 * Unmounts the currently active view (if any), then calls the new
 * view's mount function with the mount container element.
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

    // Call the view's mount function with the container. The view is
    // responsible for building its own DOM inside the container.
    view.mount(elements.viewMount);

    activeViewId = viewId;
}

/**
 * Unmount the currently active view, if any.
 */
function unmountActiveView() {
    if (!activeViewId) return;

    const view = getViewById(activeViewId);
    if (view && typeof view.unmount === 'function') {
        view.unmount();
    }

    activeViewId = null;
}

// Boot the application when the module is loaded.
init();
