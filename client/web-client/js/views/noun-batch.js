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
    parseWordList
} from '../core/wordlist-parser.js';
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
 * Stores the parsed word list document from the most recent file
 * selection. Retained so the submit handler can use the already-parsed
 * data without re-reading the file.
 *
 * This is set to the object returned by parseWordList(), with one
 * modification: the categories tree is flattened into a flat list.
 * Metadata is preserved as parsed.
 *
 * The resulting object has two keys:
 *   - metadata: {Object} Frontmatter key-value pairs.
 *   - categories: {Array<{name: string, words: string[]}>} Flat list
 *     of categories.
 *
 * @type {Object|null}
 */
let parsedDocument = null;

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
        parsedDocument = null;
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
        disable: true,
    });
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
        const parsed = parseWordList(selectedFileText);
        // Flatten the category tree once after parsing. The rest of the
        // view expects a flat list of categories; normalizing here avoids
        // repeated flattening at each call site.
        parsed.categories = flattenCategories(parsed.categories);
        // set global
        parsedDocument = parsed;
        const parsedCategories = parsed.categories;

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
    if (!selectedFileText || !parsedDocument) {
        showError(getString('error_no_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    // Flatten category structure into one word list for the API request.
    const allWords = parsedDocument.categories.flatMap((category) => category.words);

    if (allWords.length === 0) {
        showError(getString('error_empty_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    elements.submitControls.submitButton.disabled = true;

    try {
        const data = await fetchNounBatch(allWords, elements.submitControls.isStrictMode());
        renderBatchResults(parsedDocument.categories, parsedDocument.metadata, data.results);
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
 * Flatten a category tree into a flat list.
 *
 * The parser returns a nested category structure. The existing batch
 * view renderer expects a flat list of categories. This function walks
 * the tree and returns an array of { name, words } objects, preserving
 * the order of appearance.
 *
 * @param {Array<Object>} categories - Category nodes from the parser.
 * @returns {Array<{name: string, words: string[]}>} Flat category list.
 */
function flattenCategories(categories) {
    const flat = [];

    function visit(category) {
        flat.push({
            name: category.name,
            words: category.words
        });
        category.subcategories.forEach(visit);
    }

    categories.forEach(visit);
    return flat;
}

/**
 * Render batch results grouped by category.
 *
 * Displays frontmatter metadata (if present) above the results, then
 * renders each category as a collapsible section. Words within each
 * category are matched to their API result and displayed inside a
 * collapsible <details> panel.
 *
 * @param {Array<{name: string, words: string[]}>} categories - Flat list
 *     of parsed categories. Each category has a name and a words array.
 * @param {Object} metadata - Frontmatter metadata key-value pairs. May
 *     be empty.
 * @param {Array<Object>} results - Response items from the batch API.
 *     Each item corresponds to one requested word.
 * @throws {TypeError} If categories or results is not an array, or if
 *     metadata is not an object.
 */
function renderBatchResults(categories, metadata, results) {
    if (!Array.isArray(categories)) {
        throw new TypeError('renderBatchResults: categories must be an array');
    }

    if (!metadata || typeof metadata !== 'object') {
        throw new TypeError('renderBatchResults: metadata must be an object');
    }

    if (!Array.isArray(results)) {
        throw new TypeError('renderBatchResults: results must be an array');
    }

    clearElement(elements.resultsArea);

    // Display frontmatter metadata above results, if present.
    if (Object.keys(metadata).length > 0) {
        elements.resultsArea.appendChild(createMetadataDisplay(metadata));
    }

    // Map words to their result items for fast lookup.
    const resultMap = new Map();
    results.forEach((item) => {
        resultMap.set(item.word, item);
    });

    categories.forEach((category) => {
        if (category.name === '') {
            // Words before any category header: render directly without a heading.
            elements.resultsArea.appendChild(createUncategorizedSection(category, resultMap));
        } else if (category.words.length > 0) {
            // Words within categories: render into collapsible sections with headings
            elements.resultsArea.appendChild(createCategorySection(category, resultMap));
        } else {
            // Categories with no words beneath them
            elements.resultsArea.appendChild(createEmptyCategory(category));
        }
    });
}

/**
 * Create a metadata display section.
 *
 * Renders frontmatter metadata (key-value pairs) as a styled list.
 * Used by batch views to show file metadata (e.g., title) above results.
 *
 * @param {Object} metadata - Flat key-value metadata object.
 * @returns {HTMLElement} The metadata display container.
 */
function createMetadataDisplay(metadata) {
    const container = createElement('div', 'metadata-display');

    for (const [key, value] of Object.entries(metadata)) {
        const item = createElement('div', 'metadata-item');

        const keyEl = createElement('span', 'metadata-key', key);
        const valueEl = createElement('span', 'metadata-value', value);

        item.appendChild(keyEl);
        item.appendChild(valueEl);
        container.appendChild(item);
    }

    return container;
}

/**
 * Append word detail panels to a container.
 *
 * For each word in the category, looks up its API result and creates a
 * collapsible <details> panel. The panels are appended directly to the
 * provided container, which may be a category section or the results
 * area itself (for categories without a visible heading).
 *
 * @param {HTMLElement} container - Element to append word panels to.
 * @param {{name: string, words: string[]}} category - Category data.
 * @param {Map<string, Object>} resultMap - Map of word to API result item.
 */
function appendWordDetails(container, category, resultMap) {
    if (!container || typeof container.appendChild !== 'function') {
        throw new TypeError('appendWordDetails: container must be a DOM element');
    }

    if (!category || typeof category !== 'object') {
        throw new TypeError('appendWordDetails: category must be an object');
    }

    if (!Array.isArray(category.words)) {
        throw new TypeError('appendWordDetails: category.words must be an array');
    }

    if (!(resultMap instanceof Map)) {
        throw new TypeError('appendWordDetails: resultMap must be a Map');
    }

    category.words.forEach((word) => {
        const item = resultMap.get(word);
        const details = createWordDetails(word, item);
        container.appendChild(details);
    });
}

/**
 * Create a collapsible category section.
 *
 * The category name is rendered as a <summary> element. Words belonging
 * to the category are appended to the body of the <details> element and
 * are hidden until the user expands the section.
 *
 * Categories are collapsed by default to keep the results scannable for
 * large word lists.
 *
 * @param {{name: string, words: string[]}} category - Category data.
 * @param {Map<string, Object>} resultMap - Map of word to API result item.
 * @returns {HTMLElement} The category section element (a <details> element).
 */
function createCategorySection(category, resultMap) {
    if (!category || typeof category !== 'object') {
        throw new TypeError('createCategorySection: category must be an object');
    }

    if (typeof category.name !== 'string') {
        throw new TypeError('createCategorySection: category.name must be a string');
    }

    if (!Array.isArray(category.words)) {
        throw new TypeError('createCategorySection: category.words must be an array');
    }

    if (!(resultMap instanceof Map)) {
        throw new TypeError('createCategorySection: resultMap must be a Map');
    }

    const details = createElement('details', 'category-section');

    const summary = createElement('summary', 'category-heading', category.name);
    details.appendChild(summary);

    appendWordDetails(details, category, resultMap);

    return details;
}

/**
 * Create an uncategorized section for words without a category heading.
 *
 * The implicit category has an empty name. Instead of rendering a
 * collapsible section with a blank heading, the words are placed in a
 * plain container and always visible.
 *
 * @param {{name: string, words: string[]}} category - Implicit category
 *     data. The name should be an empty string.
 * @param {Map<string, Object>} resultMap - Map of word to API result item.
 * @returns {HTMLElement} The uncategorized section element (a <div>).
 * @throws {TypeError} If category or resultMap is invalid.
 */
function createUncategorizedSection(category, resultMap) {
    if (!category || typeof category !== 'object') {
        throw new TypeError('createUncategorizedSection: category must be an object');
    }

    if (typeof category.name !== 'string') {
        throw new TypeError('createUncategorizedSection: category.name must be a string');
    }

    if (!Array.isArray(category.words)) {
        throw new TypeError('createUncategorizedSection: category.words must be an array');
    }

    if (!(resultMap instanceof Map)) {
        throw new TypeError('createUncategorizedSection: resultMap must be a Map');
    }

    const container = createElement('div', 'uncategorized-section');
    appendWordDetails(container, category, resultMap);
    return container;
}

/**
 * Create a static heading for a category with no words.
 *
 * Empty categories have a name but no words to display. They are
 * rendered as plain headings without collapse/expand behavior, an
 * arrow, or hover affordance. This communicates that the category
 * exists but contains no results.
 *
 * @param {{name: string, words: string[]}} category - Empty category
 *     data. The words array should be empty.
 * @returns {HTMLElement} The empty category element (a <div>).
 * @throws {TypeError} If category is invalid.
 */
function createEmptyCategory(category) {
    if (!category || typeof category !== 'object') {
        throw new TypeError('createEmptyCategory: category must be an object');
    }

    if (typeof category.name !== 'string') {
        throw new TypeError('createEmptyCategory: category.name must be a string');
    }

    if (!Array.isArray(category.words)) {
        throw new TypeError('createEmptyCategory: category.words must be an array');
    }

    const container = createElement('div', 'category-empty');

    const heading = createElement('h2', 'category-empty-heading', category.name);
    container.appendChild(heading);

    return container;
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
