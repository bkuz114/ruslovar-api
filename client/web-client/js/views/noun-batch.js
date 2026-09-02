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
 *   - Preserve view state across mount/unmount cycles.
 *
 * State preservation:
 *   The view implements getState() and restores from context.state in
 *   mount(). The state shape is:
 *     {
 *       version: 1,
 *       fileName: string,            // Original file name (for display)
 *       parsedDocument: Object,      // Serialized WordListDocument
 *       results: Object|null,        // Full API response from batch submission
 *       strict: boolean,             // Strict mode checkbox state
 *       openNodeIds: string[],       // IDs of open categories and words
 *       scrollTop: number            // Results area scroll position
 *     }
 *
 *   The shell captures getState() before unmount and passes the saved
 *   state to mount() via context.state on subsequent mounts. The view
 *   validates the state version before restoring.
 *
 *   The parsed document is serialized via WordListDocument.toJSON()
 *   and restored via WordListDocument.fromJSON(), enabling full
 *   round-trip reconstruction without re-parsing the original file.
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
 *   - core/dom/dom.js (createElement, clearElement, loadStylesheet)
 *   - core/dom/renderers.js (declension tables, metadata)
 *   - core/errors.js (ApiError)
 *   - core/parsers/wordlist-parser.js (WordListDocument for parsing word lists file)
 *   - core/view-registry.js (registerView)
 *   - css/views/noun-batch.css (lazy-loaded on first mount)
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
    WordListDocument,
} from '../core/parsers/wordlist-parser.js';
import {
    createMatchesContainer,
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
const VIEW_ID = 'noun-batch';

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
 * Populated during buildDom() and reset during unmount(). These are
 * ephemeral references to the view's rendered DOM, not persistent state.
 *
 * @type {Object}
 */
let elements = {};

/**
 * Stores the WordListDocument object associated with the most
 * recent file selection (class which stores the file data, parses
 * it, and allows for traversal of categories, words, etc.)
 * Retained so the submit handler can use the already-parsed
 * data without re-reading the file.
 *
 * See core/parsers/wordlist-parser.js for detailed API.
 *
 * @type {WordListDocument|null}
 */
let parsedDocument = null;

/**
 * The original file name of the selected word list file.
 *
 * Stored for display purposes and included in state so it can be
 * restored on remount. May be an empty string if the content came
 * from an example file or other source without a file name.
 *
 * @type {string}
 */
let selectedFileName = '';

/**
 * The most recent API response from a batch submission.
 *
 * Retained so getState() can include results without having to
 * reconstruct them from the DOM. Set when handleBatchSubmit()
 * completes successfully. Cleared when a new file is loaded.
 *
 * @type {Object|null}
 */
let lastResults = null;

/**
 * Set of node IDs (categories and words) that are currently open.
 *
 * Updated by toggle event listeners on <details> elements. Serialized
 * to an array in getState() and restored from an array on mount.
 *
 * @type {Set<string>}
 */
let openNodeIds = new Set();

/**
 * Register the view with the application shell.
 */
registerView({
    id: VIEW_ID,
    labelKey: 'view_label',
    strings: VIEW_STRINGS,
    requestPolicy: 'abort-on-unmount',

    /**
     * Mount the view into the provided container.
     *
     * Builds the file input, strict mode checkbox, submit button, and
     * results area. Binds event listeners. Restores state if
     * context.state is present and valid.
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
        loadStylesheet('css/views/noun-batch.css');
        buildDom(container);
        bindEvents();

        // Store the request context to be used for making HTTP requests
        // (this will pass the view's info to the data layer so that it
        // can handle aborting or allowing them to continue during navigation)
        if (!context.requestContext) {
            throw new Error(
                `noun-batch: mount() received a malformed context. ` +
                `Expected context.requestContext to be a request context object ` +
                `created by the shell via createRequestContext(). ` +
                `Received: ${context.requestContext === undefined ? 'undefined' : 'null'}.`
            );
        }
        requestContext = context.requestContext;

        // Restore state if present and valid. Otherwise, show the
        // initial placeholder.
        if (context.state && context.state.version === STATE_VERSION) {
            restoreFromState(context.state);
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
        parsedDocument = null;
        selectedFileName = '';
        lastResults = null;
        openNodeIds = new Set();
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
            fileName: selectedFileName,
            parsedDocument: parsedDocument ? parsedDocument.toJSON() : null,
            results: lastResults,
            strict: elements.submitControls ? elements.submitControls.isStrictMode() : false,
            openNodeIds: [...openNodeIds],
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

    // --- Batch controls ------------------------------------------------
    const controls = createElement('section', {
        class: 'batch-controls',
        attrs: {
            'aria-label': getString('file_label', {
                viewId: VIEW_ID
            }),
        },
    });

    // File input group.
    const fileGroup = createElement('div', {
        class: 'file-input-group',
    });

    const fileLabel = createElement('label', {
        text: getString('file_label', {
            viewId: VIEW_ID
        }),
        i18n: {
            "data-i18n": 'file_label',
        },
        attrs: {
            for: 'file-input',
        },
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-input';
    fileInput.accept = '.txt,text/plain';

    const formatHint = createElement('p', {
        class: 'file-format-hint',
        text: getString('file_format_hint', {
            viewId: VIEW_ID
        }),
        i18n: {
            "data-i18n": 'file_format_hint',
        },
    });

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
    const resultsArea = createElement('section', {
        class: 'results-area',
        id: 'results-area',
        attrs: {
            'aria-live': 'polite',
        },
    });

    const placeholder = createElement('p', {
        class: 'results-placeholder',
        id: 'results-placeholder',
        text: getString('results_placeholder', {
            viewId: VIEW_ID
        }),
        i18n: {
            "data-i18n": 'results_placeholder',
        },
    });
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
 * Process raw file content after it has been read.
 *
 * Parses the content, stores the parsed document in module state, updates
 * the submit button enabled state, and displays the file summary.
 *
 * This is the shared entry point for both manual file selection and
 * example file loading.
 *
 * @param {string} content - Raw file contents.
 * @param {string} [fileName] - Original file name, if available.
 * @throws {TypeError} If content is not a string.
 */
function handleFileContent(content, fileName = '') {
    if (typeof content !== 'string') {
        throw new TypeError('handleFileContent: content must be a string');
    }

    // parse the word list document
    const doc = new WordListDocument(content);
    doc.parse();

    // Store the parsed document and file name in module state.
    parsedDocument = doc;
    selectedFileName = fileName;

    // A new file invalidates previous results and expansion state.
    lastResults = null;
    openNodeIds = new Set();

    // Enable the submit button only if there are words to look up.
    const totalWords = doc.countWords();
    elements.submitControls.submitButton.disabled = totalWords === 0;

    showFileSummary(doc.categories, totalWords);
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
        handleFileContent(loadEvent.target.result, file.name);
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
        const errorDiv = createElement('div', {
            class: 'error-message',
            text: getString('error_empty_file', {
                viewId: VIEW_ID
            }),
            i18n: {
                "data-i18n": 'error_empty_file',
            },
            attrs: {
                role: 'alert',
            },
        });
        elements.resultsArea.appendChild(errorDiv);
        return;
    }

    const summaryText = getString('file_summary', {
            viewId: VIEW_ID
        })
        .replace('{categories}', categories.length)
        .replace('{words}', totalWords);

    const summary = createElement('p', {
        class: 'file-summary',
        text: summaryText,
        i18n: {
            "data-i18n": 'file_summary',
            // Note: file_summary uses {categories} and {words} placeholders.
            // The current i18n system only supports a single {n} arg.
            // This will need i18n system support for multiple named args.
        },
    });
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
    if (!parsedDocument) {
        showError(getString('error_no_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    // Extract all words found in the parsed document for the API request.
    const allWords = parsedDocument.allWords();
    // remove duplicates for HTTP request (less HTTP overhead only; dupes will still render on UI)
    const uniqueWords = [...new Set(allWords)];

    if (allWords.length === 0) {
        showError(getString('error_empty_file', {
            viewId: VIEW_ID
        }));
        return;
    }

    elements.submitControls.submitButton.disabled = true;

    try {
        // use this view's saved requestContext to make
        // the HTTP request to the backend. This requestContext
        // object comes from the data layer; it has the view's
        // info attached so the data layer can track who sent
        // this request and manage it (e.g. abort it on unmount
        // or allow it to continue -- whatever the view registesred)
        const data = await requestContext.fetchNounBatch(uniqueWords, elements.submitControls.isStrictMode());
        lastResults = data;
        renderBatchResults(parsedDocument.categories, parsedDocument.metadata, data.results, openNodeIds);
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
 * Restore the view from a saved state snapshot.
 *
 * Reconstructs the WordListDocument from serialized JSON, restores the
 * file name, results, strict mode, expansion state, and scroll position.
 * The DOM is rendered from the restored document and results.
 *
 * Expansion state restoration uses a snapshot Set (restoredOpenIds) for
 * rendering. Any toggle events that fire during rendering may mutate
 * openNodeIds, but after rendering completes, openNodeIds is reset to
 * a pristine copy of the snapshot. This eliminates ordering concerns
 * between listener attachment and initial open state.
 *
 * @param {Object} state - Saved state from a previous mount.
 */
function restoreFromState(state) {
    // Reconstruct the WordListDocument from serialized JSON.
    if (state.parsedDocument) {
        parsedDocument = WordListDocument.fromJSON(state.parsedDocument);
    } else {
        parsedDocument = null;
    }

    selectedFileName = state.fileName || '';
    lastResults = state.results || null;

    // Restore strict mode checkbox.
    if (elements.submitControls && typeof elements.submitControls.setStrictMode === 'function') {
        elements.submitControls.setStrictMode(Boolean(state.strict));
    }

    // Restore expansion state from the saved array.
    const restoredOpenIds = new Set(state.openNodeIds || []);

    // If we have a parsed document, render the file summary and results.
    if (parsedDocument) {
        const totalWords = parsedDocument.countWords();
        elements.submitControls.submitButton.disabled = totalWords === 0;

        showFileSummary(parsedDocument.categories, totalWords);

        if (lastResults && lastResults.results) {
            renderBatchResults(
                parsedDocument.categories,
                parsedDocument.metadata,
                lastResults.results,
                restoredOpenIds
            );
        }
    }

    // Reset openNodeIds to a pristine copy of the snapshot. Any toggle
    // events that fired during rendering have mutated openNodeIds, but
    // those mutations are discarded here.
    openNodeIds = new Set(restoredOpenIds);

    // Restore scroll position after the DOM has been laid out.
    if (state.scrollTop && state.scrollTop > 0) {
        requestAnimationFrame(() => {
            if (elements.resultsArea) {
                elements.resultsArea.scrollTop = state.scrollTop;
            }
        });
    }
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
 * @param {Set<string>} openIds - Set of node IDs that should be open.
 * @throws {TypeError} If categories or results is not an array, or if
 *     metadata is not an object.
 */
function renderBatchResults(categories, metadata, results, openIds) {
    if (!Array.isArray(categories)) {
        throw new TypeError('renderBatchResults: categories must be an array');
    }

    if (!metadata || typeof metadata !== 'object') {
        throw new TypeError('renderBatchResults: metadata must be an object');
    }

    if (!Array.isArray(results)) {
        throw new TypeError('renderBatchResults: results must be an array');
    }

    if (!(openIds instanceof Set)) {
        throw new TypeError('renderBatchResults: openIds must be a Set');
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

    // render a category based on its type
    function renderCategory(category, resultMap, openIds) {
        if (category.name === '') {
            // Words before any category header: render directly without a heading.
            elements.resultsArea.appendChild(createUncategorizedSection(category, resultMap, openIds));
        } else if (category.words.length > 0) {
            // Words within categories: render into collapsible sections with headings
            elements.resultsArea.appendChild(createCategorySection(category, resultMap, openIds));
        } else {
            // Categories with no words beneath them
            elements.resultsArea.appendChild(createEmptyCategory(category));
        }
    }

    // Recursively render all categories in the tree. The visual output
    // is flat: each category is appended directly to the results area,
    // regardless of its depth in the parsed document.
    function renderCategoryTree(categoryList) {
        categoryList.forEach((category) => {
            renderCategory(category, resultMap, openIds);
            if (category.subcategories && category.subcategories.length > 0) {
                renderCategoryTree(category.subcategories);
            }
        });
    }

    renderCategoryTree(categories);
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
    const container = createElement('div', {
        class: 'metadata-display',
    });

    for (const [key, value] of Object.entries(metadata)) {
        const item = createElement('div', {
            class: 'metadata-item',
        });

        const keyEl = createElement('span', {
            class: 'metadata-key',
            text: key,
        });
        const valueEl = createElement('span', {
            class: 'metadata-value',
            text: value,
        });

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
 * @param {{name: string, words: Array<Object>}} category - Category data.
 *     The words array contains word node objects from the parser.
 * @param {Map<string, Object>} resultMap - Map of word to API result item.
 * @param {Set<string>} openIds - Set of node IDs that should be open.
 */
function appendWordDetails(container, category, resultMap, openIds) {
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

    if (!(openIds instanceof Set)) {
        throw new TypeError('appendWordDetails: openIds must be a Set');
    }

    category.words.forEach((wordObj) => {
        // wordObj is a WordNode object created by the parser;
        // get the actual word from it
        const word = wordObj.word;
        const item = resultMap.get(word);
        const details = createWordDetails(wordObj, item, openIds);
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
 * Categories are collapsed by default unless their node ID is present
 * in openIds. A toggle listener keeps openNodeIds in sync when the
 * user expands or collapses the section.
 *
 * @param {{name: string, words: string[]}} category - Category data.
 * @param {Map<string, Object>} resultMap - Map of word to API result item.
 * @param {Set<string>} openIds - Set of node IDs that should be open.
 * @returns {HTMLElement} The category section element (a <details> element).
 */
function createCategorySection(category, resultMap, openIds) {
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

    if (!(openIds instanceof Set)) {
        throw new TypeError('createCategorySection: openIds must be a Set');
    }

    // Set initial open state before attaching the toggle listener.
    const startOpen = openIds.has(category.id);

    const details = createElement('details', {
        class: 'category-section',
        props: {
            open: startOpen,
        },
    });

    // Attach toggle listener after setting initial open state. The open
    // property is set above; the listener only fires on user interaction.
    details.addEventListener('toggle', () => {
        if (details.open) {
            openNodeIds.add(category.id);
        } else {
            openNodeIds.delete(category.id);
        }
    });

    const summary = createElement('summary', {
        class: 'category-heading',
        text: category.name,
    });
    details.appendChild(summary);

    appendWordDetails(details, category, resultMap, openIds);

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
 * @param {Set<string>} openIds - Set of node IDs that should be open.
 * @returns {HTMLElement} The uncategorized section element (a <div>).
 * @throws {TypeError} If category or resultMap is invalid.
 */
function createUncategorizedSection(category, resultMap, openIds) {
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

    if (!(openIds instanceof Set)) {
        throw new TypeError('createUncategorizedSection: openIds must be a Set');
    }

    const container = createElement('div', {
        class: 'uncategorized-section',
    });
    appendWordDetails(container, category, resultMap, openIds);
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

    const container = createElement('div', {
        class: 'category-empty',
    });

    const heading = createElement('h2', {
        class: 'category-empty-heading',
        text: category.name,
    });
    container.appendChild(heading);

    return container;
}

/**
 * Create a collapsible details panel for a single word.
 *
 * The panel is collapsed by default unless its node ID is present in
 * openIds. A toggle listener keeps openNodeIds in sync when the user
 * expands or collapses the panel.
 *
 * @param {Object} wordObj - Word node from the parser. The node
 *     contains the word text under the "word" property.
 * @param {Object|undefined} item - API result item for this word, if any.
 * @param {Set<string>} openIds - Set of node IDs that should be open.
 * @returns {HTMLElement} The word details element.
 */
function createWordDetails(wordObj, item, openIds) {
    // wordObj is a WordNode created by the parser; get word
    const word = wordObj.word;

    // Set initial open state before attaching the toggle listener.
    const startOpen = openIds.has(wordObj.id);

    const details = createElement('details', {
        class: 'word-details',
        props: {
            open: startOpen,
        },
    });

    // Attach toggle listener after setting initial open state. The open
    // property is set above; the listener only fires on user interaction.
    details.addEventListener('toggle', () => {
        if (details.open) {
            openNodeIds.add(wordObj.id);
        } else {
            openNodeIds.delete(wordObj.id);
        }
    });

    // Summary row: word plus a status badge.
    const summary = createElement('summary');

    const success = item && item.status === 'success';
    const error = item && item.status === 'error';

    // Group word and optional match count in a single flex item.
    const wordGroup = createElement('span', {
        class: 'word-group',
        text: word,
    });

    // If the word resolves to multiple dictionary roots, show a count
    // so the user knows before expanding the panel.
    if (success && item.result.matches.length > 1) {
        const matchCount = createElement('span', {
            class: 'match-count',
            text: `(${item.result.matches.length})`,
        });
        wordGroup.appendChild(matchCount);
    }
    summary.appendChild(wordGroup);

    // Badge to display success of this sub-request
    const statusKey = success ? 'status_success' : 'status_error';
    const statusClass = success ? 'status-success' : 'status-error';

    const status = createElement('span', {
        class: ['status-badge', statusClass],
        text: getString(statusKey),
        i18n: {
            "data-i18n": statusKey,
        },
    });

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
        const errorDiv = createElement('div', {
            class: 'word-error',
            text: item.error || getString('error_unknown'),
            i18n: {
                "data-i18n": item.error ? null : 'error_unknown',
            },
        });
        details.appendChild(errorDiv);
    } else {
        // No result item found for this word. This can happen if the
        // API response is missing an entry for a requested word.
        const errorDiv = createElement('div', {
            class: 'word-error',
            text: getString('error_unknown'),
            i18n: {
                "data-i18n": 'error_unknown',
            },
        });
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

    const errorDiv = createElement('div', {
        class: 'error-message',
        text: message,
        attrs: {
            role: 'alert',
        },
    });

    elements.resultsArea.appendChild(errorDiv);
}