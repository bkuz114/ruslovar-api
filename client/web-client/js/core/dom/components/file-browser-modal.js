/**
 * file-browser-modal.js
 *
 * A drill-in file browser modal for selecting files from a manifest.
 *
 * Features:
 *   - Drill-in navigation: double-click folders to navigate, breadcrumb
 *     and back button for moving up
 *   - Multi-select: checkbox or single-click toggles file selection
 *   - Double-click file: selects and confirms immediately
 *   - Recursive regex search: matches against full manifest paths,
 *     displays results in a flat list with filename and path below,
 *     matched portions highlighted
 *   - Light/dark/auto theme support
 *   - i18n: all user-facing text uses data-i18n attributes
 *   - Manifest caching: fetched once, reused for subsequent opens
 *
 * The component fetches a manifest tree (generated server-side), caches it
 * at the module level, and renders it as a navigable file browser.
 *
 * Manifest schema (generated server-side):
 *
 *   {
 *       name: 'root',
 *       type: 'directory',
 *       children: [
 *           {
 *               name: 'folder',
 *               type: 'directory',
 *               children: [ ... ]
 *           },
 *           {
 *               name: 'file.txt',
 *               type: 'file',
 *               path: 'folder/file.txt'
 *           }
 *       ]
 *   }
 *
 * Usage:
 *
 *   import { createFileBrowserModal } from './file-browser-modal.js';
 *
 *   const browser = createFileBrowserModal({
 *       manifestUrl: '/data/manifest.json',
 *       baseUrl: '/files/',
 *       theme: 'auto',
 *       onConfirm: (selectedPaths) => {
 *           console.log('Selected:', selectedPaths);
 *       },
 *       onCancel: () => {
 *           console.log('Cancelled');
 *       },
 *   });
 *
 *   browser.open();
 */

import {
    createElement
} from './../dom.js';

/* --------------------------------------------------------------------------
   Module-level manifest cache
   -------------------------------------------------------------------------- */

/**
 * Cached manifest tree. Stored at module level so it survives modal
 * open/close cycles. Fetched once, reused for subsequent opens.
 */
let cachedManifest = null;

/**
 * Whether a manifest fetch is currently in flight. Prevents duplicate
 * concurrent fetches if the user opens the modal twice quickly.
 */
let fetchInProgress = false;

/**
 * Track which row is currently highlighted via single-click
 */
let highlightedRow = null;

/* --------------------------------------------------------------------------
   Localization dictionary
   -------------------------------------------------------------------------- */

// String dictionary for demo localization
export const FILE_BROWSER_STRINGS = {
    en: {
        demo_title: 'File Browser Modal Demo',
        demo_open: 'Open File Browser',
        demo_toggle_theme: 'Toggle Theme',
        demo_toggle_lang: 'Switch to Russian',
        demo_selected_placeholder: 'Selected files will appear here...',
        fb_title: 'Select Files',
        fb_search_placeholder: 'Search files...',
        fb_cancel: 'Cancel',
        fb_confirm: 'Confirm',
        fb_back: 'Back',
        fb_close: 'Close',
        fb_invalid_regex: 'Invalid search pattern',
        fb_error_load: 'Failed to load file manifest',
        fb_error_invalid: 'The file manifest is not valid',
        fb_empty_folder: 'This folder is empty',
        fb_no_results: 'No matching files',
        fb_selected_count: '{n} selected',
    },
    ru: {
        demo_title: 'Демонстрация модального файлового браузера',
        demo_open: 'Открыть файловый браузер',
        demo_toggle_theme: 'Переключить тему',
        demo_toggle_lang: 'Switch to English',
        demo_selected_placeholder: 'Выбранные файлы появятся здесь...',
        fb_title: 'Выберите файлы',
        fb_search_placeholder: 'Поиск файлов...',
        fb_cancel: 'Отмена',
        fb_confirm: 'Подтвердить',
        fb_back: 'Назад',
        fb_close: 'Закрыть',
        fb_invalid_regex: 'Неверный шаблон поиска',
        fb_error_load: 'Не удалось загрузить манифест файлов',
        fb_error_invalid: 'Манифест файлов имеет неверный формат',
        fb_empty_folder: 'Эта папка пуста',
        fb_no_results: 'Нет подходящих файлов',
        fb_selected_count: 'Выбрано: {n}',
    },
};

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */

/**
 * Creates a text node with regex matches wrapped in <mark> elements.
 * Used to highlight the matched portion of a filename in search results.
 *
 * @param {string} text - The text to render (e.g., a filename)
 * @param {RegExp} pattern - The compiled regex pattern
 * @returns {DocumentFragment|Text} Fragment with highlighted matches,
 *                                  or a plain text node if no match
 */
function createHighlightedText(text, pattern) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) {
        return document.createTextNode(text);
    }

    const fragment = document.createDocumentFragment();
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    // Text before the match
    if (matchStart > 0) {
        fragment.appendChild(document.createTextNode(text.slice(0, matchStart)));
    }

    // The matched portion, wrapped in <mark>
    const highlightEl = createElement('mark', {
        class: 'file-browser-modal__highlight',
        text: text.slice(matchStart, matchEnd),
    });
    fragment.appendChild(highlightEl);

    // Text after the match
    if (matchEnd < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(matchEnd)));
    }

    return fragment;
}

/* --------------------------------------------------------------------------
   Theme management
   -------------------------------------------------------------------------- */

/**
 * Resolves the theme option to an actual theme name.
 *
 * The component supports three theme modes:
 *   - 'light': always use light theme
 *   - 'dark': always use dark theme
 *   - 'auto': follow the browser's prefers-color-scheme setting
 *
 * The resolved theme is applied as a data attribute on the overlay
 * element, which drives the CSS custom property selection.
 *
 * @param {string} themeOption - The theme option from the component config
 * @returns {string} The resolved theme name ('light' or 'dark')
 */
function resolveTheme(themeOption) {
    if (themeOption === 'dark') {
        return 'dark';
    }

    if (themeOption === 'auto') {
        if (
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
            return 'dark';
        }
    }

    // Default to light for both explicit 'light' and any unrecognized value.
    // (Unrecognized values are already rejected in the factory validation.)
    return 'light';
}

/* --------------------------------------------------------------------------
   Sorting
   -------------------------------------------------------------------------- */

/**
 * Sorts an array of manifest nodes: directories first, then files.
 * Within each group, entries are sorted alphabetically by name,
 * case-insensitive and locale-aware.
 *
 * @param {Array<Object>} nodes - Array of manifest nodes to sort
 * @returns {Array<Object>} A new sorted array (original is not mutated)
 */
function sortNodes(nodes) {
    // Spread to avoid mutating the caller's array—render functions may
    // pass `currentDir.children` directly.
    return [...nodes].sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') {
            return -1;
        }
        if (a.type === 'file' && b.type === 'directory') {
            return 1;
        }

        // localeCompare with numeric:true gives natural ordering for
        // names like "file2" < "file10".
        return a.name.localeCompare(b.name, undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    });
}

/**
 * Recursively walks the manifest tree and collects all files whose
 * names match the search term (case-insensitive substring match).
 *
 * Used for recursive search. When a search term is active, the
 * drill-in tree view is replaced with a flat list of matching files
 * from all directories at any depth.
 *
 * @param {Object} node - The manifest node to walk (directory or file)
 * @param {string} searchTerm - Lowercase search term
 * @param {Array<Object>} results - Accumulator array for matching files
 */
function flattenTree(node, searchPattern, results = []) {
    if (node.type === 'file') {
        // Match against the full manifest path, not just the name.
        // Users can search for patterns like "cases/.*plural" or
        // "verbs/.*\.txt$" to narrow by directory.
        if (searchPattern.test(node.path)) {
            results.push(node);
        }
        return results;
    }

    if (node.type === 'directory' && node.children) {
        for (const child of node.children) {
            flattenTree(child, searchPattern, results);
        }
    }

    return results;
}

/* --------------------------------------------------------------------------
   Selection state
   -------------------------------------------------------------------------- */

/**
 * Moves the visual highlight from the previously clicked row to the
 * newly clicked row.
 *
 * Triggered by: single-click on any row (file or folder).
 * Visual effect: adds the --highlighted class to the row, removes
 * it from the previous row.
 *
 * This is focus indication only. It does not affect checkbox state,
 * selection, or the confirm button.
 *
 * @param {HTMLElement|null} row - The row that was clicked, or null
 *                                 to clear the highlight
 */
function setHighlightedRow(row) {
    // Guard: avoid redundant DOM writes when the same row is already
    // highlighted. Also prevents flicker from remove/add class round-trips.
    if (highlightedRow === row) {
        return;
    }
    if (highlightedRow) {
        highlightedRow.classList.remove('file-browser-modal__row--highlighted');
    }
    highlightedRow = row;
    if (highlightedRow) {
        highlightedRow.classList.add('file-browser-modal__row--highlighted');
    }
}

/**
 * Tracks which file paths are currently selected.
 * Wraps a Set to provide a clean API for the component.
 */
class SelectionState {
    constructor() {
        this.selectedPaths = new Set();
    }

    /**
     * Toggles selection for a file path.
     * @param {string} path - The full file path
     * @returns {boolean} The new selection state (true = selected)
     */
    toggle(path) {
        if (this.selectedPaths.has(path)) {
            this.selectedPaths.delete(path);
            return false;
        } else {
            this.selectedPaths.add(path);
            return true;
        }
    }

    /**
     * Checks if a path is selected.
     * @param {string} path - The full file path
     * @returns {boolean} True if selected
     */
    has(path) {
        return this.selectedPaths.has(path);
    }

    /**
     * Returns all selected paths as an array.
     * @returns {string[]} Array of selected file paths
     */
    getAll() {
        return [...this.selectedPaths];
    }

    /**
     * Returns the number of selected files.
     * @returns {number} Selected count
     */
    get count() {
        return this.selectedPaths.size;
    }

    /**
     * Clears all selections.
     */
    clear() {
        this.selectedPaths.clear();
    }
}

/* --------------------------------------------------------------------------
   Navigation state
   -------------------------------------------------------------------------- */

/**
 * Tracks the current navigation position in the manifest tree.
 * Stores a path of directory names from root to current directory.
 */
class NavigationState {
    constructor() {
        this.pathSegments = [];
    }

    /**
     * Returns the current directory node by traversing the tree.
     *
     * Starts at index 1 because pathSegments[0] is the manifest root name,
     * which is already represented by the manifest object itself.
     *
     * @param {Object} manifest - The manifest tree root
     * @returns {Object} The current directory node
     */
    getCurrentDirectory(manifest) {
        let current = manifest;

        for (let i = 1; i < this.pathSegments.length; i++) {
            const segmentName = this.pathSegments[i];
            const found = current.children.find(
                (child) => child.name === segmentName && child.type === 'directory'
            );
            // If a segment is missing (e.g., manifest changed between fetches),
            // stop traversing and return the deepest directory we did find.
            if (!found) {
                break;
            }
            current = found;
        }

        return current;
    }

    /**
     * Navigates into a directory.
     * @param {Object} directory - The directory node to navigate into
     */
    navigateInto(directory) {
        this.pathSegments.push(directory.name);
    }

    /**
     * Navigates up one level.
     * @returns {boolean} True if navigation happened, false if at root
     */
    navigateUp() {
        // At root (length 0 or 1), there's nowhere to go up.
        if (this.pathSegments.length <= 1) {
            return false;
        }
        this.pathSegments.pop();
        return true;
    }

    /**
     * Navigates to a specific breadcrumb segment index.
     * @param {number} index - The index in pathSegments to navigate to
     */
    navigateTo(index) {
        // Slice to keep segments up to and including the target index.
        this.pathSegments = this.pathSegments.slice(0, index + 1);
    }

    /**
     * Resets navigation to the root.
     */
    reset() {
        this.pathSegments = [];
    }

    /**
     * Returns the current breadcrumb path as an array of {name, index}.
     * @returns {Array<{name: string, index: number}>} Breadcrumb segments
     */
    getBreadcrumbs() {
        return this.pathSegments.map((name, index) => ({
            name,
            index,
        }));
    }
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

/**
 * Creates a file browser modal component.
 *
 * @param {Object} options - Component configuration
 * @param {string} options.manifestUrl - URL to fetch the manifest from
 * @param {string} [options.baseUrl=''] - Base URL prepended to selected
 *                                         file paths on confirm. Selected
 *                                         paths are resolved relative to
 *                                         this. Trailing slashes are
 *                                         normalized.
 * @param {Function} [options.onConfirm] - Called when user confirms selection.
 *                                          Receives array of selected file paths.
 * @param {Function} [options.onCancel] - Called when user cancels or closes.
 * @param {string} [options.title='Select Files'] - Modal title text
 * @param {'light'|'dark'|'auto'} [options.theme='light'] - Theme mode
 *
 * @returns {Object} Component API: open, close, destroy
 */
export function createFileBrowserModal({
    manifestUrl,
    baseUrl = '',
    onConfirm = null,
    onCancel = null,
    title = 'Select Files',
    theme = 'light',
} = {}) {
    // Validate required options
    if (!manifestUrl || typeof manifestUrl !== 'string') {
        throw new TypeError('manifestUrl is required and must be a string');
    }
    if (!baseUrl || typeof baseUrl !== 'string') {
        throw new TypeError('baseUrl is required and must be a string');
    }
    if (onConfirm !== null && typeof onConfirm !== 'function') {
        throw new TypeError('onConfirm must be a function or null');
    }
    if (onCancel !== null && typeof onCancel !== 'function') {
        throw new TypeError('onCancel must be a function or null');
    }
    if (typeof title !== 'string') {
        throw new TypeError('title must be a string');
    }
    if (!['light', 'dark', 'auto'].includes(theme)) {
        throw new TypeError("theme must be 'light', 'dark', or 'auto'");
    }

    // Component state
    let isOpen = false;
    let isDestroyed = false;

    // DOM references
    let overlay = null;
    let modalRoot = null;
    let treeContainer = null;
    let searchInput = null;
    let selectedCountEl = null;
    let confirmBtn = null;
    let cancelBtn = null;
    let backBtn = null;
    let breadcrumbEl = null;
    let errorContainer = null;

    // State objects
    const selection = new SelectionState();
    const navigation = new NavigationState();

    // Resolved theme (doesn't change between opens)
    const resolvedTheme = resolveTheme(theme);

    // Listener references for cleanup.
    // Each entry is [target, eventName, handler] so destroy() can
    // remove every listener without needing individual variable references.
    const listeners = [];

    /**
     * Fetches the manifest, using cache if available.
     *
     * Uses a polling pattern when a fetch is already in progress: rather
     * than duplicating the request, waiters poll the module-level cache
     * until the in-flight fetch resolves. The 100ms interval is arbitrary
     * but responsive enough for a modal open.
     *
     * @returns {Promise<Object>} Resolves with the manifest tree
     */
    async function fetchManifest() {
        // Fast path: already have the manifest, no fetch needed.
        if (cachedManifest) {
            return cachedManifest;
        }

        // Slow path: another caller started the fetch. Wait for it to
        // populate cachedManifest, then resolve.
        if (fetchInProgress) {
            return new Promise((resolve) => {
                const pollInterval = setInterval(() => {
                    if (cachedManifest) {
                        clearInterval(pollInterval);
                        resolve(cachedManifest);
                    }
                }, 100);
            });
        }

        fetchInProgress = true;

        try {
            const response = await fetch(manifestUrl);
            if (!response.ok) {
                // Log technical details, show localized error in UI
                console.error('File browser: fetch failed with status', response.status);
                throw new Error('fb_error_load');
            }
            const data = await response.json();

            if (!data || typeof data !== 'object') {
                console.error('File browser: manifest is not an object');
                throw new Error('fb_error_invalid');
            }
            if (!data.name || !data.type || !data.children) {
                console.error(
                    'File browser: manifest missing name, type, or children',
                    data
                );
                throw new Error('fb_error_invalid');
            }

            cachedManifest = data;
            return cachedManifest;
        } finally {
            // Always reset the flag, even on failure, so future opens
            // can retry the fetch.
            fetchInProgress = false;
        }
    }

    /**
     * Builds the modal DOM structure. Called once on first open.
     */
    function buildDOM() {
        // Overlay
        overlay = createElement('div', {
            class: 'file-browser-overlay',
            attrs: {
                'data-theme': resolvedTheme,
            },
        });

        // Modal root
        modalRoot = createElement('div', {
            class: 'file-browser-modal',
            attrs: {
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': title,
            },
        });

        // Header
        const header = createElement('div', {
            class: 'file-browser-modal__header',
        });

        const titleEl = createElement('h2', {
            class: 'file-browser-modal__title',
            i18n: {
                'data-i18n': 'fb_title',
            },
        });

        const closeBtn = createElement('button', {
            class: 'file-browser-modal__close',
            html: '&times;',
            i18n: {
                'data-i18n-aria-label': 'fb_close',
            },
            attrs: {
                type: 'button',
            },
        });
        closeBtn.addEventListener('click', () => handleCancel());
        listeners.push([closeBtn, 'click']);

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Toolbar
        const toolbar = createElement('div', {
            class: 'file-browser-modal__toolbar',
        });

        backBtn = createElement('button', {
            class: 'file-browser-modal__back',
            html: '&larr;',
            i18n: {
                'data-i18n-aria-label': 'fb_back',
            },
            attrs: {
                type: 'button',
            },
        });
        backBtn.addEventListener('click', () => {
            // Only re-render if navigation actually changed.
            if (navigation.navigateUp()) {
                renderCurrentDirectory();
            }
        });
        listeners.push([backBtn, 'click']);

        breadcrumbEl = createElement('nav', {
            class: 'file-browser-modal__breadcrumb',
            attrs: {
                'aria-label': 'Breadcrumb',
            },
        });

        searchInput = createElement('input', {
            class: 'file-browser-modal__search',
            i18n: {
                'data-i18n-placeholder': 'fb_search_placeholder',
            },
            attrs: {
                type: 'search',
                'aria-label': 'Search files',
            },
        });
        // Re-render on every keystroke—the filter is applied in
        // renderCurrentDirectory().
        searchInput.addEventListener('input', () => {
            renderCurrentDirectory();
        });
        listeners.push([searchInput, 'input']);

        toolbar.appendChild(backBtn);
        toolbar.appendChild(breadcrumbEl);
        toolbar.appendChild(searchInput);

        // Error container
        errorContainer = createElement('div', {
            class: 'file-browser-modal__error',
            i18n: {
                'data-i18n': 'fb_error_load',
            },
            attrs: {
                hidden: '',
            },
        });

        // Tree container
        treeContainer = createElement('div', {
            class: 'file-browser-modal__tree',
        });

        // Footer
        const footer = createElement('div', {
            class: 'file-browser-modal__footer',
        });

        selectedCountEl = createElement('span', {
            class: 'file-browser-modal__selected-count',
            i18n: {
                'data-i18n': 'fb_selected_count',
                substitutions: {
                    'data-i18n': {
                        n: 0
                    },
                },
            },
        });

        const buttonGroup = createElement('div', {
            class: 'file-browser-modal__buttons',
        });

        cancelBtn = createElement('button', {
            class: 'file-browser-modal__cancel-btn',
            i18n: {
                'data-i18n': 'fb_cancel',
            },
            attrs: {
                type: 'button',
            },
        });
        cancelBtn.addEventListener('click', () => handleCancel());
        listeners.push([cancelBtn, 'click']);

        confirmBtn = createElement('button', {
            class: 'file-browser-modal__confirm-btn',
            i18n: {
                'data-i18n': 'fb_confirm',
            },
            attrs: {
                type: 'button',
            },
        });
        confirmBtn.addEventListener('click', () => handleConfirm());
        listeners.push([confirmBtn, 'click']);

        buttonGroup.appendChild(cancelBtn);
        buttonGroup.appendChild(confirmBtn);

        footer.appendChild(selectedCountEl);
        footer.appendChild(buttonGroup);

        // Assemble modal
        modalRoot.appendChild(header);
        modalRoot.appendChild(toolbar);
        modalRoot.appendChild(errorContainer);
        modalRoot.appendChild(treeContainer);
        modalRoot.appendChild(footer);

        overlay.appendChild(modalRoot);
        document.body.appendChild(overlay);

        // Overlay click closes—but only when the click is directly on the
        // overlay backdrop, not on the modal itself.
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                handleCancel();
            }
        });
        listeners.push([overlay, 'click']);

        // Escape key closes.
        // The isOpen check prevents Escape from triggering cancel when
        // the modal is closed but the listener is still attached.
        const escapeHandler = (event) => {
            if (event.key === 'Escape' && isOpen) {
                handleCancel();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        // Note: handler is a named function reference so it can be
        // removed in destroy().
        listeners.push([document, 'keydown', escapeHandler]);
    }

    /**
     * Renders the breadcrumb bar based on current navigation state.
     */
    function renderBreadcrumbs() {
        // Clear previous breadcrumbs. Using firstChild loop rather than
        // innerHTML = '' to avoid potential XSS/performance issues and
        // maintain DOM consistency.
        while (breadcrumbEl.firstChild) {
            breadcrumbEl.removeChild(breadcrumbEl.firstChild);
        }

        const segments = navigation.getBreadcrumbs();

        segments.forEach((segment, index) => {
            const isLast = index === segments.length - 1;

            const crumb = createElement('button', {
                class: 'file-browser-modal__breadcrumb-item' +
                    (isLast ? ' file-browser-modal__breadcrumb-item--current' : ''),
                text: segment.name,
                attrs: {
                    type: 'button',
                },
            });

            crumb.addEventListener('click', () => {
                navigation.navigateTo(index);
                renderCurrentDirectory();
            });

            breadcrumbEl.appendChild(crumb);

            if (!isLast) {
                breadcrumbEl.appendChild(
                    createElement('span', {
                        class: 'file-browser-modal__breadcrumb-sep',
                        text: '/',
                    })
                );
            }
        });

        // Disable back button at root. pathSegments.length <= 1 means we're
        // at the root (0 = not yet initialized, 1 = root only).
        backBtn.disabled = navigation.pathSegments.length <= 1;
    }

    /**
     * Renders the file/folder list for the current directory.
     * Applies sorting and search filter.
     */
    function renderCurrentDirectory() {
        // Guard: renderCurrentDirectory() should only be called after a
        // successful fetch, but this protects against pre-fetch calls
        // (e.g., a future refactor that calls it during open()).
        if (!cachedManifest) {
            return;
        }

        // Clear the tree container - remove all existing row elements
        // so the new view renders into an empty container.
        while (treeContainer.firstChild) {
            treeContainer.removeChild(treeContainer.firstChild);
        }

        // Clear the highlighted row reference. The old rows have been
        // removed from the DOM, so the reference is now stale. Resetting
        // to null ensures no phantom highlight carries over to the new view.
        setHighlightedRow(null);

        // Get the current directory and search term
        const currentDir = navigation.getCurrentDirectory(cachedManifest);
        const searchTerm = searchInput.value.trim();

        // Compile the search term as a regex pattern.
        // The audience is software engineers, so regex is the expected
        // search behavior. The pattern matches against the full manifest
        // path, allowing searches like "^cases/" or "\.txt$" or
        // "acc.*plural" to work naturally.
        let searchPattern = null;
        if (searchTerm) {
            try {
                searchPattern = new RegExp(searchTerm, 'i');
            } catch (error) {
                // Invalid regex pattern. searchPattern remains null,
                // which the rendering branch below treats as an error
                // state showing a message to the user.
                console.error('File browser: invalid search regex', searchTerm, error);
            }
        }

        // Determine what to render based on whether a search is active.
        let children;
        let searchError = false;

        if (searchPattern) {
            // Recursive regex search: flatten the entire manifest tree
            // into a flat list of matching files, regardless of directory
            // depth. Matching is against the full path, not just the name.
            // Folders are not included in results because folder selection
            // is not part of this component's design.
            children = flattenTree(cachedManifest, searchPattern);
        } else if (searchTerm) {
            // Invalid regex — no children rendered, error state shown
            searchError = true;
            children = [];
        } else {
            // Normal drill-in view: show the contents of the current directory.
            children = currentDir.children || [];
        }

        // Sort: folders first, then files, alphabetical.
        // In recursive search results, only files are present, so the
        // folder/file grouping is a no-op and alphabetical order applies.
        const sortedChildren = sortNodes(children);

        // Render each child as a row
        for (const child of sortedChildren) {
            const row = createRow(child);
            treeContainer.appendChild(row);
        }

        // Show empty or error state if no results
        if (searchError) {
            // Invalid regex pattern — show a specific error message
            const errorState = createElement('div', {
                class: 'file-browser-modal__empty',
                i18n: {
                    'data-i18n': 'fb_invalid_regex',
                },
            });
            treeContainer.appendChild(errorState);
        } else if (sortedChildren.length === 0) {
            const emptyState = createElement('div', {
                class: 'file-browser-modal__empty',
                i18n: {
                    'data-i18n': searchTerm ? 'fb_no_results' : 'fb_empty_folder',
                },
            });
            treeContainer.appendChild(emptyState);
        }

        renderBreadcrumbs();
    }

    /**
     * Creates a row for a file or folder.
     *
     * Directories have single-click (highlight) and double-click (navigate)
     * handlers. Files have a checkbox plus single-click to toggle selection.
     * The checkbox's change event handles the actual selection state update;
     * the row click handler for files duplicates this when the row (but not
     * the checkbox itself) is clicked.
     *
     * @param {Object} node - The manifest node
     * @returns {HTMLElement} The row element
     */
    function createRow(node) {
        const isDirectory = node.type === 'directory';

        // Build the row container with type-specific class.
        // The type class is used for any file vs. folder specific styling.
        const row = createElement('div', {
            class: 'file-browser-modal__row' +
                (isDirectory ?
                    ' file-browser-modal__row--directory' :
                    ' file-browser-modal__row--file'),
        });

        let checkbox = null;

        // --- First file-only block: create and append the checkbox ---
        // Files get a checkbox for selection. Folders do not have
        // checkboxes because folder selection is not part of this
        // component's design — folders are navigation only.
        if (!isDirectory) {
            checkbox = createElement('input', {
                class: 'file-browser-modal__checkbox',
                attrs: {
                    type: 'checkbox',
                    'aria-label': 'Select ' + node.name,
                },
                props: {
                    // Restore checked state when re-rendering (e.g., after
                    // navigation or search) so previously selected files
                    // remain visually selected.
                    checked: selection.has(node.path),
                },
            });
            // The change event is the source of truth for checkbox state.
            // Fires whether the user clicks the checkbox or toggles it via
            // keyboard or assistive tech.
            checkbox.addEventListener('change', () => {
                const isSelected = selection.toggle(node.path);
                checkbox.checked = isSelected;
                updateSelectedCount();
                toggleFileRowSelectionState(row, isSelected);
            });
            row.appendChild(checkbox);
        }

        // Icon — decorative only, hidden from screen readers.
        // Distinguishes folders from files visually.
        const icon = createElement('span', {
            class: 'file-browser-modal__icon',
            text: isDirectory ? '📁' : '📄',
            attrs: {
                'aria-hidden': 'true',
            },
        });
        row.appendChild(icon);

        // Name and path container — stacks the filename and its path
        // vertically when search is active. The path appears beneath
        // the filename, muted and smaller, for context.
        const nameAndPathContainer = createElement('span', {
            class: 'file-browser-modal__name-and-path',
        });

        // Name — the node's display name.
        // File and folder names come from the manifest, not localized.
        // When search is active, the matching portion of the filename
        // is highlighted so users can see why the result matched.
        const nameEl = createElement('span', {
            class: 'file-browser-modal__name',
            text: node.name,
        });
        nameAndPathContainer.appendChild(nameEl);

        // Path — shown only in recursive search results.
        // When search is active, rows show the full path below the
        // filename so users know which directory each result came from.
        // The matched portion of the path is highlighted using the same
        // createHighlightedText utility, so the user can see both the
        // filename match and the path match during visual comparison.
        // In normal drill-in view, the path is omitted because the
        // current directory is already shown in the breadcrumb.
        const activeSearch = searchInput && searchInput.value.trim();
        if (activeSearch && !isDirectory) {
            const pathEl = createElement('span', {
                class: 'file-browser-modal__path',
            });

            try {
                const pattern = new RegExp(searchInput.value.trim(), 'i');
                pathEl.appendChild(createHighlightedText(node.path, pattern));
            } catch {
                // Invalid regex — fall back to plain path text
                pathEl.textContent = node.path;
            }

            // Add a class to the row to indicate it has a path.
            // This allows CSS to adjust alignment (checkbox/icon to
            // top) when the row is two lines tall.
            row.classList.add('file-browser-modal__row--search-result');

            nameAndPathContainer.appendChild(pathEl);
        }

        row.appendChild(nameAndPathContainer);

        // --- Event handlers based on node type ---
        if (isDirectory) {
            // Directory: single-click focuses, double-click navigates.
            // Single-click highlights the row
            row.addEventListener('click', () => {
                setHighlightedRow(row);
            });
            // Double-click navigates into the directory
            row.addEventListener('dblclick', () => {
                navigation.navigateInto(node);
                renderCurrentDirectory();
            });
        } else {
            // File: single-click focuses and toggles selection,
            // double-click selects and confirms.
            // Single-click highlights the row and toggles checkbox.
            // The checkbox change handler also fires when the checkbox is
            // clicked directly, so this handler skips toggling when the
            // click target is the checkbox itself to avoid double-toggle.
            row.addEventListener('click', (event) => {
                setHighlightedRow(row);
                if (event.target === checkbox) {
                    return;
                }
                checkbox.checked = !checkbox.checked;
                const isSelected = selection.toggle(node.path);
                checkbox.checked = isSelected;
                updateSelectedCount();
                toggleFileRowSelectionState(row, isSelected);
            });

            // Double-click selects the file (if not already selected)
            // and immediately confirms, closing the modal and passing
            // the selected paths to onConfirm. This is the fast path
            // for users who want a single file without manually
            // selecting and clicking Confirm.
            row.addEventListener('dblclick', () => {
                // Ensure the file is selected before confirming.
                // If the user single-clicked it earlier, it is already
                // in the selection set, so this is a no-op.
                if (!selection.has(node.path)) {
                    selection.toggle(node.path);
                    checkbox.checked = true;
                    updateSelectedCount();
                    toggleFileRowSelectionState(row, true);
                }
                handleConfirm();
            });
        }

        // --- Second file-only block: restore selected visual state ---
        // When re-rendering rows (e.g., after navigation or search),
        // previously selected files need the selected background class
        // reapplied. The checkbox state was already restored above in
        // the first file-only block via props.checked. This block adds
        // the visual row highlight to match.
        if (!isDirectory && selection.has(node.path)) {
            row.classList.add('file-browser-modal__row--selected');
        }

        return row;
    }

    /**
     * Toggles the selected visual style on a file row.
     *
     * Triggered by: checkbox change or clicking the row (which toggles
     * the checkbox).
     * Visual effect: adds or removes the --selected class on the row.
     *
     * This reflects the checkbox/selection state. It does not affect
     * the focus highlight (--highlighted).
     *
     * @param {HTMLElement} row - The file row element
     * @param {boolean} isSelected - True if the file is in the selected set
     */
    function toggleFileRowSelectionState(row, isSelected) {
        row.classList.toggle('file-browser-modal__row--selected', isSelected);
    }

    /**
     * Updates the selected count display and confirm button state.
     *
     * Sets both the data-i18n-substitutions attribute (for the app's
     * localization system) and the textContent directly (for immediate
     * feedback before localization runs).
     */
    function updateSelectedCount() {
        const count = selection.count;
        selectedCountEl.setAttribute(
            'data-i18n-substitutions',
            JSON.stringify({
                'data-i18n': {
                    n: count
                },
            })
        );
        // Also update text directly for immediate feedback
        selectedCountEl.textContent = count + ' selected';
        confirmBtn.disabled = count === 0;
    }

    /**
     * Shows an error message in the modal.
     * @param {string} i18nKey - The data-i18n key for the localized error message
     */
    function showError(i18nKey) {
        errorContainer.hidden = false;
        errorContainer.setAttribute('data-i18n', i18nKey);
        // The application's localization system will set the actual text.
        // We set a fallback here for immediate feedback.
        errorContainer.textContent = i18nKey === 'fb_error_invalid' ?
            'The file manifest is not valid' :
            'Failed to load file manifest';
        treeContainer.hidden = true;
        searchInput.disabled = true;
        confirmBtn.disabled = true;
    }

    /**
     * Hides the error message and shows the tree.
     */
    function hideError() {
        errorContainer.hidden = true;
        treeContainer.hidden = false;
        searchInput.disabled = false;
        updateSelectedCount();
    }

    /**
     * Handles the confirm action.
     */
    function handleConfirm() {
        // Defensive guard: the confirm button is disabled when count is 0,
        // but this protects against programmatic calls or edge cases where
        // the disabled state might not apply (e.g., stale DOM).
        if (selection.count === 0) {
            return;
        }
        // Resolve selected manifest paths against the baseUrl option
        const selectedPaths = selection.getAll().map((path) => {
            if (!baseUrl) {
                return path;
            }
            // Normalize the join to avoid double slashes or missing slashes
            const trimmedBase = baseUrl.replace(/\/+$/, '');
            const trimmedPath = path.replace(/^\/+/, '');
            return trimmedBase + '/' + trimmedPath;
        });
        close();
        if (typeof onConfirm === 'function') {
            onConfirm(selectedPaths);
        }
    }

    /**
     * Handles the cancel action.
     */
    function handleCancel() {
        close();
        if (typeof onCancel === 'function') {
            onCancel();
        }
    }

    /**
     * Focuses the first focusable element in the modal.
     */
    function focusFirstElement() {
        if (searchInput && !searchInput.disabled) {
            searchInput.focus();
        } else if (cancelBtn) {
            cancelBtn.focus();
        }
    }

    /**
     * Opens the modal.
     */
    async function open() {
        if (isDestroyed) {
            throw new Error('Component has been destroyed');
        }
        // Guard against duplicate opens. The modal is already visible,
        // so this is a no-op rather than an error.
        if (isOpen) {
            return;
        }

        // Lazy DOM construction: buildDOM() is only called on first open,
        // keeping the document clean if the component is never opened.
        if (!overlay) {
            buildDOM();
        }

        navigation.reset();
        selection.clear();
        updateSelectedCount();
        hideError();
        searchInput.value = '';

        overlay.hidden = false;
        isOpen = true;

        try {
            const manifest = await fetchManifest();
            // Initialize pathSegments with the manifest root name so
            // breadcrumbs show the root as the first segment.
            navigation.pathSegments = [manifest.name];
            renderCurrentDirectory();
            focusFirstElement();
        } catch (error) {
            // error.message is an i18n key (fb_error_load or fb_error_invalid)
            const i18nKey = error.message.startsWith('fb_') ? error.message : 'fb_error_load';
            console.error('File browser error:', error);
            showError(i18nKey);
        }
    }

    /**
     * Closes the modal without invoking callbacks.
     */
    function close() {
        // Idempotent close: already destroyed or already closed is a no-op.
        if (isDestroyed || !isOpen) {
            return;
        }
        overlay.hidden = true;
        isOpen = false;
    }

    /**
     * Destroys the component.
     */
    function destroy() {
        // Already destroyed is a no-op.
        if (isDestroyed) {
            return;
        }

        // Remove all event listeners registered via the listeners array.
        // Each entry is [target, eventName, handler].
        for (const [target, eventName, handler] of listeners) {
            target.removeEventListener(eventName, handler);
        }
        listeners.length = 0;

        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }

        // Clear all DOM references to allow garbage collection.
        overlay = null;
        modalRoot = null;
        treeContainer = null;
        searchInput = null;
        selectedCountEl = null;
        confirmBtn = null;
        cancelBtn = null;
        backBtn = null;
        breadcrumbEl = null;
        errorContainer = null;

        isDestroyed = true;
        isOpen = false;
    }

    return {
        open,
        close,
        destroy,
    };
}