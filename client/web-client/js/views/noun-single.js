/**
 * Ruslovar API Demo — Single Noun Lookup View
 *
 * Provides a form-based interface for looking up declensions for a
 * single Russian noun. Registered as a view with the application shell.
 *
 * Responsibilities:
 *   - Build and manage the single-lookup form DOM.
 *   - Handle form submission and API requests.
 *   - Render results (metadata, declension tables, match tabs, raw JSON).
 *   - Preserve view state across mount/unmount cycles.
 *   - Support deep-linking via ?word= URL parameter.
 *
 * State preservation:
 *   The view implements getState() and restores from context.state in
 *   mount(). The state shape is:
 *     {
 *       version: 1,
 *       input: string,          // Current word input value
 *       strict: boolean,        // Strict mode checkbox state
 *       results: Object|null,   // Most recent API response, or null
 *       scrollTop: number       // Results area scroll position
 *     }
 *
 *   The shell captures getState() before unmount and passes the saved
 *   state to mount() via context.state on subsequent mounts. The view
 *   validates the state version before restoring.
 *
 * Language switching updates [data-i18n] elements in place; results
 * are not lost when the language changes.
 *
 * Dependencies:
 *   - core/i18n.js (getString)
 *   - core/dom/dom.js (createElement, clearElement, loadStylesheet)
 *   - core/dom/renderers.js (declension tables, metadata, tabs, raw JSON)
 *   - core/errors.js (ApiError)
 *   - core/view-registry.js (registerView)
 *   - css/views/noun-single.css (lazy-loaded on first mount)
 */

import {
    getString,
} from '../core/i18n.js';
import {
    createElement,
    clearElement,
    loadStylesheet
} from '../core/dom/dom.js';
import {
    createMatchesContainer,
    createRawJsonToggle,
    createSubmitControls,
} from '../core/dom/renderers.js';
import {
    ApiError
} from '../core/errors.js';
import {
    registerView
} from '../core/view-registry.js';

/**
 * Unique identifier for this view. Used by the view registry and i18n.
 */
const VIEW_ID = 'noun-single';

/**
 * Request context for this view.
 *
 * Supplied by the shell during mount(). Provides pre-bound API methods
 * that automatically carry this view's identity and request policy.
 *
 * The data layer (data-layer.js) owns HTTP request lifecycles: it caches
 * responses, deduplicates in-flight requests, and can abort requests when a view
 * is unmounted. To do that, it needs to know which view initiated each
 * request. This object will have that information bound to it, along with
 * conveenience functions for querying the backend, so that the view can call
 * them and not need to pass its own ID or policy at call time.
 *
 * @type {Object|null}
 */
let requestContext = null;

/**
 * State schema version for this view.
 *
 * Increment this when the state shape changes. The view validates the
 * version on restore and discards state if the version is unsupported.
 *
 * @type {number}
 */
const STATE_VERSION = 1;

/**
 * View-specific strings for the single noun lookup demo.
 *
 * Attached to the view descriptor so the i18n module can resolve them
 * via the view registry. Shared strings (case labels, gender values,
 * headings, etc.) live in core/i18n.js and are accessed via
 * getSharedString().
 */
const VIEW_STRINGS = {
    ru: {
        view_label: 'Одно слово',
        word_label: 'Существительное',
        word_placeholder: 'Например: кролик',
        results_placeholder: 'Введите слово, чтобы увидеть склонения.',
        error_not_found: 'Слово не найдено в словаре.',
        error_strict: 'Слово не в словарной форме.',
    },
    en: {
        view_label: 'Single Word',
        word_label: 'Noun',
        word_placeholder: 'e.g. кролик',
        results_placeholder: 'Enter a word to see declensions.',
        error_not_found: 'Word not found in dictionary.',
        error_strict: 'Word is not in dictionary form.',
    },
};

/**
 * DOM element references for this view.
 *
 * Populated during buildDom() and reset during unmount(). These are
 * ephemeral references to the view's rendered DOM, not persistent state.
 *
 * @type {Object}
 */
let elements = {};

/**
 * The most recent API response for this view.
 *
 * Retained so getState() can include results without having to
 * reconstruct them from the DOM. Set when renderResults() is called.
 * Cleared when clearResults() or showError() is called.
 *
 * The DOM is a projection of this data, not the source of truth.
 * Keeping a direct reference to the API response is simpler and more
 * reliable than serializing the rendered DOM back into an object.
 *
 * @type {Object|null}
 */
let lastResults = null;

/**
 * Register the view with the application shell.
 */
registerView({
    id: VIEW_ID,
    labelKey: 'view_label',
    strings: VIEW_STRINGS,
    requestPolicy: 'survive-unmount',

    /**
     * Mount the view into the provided container.
     *
     * Builds the form and results area, binds events, and restores
     * state if context.state is present and valid. If no state exists
     * but the URL has a ?word= parameter, preloads from the URL.
     *
     * @param {HTMLElement} container - The mount container element.
     * @param {Object} context - Mount context from the shell.
     * @param {Object|undefined} context.state - Saved state from a
     *     previous mount, or undefined if this is the first mount.
     * @param {URLSearchParams} context.urlParams - Current URL query
     *     parameters, for deep-link support.
     * @param {boolean} context.isFirstMount - True if no saved state
     *     exists for this view.
     */
    mount(container, context) {
        loadStylesheet('css/views/noun-single.css');
        buildDom(container);
        bindEvents();

        // Store the request context to be used for making HTTP requests
        // (this will pass the view's info to the data layer so that it
        // can handle aborting or allowing them to continue during navigation)
        if (!context.requestContext) {
            throw new Error(
                `noun-single: mount() received a malformed context. ` +
                `Expected context.requestContext to be a request context object ` +
                `created by the shell via createRequestContext(). ` +
                `Received: ${context.requestContext === undefined ? 'undefined' : 'null'}.`
            );
        }
        requestContext = context.requestContext;

        // Restore state if present and valid. Otherwise, check the URL
        // for a word parameter to support deep links like /?word=кролик.
        if (context.state && context.state.version === STATE_VERSION) {
            restoreFromState(context.state);
        } else if (context.urlParams && context.urlParams.has('word')) {
            preloadWordFromUrl(context.urlParams.get('word'));
        }
    },

    /**
     * Clean up the view when it is deactivated.
     *
     * Resets DOM references and module state. The shell captures state
     * via getState() before calling unmount(), so any state the view
     * wants to preserve must be returned by getState().
     *
     * Event listeners are automatically discarded when the DOM elements
     * are removed from the document.
     */
    unmount() {
        elements = {};
        lastResults = null;
        requestContext = null;
    },

    /**
     * Capture the current state of the view.
     *
     * Returns a plain, JSON-serializable object representing everything
     * needed to reconstruct the view's current UI state. Called by the
     * shell before unmount.
     *
     * @returns {Object} State snapshot.
     */
    getState() {
        return {
            version: STATE_VERSION,
            input: elements.wordInput ? elements.wordInput.value : '',
            strict: elements.submitControls ? elements.submitControls.isStrictMode() : false,
            results: lastResults,
            scrollTop: elements.resultsArea ? elements.resultsArea.scrollTop : 0,
        };
    },
});

/**
 * Build the view DOM inside the mount container.
 *
 * @param {HTMLElement} container - The mount container element.
 */
function buildDom(container) {
    clearElement(container);

    // --- Form ---------------------------------------------------------
    const form = createElement('form', 'lookup-form');
    form.setAttribute('novalidate', '');

    // Word input field.
    const wordGroup = createElement('div', 'form-group');

    const wordLabel = createElement('label', '', getString('word_label', {
        viewId: VIEW_ID
    }));
    wordLabel.setAttribute('for', 'word-input');
    wordLabel.setAttribute('data-i18n', 'word_label');
    wordLabel.setAttribute('data-i18n-view', VIEW_ID);

    const wordInput = document.createElement('input');
    wordInput.type = 'text';
    wordInput.id = 'word-input';
    wordInput.name = 'word';
    wordInput.placeholder = getString('word_placeholder', {
        viewId: VIEW_ID
    });
    wordInput.setAttribute('data-i18n-placeholder', 'word_placeholder');
    wordInput.setAttribute('data-i18n-view', VIEW_ID);
    wordInput.autocomplete = 'off';
    wordInput.required = true;

    wordGroup.appendChild(wordLabel);
    wordGroup.appendChild(wordInput);
    form.appendChild(wordGroup);

    // Submit control (submit button + Strict mode checkbox)
    const submitControls = createSubmitControls({
        disable: true
    });
    form.appendChild(submitControls.element);

    container.appendChild(form);

    // --- Results area -------------------------------------------------
    const resultsArea = createElement('section', 'results-area');
    resultsArea.id = 'results-area';
    resultsArea.setAttribute('aria-live', 'polite');

    const placeholder = createResultsPlaceholder();
    resultsArea.appendChild(placeholder);

    container.appendChild(resultsArea);

    // Cache references for later use.
    elements = {
        form,
        wordInput,
        submitControls,
        resultsArea,
    };
}

/**
 * Bind event listeners for this view.
 */
function bindEvents() {
    elements.form.addEventListener('submit', handleFormSubmit);
    // enable or disable submit button based on if text in textfield
    elements.wordInput.addEventListener('input', () => {
        const isEmpty = elements.wordInput.value.trim() === '';
        elements.submitControls.submitButton.disabled = isEmpty;
    });
}

/**
 * Handle form submission: send API request and render results.
 *
 * @param {Event} event - The submit event.
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const word = elements.wordInput.value.trim();
    if (!word) return;

    const strict = elements.submitControls.isStrictMode();

    clearResults();

    try {
        // use this view's saved requestContext to make
        // the HTTP request to the backend. This requestContext
        // object comes from the data layer; it has the view's
        // info attached so the data layer can track who sent
        // this request and manage it (e.g. abort it on unmount
        // or allow it to continue -- whatever the view registesred)
        const data = await requestContext.fetchNounDeclensions(word, strict);
        lastResults = data;
        renderResults(data);
    } catch (error) {
        console.error('Error during noun lookup:', error);
        showError(getErrorMessage(error));
    }
}

/**
 * Map an error to a user-facing message.
 *
 * The API returns 404 for both "not found" and "not in dictionary form"
 * (strict mode). We inspect the detail message to distinguish them.
 *
 * @param {Error} error - The thrown error.
 * @returns {string} Localized error message.
 */
function getErrorMessage(error) {
    if (error instanceof ApiError) {
        if (error.status === 404 && error.message.includes('dictionary form')) {
            return getString('error_strict', {
                viewId: VIEW_ID
            });
        }

        if (error.status === 404) {
            return getString('error_not_found', {
                viewId: VIEW_ID
            });
        }

        return getString('error_unknown');
    }

    return getString('error_network');
}

/**
 * Restore the view from a saved state snapshot.
 *
 * Populates the form input, strict mode checkbox, and results area
 * from the state object. Scroll position is restored after layout
 * using requestAnimationFrame.
 *
 * @param {Object} state - Saved state from a previous mount.
 */
function restoreFromState(state) {
    // Restore form input. Use empty string as fallback for robustness.
    elements.wordInput.value = state.input || '';

    // Restore strict mode checkbox. Default to false if missing.
    if (elements.submitControls && typeof elements.submitControls.setStrictMode === 'function') {
        elements.submitControls.setStrictMode(Boolean(state.strict));
    }

    // Restore results if present.
    if (state.results) {
        lastResults = state.results;
        renderResults(state.results);
    }

    // Restore scroll position after the DOM has been laid out.
    // requestAnimationFrame ensures the browser has calculated layout
    // before we set scrollTop. Without this, scrollTop may be reset
    // to 0 by the browser after layout completes.
    if (state.scrollTop && state.scrollTop > 0) {
        requestAnimationFrame(() => {
            if (elements.resultsArea) {
                elements.resultsArea.scrollTop = state.scrollTop;
            }
        });
    }

    // Update submit button state based on restored input.
    const isEmpty = elements.wordInput.value.trim() === '';
    elements.submitControls.submitButton.disabled = isEmpty;
}

/**
 * Check the URL for a word parameter and auto-submit if present.
 *
 * Supports deep links like /?word=кролик.
 *
 * @param {string} word - The word from the URL parameter.
 */
function preloadWordFromUrl(word) {
    if (word) {
        elements.wordInput.value = word;
        elements.submitControls.submitButton.disabled = false;
        elements.form.requestSubmit();
    }
}

/**
 * Render the API response into the results area.
 *
 * Handles multiple matches with a tab bar. Each match gets metadata
 * and declension tables. A raw JSON toggle is appended at the end.
 *
 * @param {Object} data - Parsed API response (NounLookupResponse).
 */
function renderResults(data) {
    clearElement(elements.resultsArea);
    elements.resultsArea.appendChild(
        createMatchesContainer(data, {
            layout: 'tabs'
        })
    );
    elements.resultsArea.appendChild(
        createRawJsonToggle(data)
    );
}

/**
 * Create the results placeholder element.
 *
 * This element is displayed in the results area whenever there are no
 * results to show. It provides the user with a hint about what action
 * to take (e.g., "Enter a word to see declensions") and is replaced
 * when results are rendered or when an error occurs.
 *
 * @returns {HTMLElement} The placeholder paragraph element.
 */
function createResultsPlaceholder() {
    const placeholder = createElement(
        'p',
        'results-placeholder',
        getString('results_placeholder', {
            viewId: VIEW_ID
        })
    );
    placeholder.id = 'results-placeholder';
    placeholder.setAttribute('data-i18n', 'results_placeholder');
    placeholder.setAttribute('data-i18n-view', VIEW_ID);
    return placeholder;
}

/**
 * Clear the results area and restore the placeholder message.
 *
 * Also clears lastResults so getState() does not return stale results
 * for a view that has been reset.
 */
function clearResults() {
    clearElement(elements.resultsArea);
    lastResults = null;
    const placeholder = createResultsPlaceholder();
    elements.resultsArea.appendChild(placeholder);
}

/**
 * Display an error message in the results area.
 *
 * Also clears lastResults so getState() does not return stale results
 * after an error.
 *
 * @param {string} message - The error message to display.
 */
function showError(message) {
    clearElement(elements.resultsArea);
    lastResults = null;

    const errorDiv = createElement('div', 'error-message', message);
    errorDiv.setAttribute('role', 'alert');

    elements.resultsArea.appendChild(errorDiv);
}