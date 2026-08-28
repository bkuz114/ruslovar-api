/**
 * Ruslovar API Demo — Batch Noun Lookup View
 *
 * Provides a file-upload interface for looking up declensions for
 * multiple Russian nouns in a single request. Registered as a view
 * with the application shell.
 *
 * Input file format:
 *   - One word per line.
 *   - Lines starting with # define category names.
 *   - Blank lines are ignored.
 *   - Words before the first category header are grouped under a
 *     localized "Uncategorized" label.
 *
 * Responsibilities:
 *   - Build and manage the batch lookup form DOM.
 *   - Parse plain-text word list files.
 *   - Send a single POST request to /api/v1/nouns/batch.
 *   - Render results grouped by category with collapsible word panels.
 *   - Display per-word success/error status.
 *
 * Language switching updates [data-i18n] elements in place; results
 * are not lost when the language changes.
 *
 * Future feature: user-configurable display filters (e.g., show only
 * singular or plural forms). The renderMatch function is structured so
 * that filter options can be added as an additional parameter without
 * restructuring the view.
 *
 * Dependencies:
 *   - core/i18n.js (getString)
 *   - core/api.js (fetchNounBatch)
 *   - core/dom.js (createElement, clearElement, loadStylesheet)
 *   - core/renderers.js (declension tables, metadata)
 *   - core/errors.js (ApiError)
 *   - core/view-registry.js (registerView)
 *   - css/views/noun-batch.css (lazy-loaded on first mount)
 */

import {
    getString,
} from '../core/i18n.js';
import {
    fetchNounBatch
} from '../core/api.js';
import {
    createElement,
    clearElement,
    loadStylesheet
} from '../core/dom.js';
import {
    createMatchesContainer,
    createSubmitControls,
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
const VIEW_ID = 'noun-batch';

/**
 * View-specific strings for the batch noun lookup demo.
 *
 * Attached to the view descriptor so the i18n module can resolve them
 * via the view registry. Shared strings (case labels, gender values,
 * headings, etc.) live in core/i18n.js and are accessed via
 * getSharedString().
 */
const VIEW_STRINGS = {
    ru: {
        view_label: 'Пакетный запрос',
        file_label: 'Файл со словами',
        file_format_hint: 'Одно слово в строке. Категории начинаются с #.',
        results_placeholder: 'Загрузите файл и нажмите кнопку.',
        file_summary: 'Загружено категорий: {categories}, слов: {words}.',
        uncategorized: 'Без категории',
        error_no_file: 'Файл не выбран.',
        error_empty_file: 'Файл не содержит слов.',
    },
    en: {
        view_label: 'Batch Lookup',
        file_label: 'Word list file',
        file_format_hint: 'One word per line. Categories start with #.',
        results_placeholder: 'Load a file and click the button.',
        file_summary: 'Loaded categories: {categories}, words: {words}.',
        uncategorized: 'Uncategorized',
        error_no_file: 'No file selected.',
        error_empty_file: 'File contains no words.',
    },
};

/**
 * DOM element references for this view.
 *
 * @type {Object}
 */
let elements = {};

/**
 * Stores the parsed categories from the most recent file selection.
 * Retained so the submit handler can use the already-parsed data
 * without re-reading the file.
 *
 * @type {Array<{name: string, words: string[]}>|null}
 */
let parsedCategories = null;

/**
 * Stores the raw text content of the selected file.
 *
 * @type {string|null}
 */
let selectedFileText = null;

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
     * Builds the file input, strict mode checkbox, submit button, and
     * results area. Binds event listeners.
     *
     * @param {HTMLElement} container - The mount container element.
     */
    mount(container) {
        loadStylesheet('css/views/noun-batch.css');
        buildDom(container);
        bindEvents();
    },

    /**
     * Clean up the view when it is deactivated.
     *
     * Resets internal state. Event listeners are automatically discarded
     * when the DOM elements are removed from the document.
     */
    unmount() {
        elements = {};
        parsedCategories = null;
        selectedFileText = null;
    },
});

/**
 * Build the view DOM inside the mount container.
 *
 * @param {HTMLElement} container - The mount container element.
 */
function buildDom(container) {
    clearElement(container);

    // --- Batch controls ------------------------------------------------
    const controls = createElement('section', 'batch-controls');
    controls.setAttribute('aria-label', getString('file_label', {
        viewId: VIEW_ID
    }));

    // File input group.
    const fileGroup = createElement('div', 'file-input-group');

    const fileLabel = createElement('label', '', getString('file_label', {
        viewId: VIEW_ID
    }));
    fileLabel.setAttribute('for', 'file-input');
    fileLabel.setAttribute('data-i18n', 'file_label');
    fileLabel.setAttribute('data-i18n-view', VIEW_ID);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-input';
    fileInput.accept = '.txt,text/plain';

    const formatHint = createElement(
        'p',
        'file-format-hint',
        getString('file_format_hint', {
            viewId: VIEW_ID
        })
    );
    formatHint.setAttribute('data-i18n', 'file_format_hint');
    formatHint.setAttribute('data-i18n-view', VIEW_ID);

    fileGroup.appendChild(fileLabel);
    fileGroup.appendChild(fileInput);
    fileGroup.appendChild(formatHint);
    controls.appendChild(fileGroup);

    // Submit controls (submit button + strict checkbox)
    const submitControls = createSubmitControls({
        submitType: 'button',
    });
    submitControls.submitButton.id = 'submit-button';
    submitControls.submitButton.disabled = true;
    controls.appendChild(submitControls.element);

    container.appendChild(controls);

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
        fileInput,
        submitControls,
        resultsArea,
    };
}

/**
 * Bind event listeners for this view.
 */
function bindEvents() {
    elements.fileInput.addEventListener('change', handleFileSelection);
    elements.submitControls.submitButton.addEventListener('click', handleBatchSubmit);
}

/**
 * Handle file selection.
 *
 * Reads the selected file, parses it, stores the parsed data, and
 * displays a lightweight summary in the results area. Does not send
 * the API request; that happens when the user clicks the submit button.
 *
 * @param {Event} event - The change event from the file input.
 */
function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) {
        elements.submitControls.submitButton.disabled = true;
        return;
    }

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
        selectedFileText = loadEvent.target.result;
        parsedCategories = parseWordFile(selectedFileText);

        // Enable the submit button only if there are words to look up.
        const totalWords = parsedCategories.reduce(
            (sum, category) => sum + category.words.length,
            0
        );
        elements.submitControls.submitButton.disabled = totalWords === 0;

        showFileSummary(parsedCategories, totalWords);
    };

    reader.readAsText(file);
}

/**
 * Parse a plain text file of words into categories.
 *
 * Expected format:
 *   - One word per line.
 *   - Lines starting with # define category names.
 *   - Blank lines are ignored.
 *   - Words before the first category header are grouped under the
 *     localized "Uncategorized" label.
 *
 * @param {string} text - Raw file contents.
 * @returns {Array<{name: string, words: string[]}>} Parsed categories.
 */
function parseWordFile(text) {
    const categories = [];
    let currentCategory = null;

    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip blank lines.
        if (!trimmed) continue;

        // Category header.
        if (trimmed.startsWith('#')) {
            const name = trimmed.slice(1).trim();
            currentCategory = {
                name,
                words: []
            };
            categories.push(currentCategory);
            continue;
        }

        // First word appears before any category header.
        if (!currentCategory) {
            currentCategory = {
                name: getString('uncategorized', {
                    viewId: VIEW_ID
                }),
                words: [],
            };
            categories.push(currentCategory);
        }

        currentCategory.words.push(trimmed);
    }

    return categories;
}

/**
 * Display a lightweight summary of the parsed file.
 *
 * Shows the number of categories and total words loaded. This gives
 * the user confirmation that the file was parsed without creating
 * result-like DOM structures.
 *
 * @param {Array<{name: string, words: string[]}>} categories - Parsed categories.
 * @param {number} totalWords - Total number of words across all categories.
 */
function showFileSummary(categories, totalWords) {
    clearElement(elements.resultsArea);

    if (totalWords === 0) {
        const errorDiv = createElement(
            'div',
            'error-message',
            getString('error_empty_file', {
                viewId: VIEW_ID
            })
        );
        errorDiv.setAttribute('role', 'alert');
        elements.resultsArea.appendChild(errorDiv);
        return;
    }

    const summaryText = getString('file_summary', {
            viewId: VIEW_ID
        })
        .replace('{categories}', categories.length)
        .replace('{words}', totalWords);

    const summary = createElement('p', 'file-summary', summaryText);
    elements.resultsArea.appendChild(summary);
}

/**
 * Handle batch submission.
 *
 * Reads the already-parsed categories, flattens them into a single
 * word list, sends one batch request, and renders the results grouped
 * by category.
 */
async function handleBatchSubmit() {
    if (!selectedFileText || !parsedCategories) {
        showError(getString('error_no_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    // Flatten category structure into one word list for the API request.
    const allWords = parsedCategories.flatMap((category) => category.words);

    if (allWords.length === 0) {
        showError(getString('error_empty_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    elements.submitControls.submitButton.disabled = true;

    try {
        const data = await fetchNounBatch(allWords, elements.submitControls.isStrictMode());
        renderBatchResults(parsedCategories, data.results);
    } catch (error) {
        console.error('Batch request failed:', error);
        showError(getErrorMessage(error));
    } finally {
        elements.submitControls.submitButton.disabled = false;
    }
}

/**
 * Map an error to a user-facing message.
 *
 * @param {Error} error - The thrown error.
 * @returns {string} Localized error message.
 */
function getErrorMessage(error) {
    if (error instanceof ApiError) {
        return getString('error_unknown');
    }

    return getString('error_network');
}

/**
 * Render batch results grouped by category.
 *
 * Uses the original category structure from the parsed file and maps
 * API results back to their words. Each word is displayed inside a
 * collapsible <details> panel.
 *
 * @param {Array<{name: string, words: string[]}>} categories - Parsed categories.
 * @param {Array<Object>} results - Response items from the batch API.
 */
function renderBatchResults(categories, results) {
    clearElement(elements.resultsArea);

    // Map words to their result items for fast lookup.
    const resultMap = new Map();
    results.forEach((item) => {
        resultMap.set(item.word, item);
    });

    categories.forEach((category) => {
        const section = createCategorySection(category);

        category.words.forEach((word) => {
            const item = resultMap.get(word);
            const details = createWordDetails(word, item);
            section.appendChild(details);
        });

        elements.resultsArea.appendChild(section);
    });
}

/**
 * Create a category section element.
 *
 * @param {{name: string, words: string[]}} category - Category data.
 * @returns {HTMLElement} The category section element.
 */
function createCategorySection(category) {
    const section = createElement('section', 'category-section');

    const heading = createElement('h2', 'category-heading', category.name);
    section.appendChild(heading);

    return section;
}

/**
 * Create a collapsible details panel for a single word.
 *
 * @param {string} word - The word being displayed.
 * @param {Object|undefined} item - API result item for this word, if any.
 * @returns {HTMLElement} The word details element.
 */
function createWordDetails(word, item) {
    const details = createElement('details', 'word-details');

    // Summary row: word plus a status badge.
    const summary = createElement('summary');

    const success = item && item.status === 'success';
    const error = item && item.status === 'error';

    // Group word and optional match count in a single flex item.
    const wordGroup = createElement('span', 'word-group', word);

    // If the word resolves to multiple dictionary roots, show a count
    // so the user knows before expanding the panel.
    if (success && item.result.matches.length > 1) {
        const matchCount = createElement(
            'span',
            'match-count',
            `(${item.result.matches.length})`
        );
        wordGroup.appendChild(matchCount);
    }
    summary.appendChild(wordGroup);

    // Badge to display success of this sub-request
    const status = createElement('span', 'status-badge');

    if (success) {
        status.setAttribute('data-i18n', 'status_success');
        status.textContent = getString('status_success');
        status.classList.add('status-success');
    } else {
        status.setAttribute('data-i18n', 'status_error');
        status.textContent = getString('status_error');
        status.classList.add('status-error');
    }

    summary.appendChild(status);
    details.appendChild(summary);

    // Body of the panel depends on whether the word succeeded.
    if (success) {
        details.appendChild(
            createMatchesContainer(item.result, {
                layout: 'stacked'
            })
        );
    } else if (error) {
        const errorDiv = createElement(
            'div',
            'word-error',
            item.error || getString('error_unknown')
        );
        details.appendChild(errorDiv);
    } else {
        // No result item found for this word. This can happen if the
        // API response is missing an entry for a requested word.
        const errorDiv = createElement(
            'div',
            'word-error',
            getString('error_unknown')
        );
        details.appendChild(errorDiv);
    }

    return details;
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