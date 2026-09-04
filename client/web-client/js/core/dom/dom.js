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
    I18N_EXCLUDE_KEY,
    I18N_SUBSTITUTIONS_KEY,
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
 * @param {string|string[]|null} [options.class=''] - CSS class(es) to
 *   apply. Accepts a string or array of strings. Sets the class attribute.
 *   If attrs.class is also provided, attrs.class takes precedence.
 * @param {string|null} [options.id=''] - Element ID. Sets the id
 *   attribute. If attrs.id is also provided, attrs.id takes precedence.
 * @param {Object} [options.i18n={}] - i18n configuration. Keys should be
 *   data-i18n attribute names (e.g., "data-i18n",
 *   "data-i18n-placeholder"). There are also three special keys: substitutions,
 *   forceShared, and forceView. Special keys are described below.
 * @param {Array|null} [options.i18n.exclusions=[]] - List of data-i18n attributes
 *   that the i18n system should ignore.
 * @param {Object|null} [options.i18n.substitutions={}] - Placeholder
 *   substitution data. Keyed by data-i18n attribute name. Serialized to
 *   JSON and set as data-i18n-substitutions.
 * @param {boolean} [options.i18n.forceShared=false] - If true, forces shared
 *   dictionary lookup. Sets data-i18n-force-shared.
 * @param {string|null} [options.i18n.forceView=''] - If set, forces lookup
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
 * @throws {TypeError} If text, html, id, or class is not the expected
 *   type.
 * @throws {TypeError} If i18n, attrs, or props is not a plain object.
 * @throws {TypeError} If i18n.substitutions is not a plain object.
 * @throws {TypeError} If i18n.forceShared is not a boolean.
 * @throws {TypeError} If i18n.forceView is not a string.
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
 *         substitutions: {
 *             'data-i18n': {
 *                 n: 2,
 *             },
 *         },
 *     },
 * });
 *
 * @example
 * // Element with no i18n attributes, but preemptively excluding
 * // data-i18n. If data-i18n is set later (by another part of the
 * // system), it will not be localized.
 * const pluralHeading = createElement('h2', {
 *     i18n: {
 *         exclusions: ['data-i18n'],
 *     },
 * });
 *
 * @example
 * // Element with data-i18n localized normally, but excluding all
 * // suffixed attributes (e.g., data-i18n-placeholder) from
 * // localization.
 * const pluralHeading = createElement('h2', {
 *     i18n: {
 *         'data-i18n': 'plural_heading_numbered',
 *         exclusions: ['data-i18n-.*'],
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
 */
export function createElement(tagName, options = {}) {
    // --- Argument validation -------------------------------------------
    if (typeof tagName !== 'string' || tagName.trim() === '') {
        throw new TypeError(
            `createElement: tagName must be a non-empty string. Received: ${typeof tagName}`
        );
    }

    // --- Destructure options ------------------------------------------
    const {
        text,
        html,
        // "class" is a reserved word in JavaScript, so it must be aliased
        // when destructured. classList holds the value of the "class" option.
        class: classList,
        id,
        i18n,
        attrs,
        props,
    } = options;

    // Normalize null and undefined options to default values.
    // (destructuring defaults only apply to undefined, not null;
    // ?? handles both null and undefined, both of which we're
    // treating as user doesn't want/needs default, so rely on that.)
    const resolvedText = text ?? '';
    const resolvedHtml = html ?? '';
    const resolvedClassList = classList ?? '';
    const resolvedId = id ?? '';
    const resolvedI18n = i18n ?? {};
    const resolvedAttrs = attrs ?? {};
    const resolvedProps = props ?? {};

    // --- Validate option types -----------------------------------------

    if (typeof resolvedText !== 'string') {
        throw new TypeError(
            `createElement: text must be a string. Received: ${typeof resolvedText}`
        );
    }
    if (typeof resolvedHtml !== 'string') {
        throw new TypeError(
            `createElement: html must be a string. Received: ${typeof resolvedHtml}`
        );
    }
    if (typeof resolvedId !== 'string') {
        throw new TypeError(
            `createElement: id must be a string. Received: ${typeof resolvedId}`
        );
    }
    if (typeof resolvedClassList !== 'string' && !Array.isArray(resolvedClassList)) {
        throw new TypeError(
            `createElement: class must be a string or an Array. Received: ${typeof resolvedClassList}`
        );
    }
    if (typeof resolvedI18n !== 'object' || Array.isArray(resolvedI18n)) {
        throw new TypeError(
            `createElement: i18n must be a plain object. Received: ${Array.isArray(resolvedI18n) ? 'array' : typeof resolvedI18n}`
        );
    }
    if (typeof resolvedAttrs !== 'object' || Array.isArray(resolvedAttrs)) {
        throw new TypeError(
            `createElement: attrs must be a plain object. Received: ${Array.isArray(resolvedAttrs) ? 'array' : typeof resolvedAttrs}`
        );
    }
    if (typeof resolvedProps !== 'object' || Array.isArray(resolvedProps)) {
        throw new TypeError(
            `createElement: props must be a plain object. Received: ${Array.isArray(resolvedProps) ? 'array' : typeof resolvedProps}`
        );
    }

    // --- Content sanity check ------------------------------------------
    // text and html both set the element's content. They cannot both be
    // used. Warn and let text win.
    if (resolvedText && resolvedHtml) {
        console.warn(
            'createElement: text and html were both provided. ' +
            'text takes precedence; html will be ignored.'
        );
    }

    // --- Create the element --------------------------------------------
    const element = document.createElement(tagName);

    // --- Apply content -------------------------------------------------
    if (resolvedText) {
        element.textContent = resolvedText;
    } else if (resolvedHtml) {
        element.innerHTML = resolvedHtml;
    }

    // --- Apply top-level class and id ----------------------------------
    if (resolvedClassList) {
        setClassAttribute(element, resolvedClassList, 'class');
    }
    if (resolvedId) {
        element.setAttribute('id', resolvedId);
    }

    // --- Apply i18n configuration --------------------------------------
    if (Object.keys(resolvedI18n).length > 0) {
        /**
         * Get attributes user passed to i18n option.
         * Set options on the special keys
         * (exclusions, substitutions, forceShared, forceView).
         * Remaining keys should be any arbitrary
         * data-i18n* attribute that the user wants
         * set (e.g. "data-i18n", "data-i18n-placeholder", etc)
         */
        const {
            exclusions,
            substitutions,
            forceShared,
            forceView,
        } = resolvedI18n;

        // Normalize null and undefined options to default values.
        // (destructuring defaults only apply to undefined, not null;
        // ?? handles both null and undefined, both of which we're
        // treating as user doesn't want/needs default, so rely on that.)
        const resolvedExclusions = exclusions ?? [];
        const resolvedSubstitutions = substitutions ?? {};
        const resolvedForceShared = forceShared ?? false;
        const resolvedForceView = forceView ?? '';

        // --- Validate option types -----------------------------------------

        if (!Array.isArray(resolvedExclusions)) {
            throw new TypeError(
                `createElement: options.i18n.exclusions must be an Array. Received: ${typeof resolvedExclusions}`
            );
        }
        if (typeof resolvedForceShared !== 'boolean') {
            throw new TypeError(
                `createElement: options.i18n.forceShared must be a boolean. Received: ${typeof resolvedForceShared}`
            );
        }
        if (typeof resolvedForceView !== 'string') {
            throw new TypeError(
                `createElement: options.i18n.forceView must be a string. Received: ${typeof resolvedForceView}`
            );
        }
        if (typeof resolvedSubstitutions !== 'object' || Array.isArray(resolvedSubstitutions)) {
            throw new TypeError(
                `createElement: options.i18n.substitutions must be a plain object. Received: ${Array.isArray(resolvedSubstitutions) ? 'array' : typeof resolvedSubstitutions}`
            );
        }

        // Iterate all keys in i18n config. Anything that isn't a special
        // case (exclusions, substitutions, forceShared, forceView) is treated as a
        // data-i18n attribute name and set directly.
        const specialCases = new Set(['exclusions', 'substitutions', 'forceShared', 'forceView']);
        Object.entries(resolvedI18n)
            .filter(([attr]) => !specialCases.has(attr))
            .forEach(([attr, value]) => {
                if (!attr.startsWith('data-i18n')) {
                    console.error(
                        `createElement: i18n config contains invalid attribute "${attr}". ` +
                        `Only data-i18n attributes are allowed.`
                    );
                    return;
                }
                // skip null or undefined value (e.g. user accidentally
                // set 'data-i18n': null
                if (value == null) return;

                element.setAttribute(attr, value);
            });

        /**
         * 'exclusions' should be an Array of strings --
         * data-i18n attributes that should be excluded by
         * the i18n localization system.
         * Regex strings are allowed e.g., exclusions=["data-i18n-*"]
         */
        if (resolvedExclusions.length > 0) {
            for (const attr of resolvedExclusions) {
                if (typeof attr !== 'string') {
                    throw new TypeError(
                        `createElement: Invalid entry in options.i18n.exclusions. ` +
                        `Expected array of strings. ` +
                        `Received: ${String(attr)} (type: ${typeof attr})`
                    );
                }
            }

            // Serialize the validated array into a JSON string
            const serializedExclude = JSON.stringify(resolvedExclusions);
            element.setAttribute(I18N_EXCLUDE_KEY, serializedExclude);
        }

        /**
         * 'substitutions' provides values for {placeholders} used in
         * localized strings. It is keyed by the data-i18n attribute
         * whose string should receive the substitutions. It gets
         * serialized to JSON and set as data-i18n-substitutions on the element.
         * Example. This is what's passed to createElement:
         *
         * i18n: {
         *       'data-i18n': 'file_summary',
         *       substitutions: {
         *             'data-i18n': {
         *                 categories: 2,
         *                 words: 3,
         *             },
         *       },
         * },
         *
         * The object at 'substitutions' will be serialized to JSON and
         * set on the created element as a data-i18n-substitutions attribute.
         *
         * For this element, the i18n system will take the localized string
         * requested by its data-i18n attribute and substitute placeholder
         * values in the string. e.g.:
         *
         * 1. HTML element:
         *         <span data-i18n="file_summary"
         *            data-i18n-substitutions='{"data-i18n": {"categories":2, "words":3}}'>
         *        </span>
         * 2. Corresponding localization dictionary entry:
         *        "file_summary": "{categories} categories and {words} words"
         * 3. Final textContent in element after i18n applyLanguage:
         *         <span ...>"2 categories and 3 words"</span>
         */
        if (resolvedSubstitutions && Object.keys(resolvedSubstitutions).length > 0) {
            element.setAttribute(I18N_SUBSTITUTIONS_KEY, JSON.stringify(resolvedSubstitutions));
        }

        if (resolvedForceShared) {
            element.setAttribute(I18N_SHARE_OVERRIDE_KEY, '');
        }

        if (resolvedForceView) {
            element.setAttribute(I18N_VIEW_OVERRIDE_KEY, resolvedForceView);
        }
    }

    // --- Apply arbitrary HTML attributes -------------------------------
    for (const [attr, value] of Object.entries(resolvedAttrs)) {
        // skip null and undefined values
        if (value == null) continue;

        if (attr === 'class') {
            // class needs special handling because it can be a string or
            // an array of strings. All other attributes are set directly.
            setClassAttribute(element, value, 'attrs.class');
        } else {
            element.setAttribute(attr, value);
        }
    }

    // --- Apply direct DOM properties -----------------------------------
    for (const [prop, value] of Object.entries(resolvedProps)) {
        // skip null and undefined values
        if (value == null) continue;

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