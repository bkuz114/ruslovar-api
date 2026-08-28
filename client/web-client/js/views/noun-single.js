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
 *   - Support deep-linking via ?word= URL parameter.
 *
 * Language switching updates [data-i18n] elements in place; results
 * are not lost when the language changes.
 *
 * Dependencies:
 *   - core/i18n.js (getString)
 *   - core/api.js (fetchNounDeclensions)
 *   - core/dom.js (createElement, clearElement, loadStylesheet)
 *   - core/renderers.js (declension tables, metadata, tabs, raw JSON)
 *   - core/errors.js (ApiError)
 *   - core/view-registry.js (registerView)
 *   - css/views/noun-single.css (lazy-loaded on first mount)
 */

import {
    getString,
} from '../core/i18n.js';
import {
    fetchNounDeclensions
} from '../core/api.js';
import {
    createElement,
    clearElement,
    loadStylesheet
} from '../core/dom.js';
import {
    createMatchesContainer,
    createRawJsonToggle,
} from '../core/renderers.js';
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
 * @type {Object}
 */
let elements = {};

/**
 * Register the view with the application shell.
 */
registerView({
    id: VIEW_ID,
    labelKey: 'view_label',
    strings: VIEW_STRINGS,

    /**
     * Mount the view into the provided container.
     *
     * Builds the form and results area, binds events, and checks the
     * URL for a preload word parameter.
     *
     * @param {HTMLElement} container - The mount container element.
     */
    mount(container) {
        loadStylesheet('css/views/noun-single.css');
        buildDom(container);
        bindEvents();

        // Check URL for a word parameter and auto-submit if present.
        // This supports deep links like /?word=кролик.
        preloadWordFromUrl();
    },

    /**
     * Clean up the view when it is deactivated.
     *
     * Resets internal state. Event listeners are automatically discarded
     * when the DOM elements are removed from the document.
     */
    unmount() {
        elements = {};
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

    // Strict mode checkbox.
    const strictGroup = createElement('div', 'form-group form-group-inline');

    const strictCheckbox = document.createElement('input');
    strictCheckbox.type = 'checkbox';
    strictCheckbox.id = 'strict-mode';
    strictCheckbox.name = 'strict';

    const strictLabel = createElement('label', '', getString('strict_label'));
    strictLabel.setAttribute('for', 'strict-mode');
    strictLabel.setAttribute('data-i18n', 'strict_label');

    strictGroup.appendChild(strictCheckbox);
    strictGroup.appendChild(strictLabel);
    form.appendChild(strictGroup);

    // Submit button.
    const submitButton = createElement(
        'button',
        'submit-button',
        getString('submit_button')
    );
    submitButton.type = 'submit';
    submitButton.setAttribute('data-i18n', 'submit_button');

    form.appendChild(submitButton);
    container.appendChild(form);

    // --- Results area -------------------------------------------------
    const resultsArea = createElement('section', 'results-area');
    resultsArea.id = 'results-area';
    resultsArea.setAttribute('aria-live', 'polite');

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
    resultsArea.appendChild(placeholder);

    container.appendChild(resultsArea);

    // Cache references for later use.
    elements = {
        form,
        wordInput,
        strictCheckbox,
        submitButton,
        resultsArea,
    };
}

/**
 * Bind event listeners for this view.
 */
function bindEvents() {
    elements.form.addEventListener('submit', handleFormSubmit);
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

    const strict = elements.strictCheckbox.checked;

    clearResults();

    try {
        const data = await fetchNounDeclensions(word, strict);
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
 * Check the URL for a word parameter and auto-submit if present.
 *
 * Supports deep links like /?word=кролик.
 */
function preloadWordFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const word = params.get('word');

    if (word) {
        elements.wordInput.value = word;
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
 * Clear the results area and restore the placeholder message.
 */
function clearResults() {
    clearElement(elements.resultsArea);

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
    elements.resultsArea.appendChild(placeholder);
}

/**
 * Display an error message in the results area.
 *
 * @param {string} message - The error message to display.
 */
function showError(message) {
    clearElement(elements.resultsArea);

    const errorDiv = createElement('div', 'error-message', message);
    errorDiv.setAttribute('role', 'alert');

    elements.resultsArea.appendChild(errorDiv);
}