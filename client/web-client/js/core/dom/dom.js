/**
 * Ruslovar API Demo — DOM Utilities
 *
 * Small helper functions for DOM manipulation. Keeps view code cleaner
 * by reducing repetitive createElement / appendChild boilerplate.
 *
 * Dependencies:
 *   - core/i18n.js (for i18n data attribute constants)
 */

import {
    I18N_KEY,
    I18N_ARG_KEY,
    I18N_PLACEHOLDER_KEY,
    I18N_VIEW_OVERRIDE_KEY,
    I18N_SHARE_OVERRIDE_KEY,
} from '../i18n.js';

/**
 * Set the class attribute on an element.
 *
 * Accepts either a string or an array of strings. Strings are trimmed,
 * empty strings are discarded, and arrays are joined with spaces.
 * Logs an error and leaves the class attribute unset if the value is
 * not a string or array of strings, or if an array contains a
 * non-string value.
 *
 * @param {HTMLElement} element - The target element.
 * @param {string|string[]} value - Class name(s) to apply.
 * @param {string} source - Description of where the value came from
 *     (e.g., "class option" or "attrs.class") for error messages.
 */
function setClassAttribute(element, value, source) {
    if (Array.isArray(value)) {
        /**
         * Case: value is an array.
         * Validate all entries are strings,
         * then trim each entry and filter out
         * empty strings.
         */
        const allStrings = value.every((cls) => typeof cls === 'string');
        if (!allStrings) {
            console.error(
                `createElement: ${source} array must contain only strings. ` +
                `The class attribute will not be set on this element.`
            );
            return;
        }

        // Trim each string and drop anything empty after trimming, so
        // no empty class tokens are written to the DOM.
        const trimmed = value
            .map((cls) => cls.trim())
            .filter((cls) => cls !== '');
        if (trimmed.length > 0) {
            element.setAttribute('class', trimmed.join(' '));
        }
    } else if (typeof value === 'string') {
        /**
         * Case: value is a string.
         * Should be either either a single class name,
         * or a whitespace seaparated list of class names.
         */
        const trimmed = value.trim();
        if (trimmed !== '') {
            element.setAttribute('class', trimmed);
        }
    } else {
        console.error(
            `createElement: ${source} must be a string or array of strings. ` +
            `Received: ${typeof value}. The class attribute will not be set on this element.`
        );
    }
}

/**
 * Create an HTML element with optional content, i18n configuration,
 * attributes, and properties.
 *
 * @param {string} tagName - HTML tag name (e.g., "div", "h2", "table").
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.text=''] - Text content for the element. Sets
 *   textContent.
 * @param {string} [options.html=''] - HTML content for the element. Sets
 *   innerHTML. Mutually exclusive with text; if both are provided, text
 *   takes precedence and a warning is logged.
 * @param {string|string[]|null} [options.class=null] - CSS class(es) to
 *   apply. Accepts a string or array of strings. Sets the class attribute.
 *   If attrs.class is also provided, attrs.class takes precedence.
 * @param {string|null} [options.id=null] - Element ID. Sets the id
 *   attribute. If attrs.id is also provided, attrs.id takes precedence.
 * @param {Object} [options.i18n={}] - i18n configuration. Keys should be
 *   data-i18n attribute names (e.g., "data-i18n",
 *   "data-i18n-placeholder"). There are also three special keys: substitution,
 *   forceShared, and forceView. Special keys are described below.
 * @param {string|number|null} [options.i18n.substitution=null] -
 *   Placeholder substitution value. Sets data-i18n-arg.
 * @param {boolean} [options.i18n.forceShared=false] - If true, forces shared
 *   dictionary lookup. Sets data-i18n-force-shared.
 * @param {string|null} [options.i18n.forceView=null] - If set, forces lookup
 *   in a specific view's dictionary. Sets data-i18n-force-view.
 * @param {Object} [options.attrs={}] - HTML attributes to set via
 *   setAttribute. The class attribute accepts either a string or an array
 *   of strings; arrays are joined with spaces.
 * @param {Object} [options.props={}] - Direct DOM properties to assign to
 *   the element (e.g., disabled, checked, value). Applied after attrs; if
 *   a property also has a corresponding attribute in attrs, the property
 *   assignment wins. For example, props.className overrides attrs.class.
 * @returns {HTMLElement} The created element.
 * @throws {TypeError} If tagName is not a non-empty string.
 * @throws {TypeError} If text or html is not a string.
 * @throws {TypeError} If i18n, attrs, or props is not a plain object.
 *
 * @example
 * // Basic element with id, class, and text
 * const label = createElement('label', {
 *     text: 'Word',
 *     id: 'word',
 *     class: 'form-label',
 * });
 *
 * @example
 * // Element with multiple classes
 * const status = createElement('span', {
 *     class: ['status-badge', 'status-success'],
 * });
 *
 * @example
 * // Element with i18n key (textContent applied by applyLanguage later)
 * const heading = createElement('h2', {
 *     text: getString('singular_heading'),
 *     i18n: {
 *         'data-i18n': 'singular_heading',
 *     },
 *     class: 'declension-heading',
 * });
 *
 * @example
 * // Element with i18n key and placeholder substitution
 * const pluralHeading = createElement('h2', {
 *     i18n: {
 *         'data-i18n': 'plural_heading_numbered',
 *         substitution: 2,
 *     },
 * });
 *
 * @example
 * // Input with localized placeholder text
 * const input = createElement('input', {
 *     i18n: {
 *         'data-i18n-placeholder': 'word_placeholder',
 *     },
 *     attrs: {
 *         type: 'text',
 *     },
 * });
 *
 * @example
 * // Element forcing shared dictionary lookup (skips view-specific lookup)
 * const sharedOnly = createElement('span', {
 *     i18n: {
 *         'data-i18n': 'app_title',
 *         forceShared: true,
 *     },
 * });
 *
 * @example
 * // Element forcing a specific view's dictionary (cross-view string)
 * const crossViewLabel = createElement('span', {
 *     i18n: {
 *         'data-i18n': 'title',
 *         forceView: 'noun-batch',
 *     },
 * });
 *
 * @example
 * // Element with arbitrary attributes and DOM properties
 * const checkbox = createElement('input', {
 *     attrs: {
 *         type: 'checkbox',
 *         id: 'include-rare-forms',
 *     },
 *     props: {
 *         checked: true,
 *         disabled: false,
 *     },
 * });
 *
 * @example
 * // Element with text, attributes, and i18n combined
 * const wordLabel = createElement('label', {
 *     text: getString('word_label', { viewId: VIEW_ID }),
 *     i18n: {
 *         'data-i18n': 'word_label',
 *     },
 *     attrs: {
 *         for: 'word-input',
 *     },
 * });
 */
export function createElement(tagName, options = {}) {
    // --- Argument validation -------------------------------------------
    if (typeof tagName !== 'string' || tagName.trim() === '') {
        throw new TypeError(
            `createElement: tagName must be a non-empty string. Received: ${typeof tagName}`
        );
    }

    // --- Destructure options with defaults -----------------------------
    const {
        text = '',
            html = '',
            // "class" is a reserved word in JavaScript, so it must be aliased
            // when destructured. classList holds the value of the "class" option.
            class: classList = null,
            id = null,
            i18n = {},
            attrs = {},
            props = {},
    } = options;

    // --- Validate option types -----------------------------------------
    if (typeof text !== 'string') {
        throw new TypeError(
            `createElement: text must be a string. Received: ${typeof text}`
        );
    }
    if (typeof html !== 'string') {
        throw new TypeError(
            `createElement: html must be a string. Received: ${typeof html}`
        );
    }
    if (typeof i18n !== 'object' || i18n === null || Array.isArray(i18n)) {
        throw new TypeError(
            `createElement: i18n must be a plain object. Received: ${Array.isArray(i18n) ? 'array' : typeof i18n}`
        );
    }
    if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
        throw new TypeError(
            `createElement: attrs must be a plain object. Received: ${Array.isArray(attrs) ? 'array' : typeof attrs}`
        );
    }
    if (typeof props !== 'object' || props === null || Array.isArray(props)) {
        throw new TypeError(
            `createElement: props must be a plain object. Received: ${Array.isArray(props) ? 'array' : typeof props}`
        );
    }

    // --- Content sanity check ------------------------------------------
    // text and html both set the element's content. They cannot both be
    // used. Warn and let text win.
    if (text && html) {
        console.warn(
            'createElement: text and html were both provided. ' +
            'text takes precedence; html will be ignored.'
        );
    }

    // --- Create the element --------------------------------------------
    const element = document.createElement(tagName);

    // --- Apply content -------------------------------------------------
    if (text) {
        element.textContent = text;
    } else if (html) {
        element.innerHTML = html;
    }

    // --- Apply top-level class and id ----------------------------------
    if (classList) {
        setClassAttribute(element, classList, 'class');
    }
    if (id) {
        element.setAttribute('id', id);
    }

    // --- Apply i18n configuration --------------------------------------
    if (Object.keys(i18n).length > 0) {
        /**
         * Get attributes user passed to i18n option.
         * Set options on the three special keys
         * (substitution, forceShared, forceView).
         * Remaining keys should be any arbitrary
         * data-i18n* attribute that the user wants
         * set (e.g. "data-i18n", "data-i18n-placeholder", etc)
         */
        const {
            substitution = null,
                forceShared = false,
                forceView = null,
        } = i18n;

        // Iterate all keys in i18n config. Anything that isn't a special
        // case (substitution, forceShared, forceView) is treated as a
        // data-i18n attribute name and set directly.
        const specialCases = new Set(['substitution', 'forceShared', 'forceView']);
        Object.entries(i18n)
            .filter(([attr]) => !specialCases.has(attr))
            .forEach(([attr, value]) => {
                if (!attr.startsWith('data-i18n')) {
                    console.error(
                        `createElement: i18n config contains invalid attribute "${attr}". ` +
                        `Only data-i18n attributes are allowed.`
                    );
                    return;
                }
                element.setAttribute(attr, value);
            });

        if (substitution !== null) {
            element.setAttribute(I18N_ARG_KEY, substitution);
        }

        if (forceShared) {
            element.setAttribute(I18N_SHARE_OVERRIDE_KEY, '');
        }

        if (forceView) {
            element.setAttribute(I18N_VIEW_OVERRIDE_KEY, forceView);
        }
    }

    // --- Apply arbitrary HTML attributes -------------------------------
    for (const [attr, value] of Object.entries(attrs)) {
        if (attr === 'class') {
            // class needs special handling because it can be a string or
            // an array of strings. All other attributes are set directly.
            setClassAttribute(element, value, 'attrs.class');
        } else {
            element.setAttribute(attr, value);
        }
    }

    // --- Apply direct DOM properties -----------------------------------
    for (const [prop, value] of Object.entries(props)) {
        element[prop] = value;
    }

    return element;
}

/**
 * Remove all children from a DOM element.
 *
 * @param {HTMLElement} element - The element to clear.
 * @throws {TypeError} If element is not an HTMLElement.
 */
export function clearElement(element) {
    if (!(element instanceof HTMLElement)) {
        throw new TypeError(
            `clearElement: element must be an HTMLElement. Received: ${element === null ? 'null' : typeof element}`
        );
    }

    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Dynamically load a CSS stylesheet by path.
 *
 * Used by views to lazy-load their view-specific CSS when first mounted.
 * Idempotent: loading the same stylesheet twice is a no-op.
 *
 * @param {string} href - Path to the CSS file, relative to the page.
 * @throws {TypeError} If href is not a non-empty string.
 */
export function loadStylesheet(href) {
    if (typeof href !== 'string' || href.trim() === '') {
        throw new TypeError(
            `loadStylesheet: href must be a non-empty string. Received: ${typeof href}`
        );
    }

    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}
