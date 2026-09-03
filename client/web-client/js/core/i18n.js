/**
 * Ruslovar API Demo — Internationalization (i18n) Module
 *
 * Provides string lookup and DOM text updates for all views. This module
 * is a lookup service over the view registry; it does not maintain its
 * own store of view strings. View strings live on view descriptors in
 * core/view-registry.js.
 *
 * Responsibilities:
 *   - Maintain shared strings used across multiple views.
 *   - Resolve dot-notation keys (e.g., "case_labels.nominative").
 *   - Resolve view-specific strings by referencing the view registry.
 *   - Apply the active language to [data-i18n] elements in place.
 *   - Handle placeholder substitution via [data-i18n-substitutions].
 *   - Surface lookup failures loudly to aid debugging.
 *
 * Dependencies:
 *   - core/view-registry.js (getViewById)
 *   - core/utils/template-engine.js (TemplateEngine)
 */

import {
    getViewById
} from './view-registry.js';

import {
    TemplateEngine
} from './utils/template-engine.js';

/*
 * Delimiters for template placeholders in localized strings.
 * Placeholders in string templates are wrapped with these
 * delimiters (e.g., "Found {count} words"). These constants are
 * passed to the TemplateEngine so that both the engine and the
 * i18n module agree on the placeholder syntax.
 */
export const I18N_TEMPLATE_OPEN_DELIM = "{";
export const I18N_TEMPLATE_CLOSE_DELIM = "}";

/*
 * ==============================================================
 * "Special" HTML attributes used by i18n module (and others)
 * to induce specific behaviors. e.g.,
 * - which localization dictionary standard i18n attributes (such
 *   as data-i18n, data-i18n-placeholder) should resolve their
 *   values against (shared or view-specific)
 * - placeholder data
 * ==============================================================
 */

/*
 * Attr used to provide values for {placeholders} in localized strings.
 *
 * The value is a JSON object. Each key is an i18n attribute name
 * (e.g., "data-i18n"). Each value is an object of {placeholder}
 * substitutions for the localized string the attribute's value
 * resolves to.
 *
 * Example:
 *   <h2 data-i18n="plural_heading_numbered"
 *       data-i18n-placeholder="word_placeholder"
 *       data-i18n-substitutions='{"data-i18n": {"n": 2}, "data-i18n-placeholder": {"word": "слово"}}'>
 *
 *   Relevant entries in localization dictionary:
 *     "plural_heading_numbered": "Plural {n}"
 *     "word_placeholder": "Enter {word}"
 *
 *   Resulting strings after applyLanguage:
 *     textContent: "Plural 2"
 *     placeholder: "Enter слово"
 */
export const I18N_SUBSTITUTIONS_KEY = "data-i18n-substitutions";

/*
 * Attr used to indicate which view is currently mounted. Holds
 * the ID of the view.
 *
 * - When shell mounts a new view, it sets this attribute on the
 *   container the view is mounted into.
 * - Attribute's value is the view's unique ID.
 * - For elements in the container with i18n attributes, applyLanguage
 *   will look up the key specified by the attribute in the view's
 *   localization dictionary first (if no override exists), and only
 *   if not found will look up key in shared dictionary.
 *
 * Example:
 *   <div id="mount-container" data-i18n-view="noun-single">
 *   	...
 *   	<span data-i18n="title"></span>
 *   ApplyLanguage will look up the "title" key in "noun-single"'s
 *   localization dictionary first. If no result found there, will
 *   fallback to shared dictionary below.
 */
export const I18N_VIEW_KEY = "data-i18n-view";

/*
 * Attr to force lookup in a specific view's dictionary. Holds the
 * ID of the view to use.
 *
 * Example:
 * 	 <span data-i18n="title" data-i18n-force-view="noun-batch">
 *
 * 	 ApplyLanguage will look up the "title" key in "noun-batch"'s
 * 	 localization dictionary, regardless of which view the span
 * 	 belongs to. If no result found there, will fallback to
 * 	 shared dictionary below.
 */
export const I18N_VIEW_OVERRIDE_KEY = "data-i18n-force-view";

/*
 * Attribute that can be set on an element to force use of the shared
 * dictionary. View-specific lookup is skipped.
 *
 * Example:
 * 	 <span data-i18n="title" data-i18n-force-shared></span>
 *
 * 	 ApplyLanguage will look up the "title" key in the shared
 * 	 localization dictionary below, regardless of which view is
 * 	 mounted, or which view this element is part of (if any).
 */
export const I18N_SHARE_OVERRIDE_KEY = "data-i18n-force-shared";

/*
 * ==============================================================
 * HANDLER REGISTRY FOR I18N ATTRIBUTES
 * ==============================================================
 */

/*
 * Maps specific i18n attributes to functions that apply a resolved
 * value to an element.
 *
 * The handler receives the element and the resolved string. It is
 * responsible for writing that string to the DOM in whatever way is
 * appropriate for that attribute.
 *
 *   data-i18n-title="some_key"  →  element.setAttribute('title', value)
 *   data-i18n-aria-label="x"    →  element.setAttribute('aria-label', value)
 */
const I18N_ATTRIBUTE_HANDLERS = {
    "data-i18n": (element, value) => {
        element.textContent = value;
    },
    "data-i18n-placeholder": (element, value) => {
        element.setAttribute('placeholder', value);
    },
    "data-i18n-aria-label": (element, value) => {
        element.setAttribute('aria-label', value);
    },
};

/*
 * ==============================================================
 * SHARED LOCALIZATION DICTIONARY (values shared by all views)
 * ==============================================================
 */

/**
 * Shared UI strings used across multiple views (case labels, gender
 * values, common headings, error messages, etc.).
 *
 * @typedef {Object} I18nStringTable
 * @property {Object<string, Object<string, string>>} [namespace] -
 *     String tables for each supported language. Keys use dot notation
 *     for nested objects.
 */
const SHARED_STRINGS = {
    ru: {
        page_title: 'Веб-клиент Ruslovar',
        select_language: 'Выбор языка',
        select_demo: "Выбрать представление",
        case_labels: {
            nominative: 'Именительный',
            genitive: 'Родительный',
            dative: 'Дательный',
            accusative: 'Винительный',
            instrumental: 'Творительный',
            prepositional: 'Предложный',
        },
        gender_values: {
            'муж': 'мужской',
            'жен': 'женский',
            'ср': 'средний',
            'общ': 'общий',
        },
        singular_heading: 'Единственное число',
        plural_heading: 'Множественное число',
        plural_heading_numbered: 'Множественное число {n}',
        gender_label: 'Род',
        animacy_label: 'Одушевлённость',
        animacy_animate: 'одуш',
        animacy_inanimate: 'неодуш',
        invariant_label: 'Неизменяемое',
        match_label: 'Вариант {n}',
        strict_label: 'Строгий режим',
        submit_button: 'Показать склонения',
        raw_json_heading: 'Исходный JSON',
        status_success: 'Успешно',
        status_error: 'Ошибка',
        error_network: 'Ошибка соединения с API.',
        error_unknown: 'Произошла неизвестная ошибка.',
        error_view_failed: 'Ошибка загрузки представления',
        error_view_failed_hint: 'Попробуйте выбрать другое представление.',
    },
    en: {
        page_title: 'Ruslovar Web Client',
        select_language: 'Language selection',
        select_demo: "Select View",
        case_labels: {
            nominative: 'Nominative',
            genitive: 'Genitive',
            dative: 'Dative',
            accusative: 'Accusative',
            instrumental: 'Instrumental',
            prepositional: 'Prepositional',
        },
        gender_values: {
            'муж': 'masculine',
            'жен': 'feminine',
            'ср': 'neuter',
            'общ': 'common',
        },
        singular_heading: 'Singular',
        plural_heading: 'Plural',
        plural_heading_numbered: 'Plural {n}',
        gender_label: 'Gender',
        animacy_label: 'Animacy',
        animacy_animate: 'animate',
        animacy_inanimate: 'inanimate',
        invariant_label: 'Invariant',
        match_label: 'Match {n}',
        strict_label: 'Strict mode',
        submit_button: 'Show declensions',
        raw_json_heading: 'Raw JSON',
        status_success: 'Success',
        status_error: 'Error',
        error_network: 'Could not connect to the API.',
        error_unknown: 'An unknown error occurred.',
        error_view_failed: 'View failed to load',
        error_view_failed_hint: 'Try selecting a different view.',
    },
};

/**
 * Supported language codes.
 */
export const SUPPORTED_LANGUAGES = ['ru', 'en'];

/**
 * Default language when no preference has been saved.
 */
const DEFAULT_LANGUAGE = 'ru';

/**
 * localStorage key for the user's language preference.
 */
const STORAGE_KEY = 'demo_language';

/**
 * Currently active language code.
 *
 * @type {string}
 */
let currentLanguage = DEFAULT_LANGUAGE;

/**
 * Retrieve a value from a nested object using dot notation.
 *
 * Example:
 *   getNestedValue(SHARED_STRINGS.en, "case_labels.nominative")
 *     → "Nominative"
 *
 *   getNestedValue(SHARED_STRINGS.en, "case_labels.accusative")
 *     → undefined (key does not exist)
 *
 * @param {Object} obj - The object to search.
 * @param {string} path - Dot-separated key path (e.g., "a.b.c").
 * @returns {*} The value at the path, or undefined if any intermediate
 *     key is missing or if the path cannot be traversed.
 */
function getNestedValue(obj, path) {
    // Split the dot-notation path into individual key segments.
    // Example: "case_labels.nominative" → ["case_labels", "nominative"]
    const segments = path.split('.');

    // Start at the root of the object we're searching.
    let current = obj;

    // Walk down the object one level at a time.
    for (const segment of segments) {
        // can't descend further. (e.g., trying to access "nominative" on undefined.)
        if (!current || typeof current !== 'object') {
            return undefined;
        }
        // Descend into the next level of the object.
        // Example: current is { nominative: 'Именительный' },
        // segment is "nominative", so current becomes 'Именительный'.
        current = current[segment];
    }
    // After processing all segments, current is the value at the path.
    // Example: current is 'Именительный' after walking
    // ["case_labels", "nominative"].
    return current;
}

/**
 * Return the currently active language code.
 *
 * @returns {string} "ru" or "en".
 */
export function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * Set the active language, persist it, and update the UI.
 *
 * @param {string} lang - Language code ("ru" or "en").
 */
export function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;

    currentLanguage = lang;
    localStorage.setItem(STORAGE_KEY, lang);

    applyLanguage(lang);
}

/**
 * Restore the saved language preference from localStorage.
 *
 * Called once during bootstrap. If no preference is saved, the default
 * language is used.
 */
export function restoreLanguagePreference() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(saved)) {
        currentLanguage = saved;
    }
}

/**
 * Resolve a localized string.
 *
 * This is the single entry point for all string lookups. It handles
 * both shared strings and view-specific strings.
 *
 * If a viewId is provided, the string is resolved against that view's
 * strings (stored on the view descriptor in the view registry).
 * Otherwise, the string is resolved against the shared strings table.
 *
 * @param {string} key - Dot-notation key (e.g., "case_labels.nominative").
 * @param {Object} [options] - Lookup options.
 * @param {string} [options.viewId] - If provided, resolve against this
 *     view's strings instead of shared strings.
 * @param {string} [options.lang=currentLanguage] - Language code to look up.
 * @param {boolean} [options.logErrorIfNotFound=true] - If can't resolve, console.error
 * @returns {string|undefined} The resolved string, or undefined if not found.
 */
export function getString(key, {
    viewId = null,
    lang = currentLanguage,
    logErrorIfNotFound = true
} = {}) {
    // Validate key (the i18n key to lookup) is a non-empty string.
    if (typeof key !== 'string' || key.length === 0) {
        console.error(
            `i18n.getString: Invalid key argument. Expected non-empty string, received:`,
            key
        );
        return undefined;
    }

    // Validate lang is one of the supported language codes.
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.error(
            `i18n.getString: Unsupported language. Expected one of ${SUPPORTED_LANGUAGES.join(', ')}, received:`,
            lang
        );
        return undefined;
    }

    // Determine which string table to search. View-specific strings are
    // stored on the view descriptor in the view registry; shared strings
    // live in this module.
    let stringTable;
    let sourceLabel; // Used in error messages to identify the lookup source.

    if (viewId) {
        const view = getViewById(viewId);

        if (!view) {
            console.error(`i18n.getString: View "${viewId}" is not registered`);
            return undefined;
        }

        if (!view.strings || !view.strings[lang]) {
            console.error(
                `i18n.getString: View "${viewId}" has no strings for language "${lang}"`
            );
            return undefined;
        }

        stringTable = view.strings[lang];
        sourceLabel = `view "${viewId}"`;
    } else {
        // Validate the shared string table exists for this language.
        if (!SHARED_STRINGS[lang]) {
            console.error(
                `i18n.getString: No shared string table exists for language "${lang}"`
            );
            return undefined;
        }

        stringTable = SHARED_STRINGS[lang];
        sourceLabel = 'shared strings';
    }

    // Perform the nested key lookup once, regardless of source.
    const value = getNestedValue(stringTable, key);

    if (value === undefined && logErrorIfNotFound) {
        console.error(
            `i18n.getString: Key "${key}" not found in ${sourceLabel} for language "${lang}"`
        );
    }

    return value;
}

/**
 * Apply template substitutions to a resolved i18n string.
 *
 * Checks for the data-i18n-substitutions attribute on the element. If absent,
 * returns the template unchanged. If present, parses the JSON,
 * extracts the substitution values for the target attribute, and
 * delegates to the TemplateEngine.
 *
 * @param {string} template - The resolved i18n string, possibly
 *     containing placeholders.
 * @param {HTMLElement} element - The element carrying data-i18n-substitutions.
 * @param {string} targetAttribute - The i18n attribute being processed
 *     (e.g., "data-i18n" or "data-i18n-placeholder"). Used to extract
 *     the correct substitution values from the JSON wrapper.
 * @returns {string} The final string with substitutions applied. If
 *     no data-i18n-substitutions is present, or errors occur, returns the
 *     original template unchanged.
 */
function applyI18nTemplateValues(template, element, targetAttribute) {
    const rawJsonString = element.getAttribute(I18N_SUBSTITUTIONS_KEY);

    // No substitutions requested.
    if (rawJsonString === null) {
        return template;
    }

    // Common context for all error messages below.
    const errorContext =
        `  Element: ${element.outerHTML}\n` +
        `  Attribute: ${targetAttribute}\n` +
        `  Template: "${template}"\n` +
        `  ${I18N_SUBSTITUTIONS_KEY}: ${rawJsonString}`;

    // Parse the JSON wrapper.
    let templateValues;
    try {
        templateValues = JSON.parse(rawJsonString);
    } catch (e) {
        console.error(
            `i18n.applyI18nTemplateValues: Invalid JSON in ${I18N_SUBSTITUTIONS_KEY}.\n` +
            `  ${errorContext}\n` +
            `  Error: ${e.message}`
        );
        return template;
    }

    // Wrapper must be a plain object.
    if (typeof templateValues !== 'object' || templateValues === null || Array.isArray(templateValues)) {
        console.error(
            `i18n.applyI18nTemplateValues: ${I18N_SUBSTITUTIONS_KEY} must parse to a JSON object.\n` +
            `  ${errorContext}`
        );
        return template;
    }

    // Extract the substitution values for this attribute.
    const values = templateValues[targetAttribute];

    // No values for this attribute — nothing to substitute.
    if (values === undefined) {
        return template;
    }

    // Values must be a plain object.
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
        console.error(
            `i18n.applyI18nTemplateValues: Values for "${targetAttribute}" must be a JSON object.\n` +
            `  ${errorContext}`
        );
        return template;
    }

    // Delegate to the template engine.
    const engine = new TemplateEngine({
        openDelim: I18N_TEMPLATE_OPEN_DELIM,
        closeDelim: I18N_TEMPLATE_CLOSE_DELIM
    });
    const result = engine.apply(template, values);

    // Log any errors.
    if (result.errors.length > 0) {
        console.error(
            `i18n.applyI18nTemplateValues: Template substitution failed.\n` +
            `  ${errorContext}\n` +
            `  Errors:\n` +
            result.errors.map(e => `    - ${e}`).join('\n')
        );
    }

    // Log any warnings.
    if (result.warnings.length > 0) {
        console.warn(
            `i18n.applyI18nTemplateValues: Template substitution warnings.\n` +
            `  ${errorContext}\n` +
            `  Warnings:\n` +
            result.warnings.map(w => `    - ${w}`).join('\n')
        );
    }

    return result.value;
}

/**
 * Resolve a localized string for an element, attempting view-specific
 * lookup first and falling back to shared strings when necessary.
 *
 * The key and optional view scope are read from the element's attributes.
 * The i18n_attr parameter specifies which attribute contains the
 * dot-notation key (e.g., "data-i18n" or "data-i18n-placeholder").
 *
 * If the element has a data-i18n-view attribute, the key is first resolved
 * against that view's strings. If not found there, shared strings are
 * checked as a fallback. Elements without data-i18n-view resolve against
 * shared strings only.
 *
 * @param {HTMLElement} element - The element to resolve the string for.
 * @param {string} i18n_attr - The attribute containing the dot-notation
 *     i18n key (e.g., "data-i18n").
 * @param {string} lang - Language code to look up ("ru" or "en").
 * @returns {string|undefined} The resolved string, or undefined if the
 *     element is invalid, the key is missing, or the key cannot be
 *     resolved in either the view-specific or shared string tables.
 */
export function resolveElementI18nValue(element, i18n_attr, lang) {
    // Validate element is an HTMLElement.
    if (!(element instanceof HTMLElement)) {
        console.error(
            `i18n.resolveElementI18nValue: Invalid element argument. Expected HTMLElement, received:`,
            element
        );
        return;
    }

    // Validate i18n_attr is a non-empty string.
    if (typeof i18n_attr !== 'string' || i18n_attr.length === 0) {
        console.error(
            `i18n.resolveElementI18nValue: Invalid i18n_attr argument. Expected non-empty string, received:`,
            i18n_attr
        );
        return;
    }

    // Validate lang is one of the supported language codes.
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.error(
            `i18n.resolveElementI18nValue: Unsupported language. Expected one of ${SUPPORTED_LANGUAGES.join(', ')}, received:`,
            lang
        );
        return;
    }

    // Get key from requested i18n attr ("data-i18n").
    const key = element.getAttribute(i18n_attr);

    // Validate that the i18n attribute exists and contains a non-empty value.
    if (!key || key.length === 0) {
        console.warn(
            `i18n.resolveElementI18nValue: Element is missing "${i18n_attr}" attribute or it is empty.`,
            element
        );
        return;
    }

    /**
     * String resolution precedence:
     *
     * 1. If data-i18n-force-shared is present → shared dictionary only.
     * 2. Else if data-i18n-force-view is present → use that view's dictionary.
     * 3. Else if data-i18n-view found on ancestor → use that view's dictionary.
     * 4. Else → shared dictionary.
     */

    if (element.hasAttribute(I18N_VIEW_OVERRIDE_KEY) && element.hasAttribute(I18N_SHARE_OVERRIDE_KEY)) {
        console.error(
            `i18n.resolveElementI18nValue: Element has both '${I18N_VIEW_OVERRIDE_KEY}' and '${I18N_SHARE_OVERRIDE_KEY}'`,
            element
        );
    }

    // Get current loaded view. Set by shell on view's mount container during mount.
    // Should be present unless element outside mounted container (e.g. page title, etc.)
    const currViewId = element.closest(`[${I18N_VIEW_KEY}]`)?.getAttribute(I18N_VIEW_KEY);

    // Check for data-i18n-force-view (to force lookup in a specific view's dictionary)
    const forcedViewId = element.getAttribute(I18N_VIEW_OVERRIDE_KEY);

    // Check for data-i18n-force-shared (to force shared string)
    const forceShared = element.hasAttribute(I18N_SHARE_OVERRIDE_KEY);

    const viewIdToCheck = forcedViewId || currViewId;

    // Will use shared if 1. force override, or 2. no view key (e.g. regular DOM)
    let useSharedString = true;
    let value = null;

    if (viewIdToCheck && !forceShared) {
        // try to find view specific key
        value = getString(key, {
            viewId: viewIdToCheck,
            lang: lang,
            // don't error if no view specific
            // string as no guarantee there is one
            logErrorIfNotFound: false
        });
        useSharedString = false;

        if (value === undefined) {
            // Fall back to shared.
            useSharedString = true;
        }
    }

    if (useSharedString) {
        // Shared lookup only.
        value = getString(key, {
            lang: lang
        });
    }

    // Could not resolve the key in either shared or view lookup.
    if (value === undefined) {
        console.error(
            `i18n.resolveElementI18nValue: Could not find a string for key "${key}".\n` +
            ` • View ID found on closest ancestor with '${I18N_VIEW_KEY}': ${currViewId}\n` +
            ` • View ID the element explicitly asked to use (via '${I18N_VIEW_OVERRIDE_KEY}'): ${forcedViewId}\n` +
            ` • Element forced to use common strings, not view strings? ('${I18N_SHARE_OVERRIDE_KEY}'): ${forceShared}\n` +
            ` • View ID the system ultimately checked for this key: ${viewIdToCheck}\n` +
            ` • Shared dictionary ultimately used to get string?: ${useSharedString}`,
            element
        );
        return;
    }

    // Perform placeholder substitutions if data-i18n-substitutions is present.
    value = applyI18nTemplateValues(value, element, i18n_attr);

    return value;
}

/**
 * Collect all elements matching the given CSS selector, among
 * a root and its descendants.
 *
 * querySelectorAll only searches descendants of the root, not the
 * root itself. This helper also checks whether the root matches the
 * selector and includes it in the returned list if so.
 *
 * @param {Element|Document|DocumentFragment} root - The element or document to search.
 * @param {string} selector - Any valid CSS selector.
 * @returns {Element[]} Matching elements, including the root if it matches.
 */
function querySelectorAllIncludingRoot(root, selector) {
    // Validate root is queryable.
    if (!root || typeof root.querySelectorAll !== 'function') {
        console.error(
            `querySelectorAllIncludingRoot: Invalid root argument. ` +
            `Expected an element, document, or document fragment with querySelectorAll, received:`,
            root
        );
        return [];
    }

    // Validate selector is a string.
    if (typeof selector !== 'string') {
        console.error(
            `querySelectorAllIncludingRoot: Invalid selector argument. ` +
            `Expected a non-empty CSS selector string, received:`,
            selector
        );
        return [];
    }

    // Reject selectors that are empty or contain only whitespace.
    // (matches will throw an error on empty strings)
    selector = selector.trim();
    if (selector === '') {
        console.error(
            `querySelectorAllIncludingRoot: Invalid selector argument. ` +
            `Expected a non-empty CSS selector string, received an empty or whitespace-only string.`
        );
        return [];
    }

    const matches = [];

    // Does the root itself match? If so, include it.
    // (Guard against root = document which has no matches method.)
    if (root.matches && root.matches(selector)) {
        matches.push(root);
    }

    // Include all matching descendants.
    matches.push(...root.querySelectorAll(selector));

    return matches;
}

/**
 * Apply the given language to an element.
 *
 * For elements with [data-i18n-view], the string is resolved against
 * that view's strings. If not found there, a warning is logged and the
 * shared strings are checked as a fallback. Elements without
 * [data-i18n-view] resolve against shared strings only.
 *
 * @param {HTMLElement} element - element to apply language to.
 * @param {string} lang - Language code to apply.
 */
export function applyLanguageToElement(element, lang) {
    // Validate lang is one of the supported language codes.
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.error(
            `i18n.applyLanguageToElement: Unsupported language. Expected one of ${SUPPORTED_LANGUAGES.join(', ')}, received:`,
            lang
        );
        return;
    }

    // Validate element is an HTMLElement.
    // Document and DocumentFragment are intentionally not supported:
    // they have no attributes to set. The wrapper (applyLanguage) only
    // supports them as you can call querySelectorAll on them and pass
    // their descendants here.
    if (!(element instanceof HTMLElement)) {
        console.error(
            `i18n.applyLanguageToElement: Invalid element argument. Expected HTMLElement, received:`,
            element
        );
        return;
    }

    /**
     * Loop through each of the supported
     * data-i18n attributes. If this element
     * has that attribute, get the resolved
     * value and execute the callback for that
     * attribute (which indicates how to apply
     * the resolved value onto the element)
     */
    for (const [attribute, handler] of Object.entries(I18N_ATTRIBUTE_HANDLERS)) {
        if (!element.hasAttribute(attribute)) continue;

        const value = resolveElementI18nValue(element, attribute, lang);
        if (value !== undefined) {
            // callback function defined for this attribute
            // which shows how to apply the value to the
            // element (e.g. set a specific attribute, set
            // textContent, и т.д.)
            handler(element, value);
        }
    }

    // Update the document language attribute for screen
    // readers if element is the <html> element.
    if (element === document.documentElement) {
        document.documentElement.lang = lang;
    }
}

/**
 * Apply the given language to all [data-i18n] and
 * [data-i18n-placeholder] elements within the specified root.
 *
 * The root element itself is included in the search if it matches,
 * not just its descendants.
 *
 * For elements with [data-i18n-view], the string is resolved against
 * that view's strings. If not found there, a warning is logged and the
 * shared strings are checked as a fallback. Elements without
 * [data-i18n-view] resolve against shared strings only.
 *
 * @param {string} lang - Language code to apply.
 * @param {Object} [root=document] - Any queryable DOM node (e.g.,
 *     HTMLElement, Document, DocumentFragment). Defaults to the
 *     entire document. The root is checked for matches in addition
 *     to its descendants.
 */
export function applyLanguage(lang, root = document) {
    // Validate lang is one of the supported language codes.
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.error(
            `i18n.applyLanguage: Unsupported language. Expected one of ${SUPPORTED_LANGUAGES.join(', ')}, received:`,
            lang
        );
        return;
    }

    // Validate root is queryable. Rather than checking specific types
    // (HTMLElement, DocumentFragment, etc.), we check for querySelectorAll.
    // This accepts any valid DOM root.
    if (!root || typeof root.querySelectorAll !== 'function') {
        console.error(
            `i18n.applyLanguage: Invalid root argument. Expected an element or document with querySelectorAll, received:`,
            root
        );
        return;
    }

    // Query all elements under root (including root), then let
    // applyLanguageToElement decide which ones need localization.
    const allElements = querySelectorAllIncludingRoot(root, '*');
    allElements.forEach((element) => {
        applyLanguageToElement(element, lang);
    });
}

/**
 * Start automatic localization of dynamically added DOM elements.
 *
 * Watches the document for newly added elements. When a new subtree
 * is inserted, calls applyLanguage the current language to any elements within it
 * that carry data-i18n attributes by calling apply.
 *
 * The observer watches childList changes on document.body and its
 * descendants. Views and renderers that build detached DOM trees and
 * append them once will trigger a single observation for the new
 * container.
 *
 * @returns {MutationObserver} The active observer instance.
 */
export function startAutoLocalization() {
    // create MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
        /**
         * callback that fires on DOM change of watched element
         *
         * mutations: Array of MuationRecord objects for each change
         * (addedNodes, etc.). The browser can lump multiple changes
         * together
         */
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                // Only process element nodes (e.g. <h2>, <span>)
                // (.addedNodes can also include text nodes, comments,
                // etc., which don't have data-i18n attributes.)
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue;
                }

                // Localize the added element and all its descendants.
                applyLanguage(getCurrentLanguage(), node);
            }
        }
    });

    // monitor entire document body, as there's
    // elements outside of view which still need
    // to be localized.
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    return observer;
}