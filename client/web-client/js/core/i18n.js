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
 *   - Handle placeholder substitution via [data-i18n-arg].
 *   - Surface lookup failures loudly to aid debugging.
 *
 * Dependencies:
 *   - core/view-registry.js (getViewById)
 */

import {
    getViewById
} from './view-registry.js';

/*
 * ==============================================================
 * HTML data attributes to indicate which key to look up in a
 * localization dictionary, and how the key's value should be applied.
 * ==============================================================
 */

/*
 * Attr to indicate which key to look up in a locatlization dictionary.
 * Key's value in dictionary (if found) will be set as element's
 * textContent during applyLanguage
 *
 * Example:
 *   <span data-i18n="language_label"></span>
 *   applyLanguage look up "language_label" in localization dictionary
 *   at specified language and set textContent to
 */
export const I18N_KEY = "data-i18n";

/*
 * Attr used to provide an argument for placeholder substitution in a
 * localized string.
 *
 * Example:
 *   <h2 data-i18n="plural_heading_numbered" data-i18n-arg="2">
 *   Relevant entry in localzation dictionary:
 *   	"plural_heading_numbered": "Plural {n}"
 *   Resulting string after applyLanguage: "Plural 2"
 */
export const I18N_ARG_KEY = "data-i18n-arg";

/*
 * Attr to indicate which key to look up in a localization dictionary.
 * Key's value in dictionary (if found) will be set as element's
 * placeholder attribute (instead of its text content).
 *
 * Example:
 *   <input data-i18n-placeholder="word_placeholder">
 *   applyLanguage sets input.placeholder to the localized value.
 */
export const I18N_PLACEHOLDER_KEY = "data-i18n-placeholder";



/**
 * data-* attributes used to resolve i18n keys.
 *
 * These attributes determine where a localized string ultimately
 * comes from: the shared dictionary below, or a view-specific
 * dictionary.
 */

// Attr set by the shell on a view's mount container when it's mounted.
// Holds the view's ID. i18n string lookup will use this view's
// strings if the attr is present and no other override exists.
//
// Note: not always present. Example: the page title is not inside
// a mounted view, so it has no mount container. In that case,
// the shared dictionary is always used.
export const I18N_VIEW_KEY = "data-i18n-view";

// Attr that can be set on an element to force lookup in a specific
// view's dictionary. Holds the ID of the view to use.
export const I18N_VIEW_OVERRIDE_KEY = "data-i18n-force-view";

// Attr that can be set on an element to force use of the shared
// dictionary for that element. View-specific lookup is skipped.
export const I18N_SHARE_OVERRIDE_KEY = "data-i18n-force-shared";

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
        page_title: 'Демонстрация склонений',
        language_label: 'Выбор языка',
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
    },
    en: {
        page_title: 'Declension Demo',
        language_label: 'Language selection',
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

    return value;
}

/**
 * Apply the given language to all [data-i18n] and
 * [data-i18n-placeholder] elements in the document.
 *
 * For elements with [data-i18n-view], the string is resolved against
 * that view's strings. If not found there, a warning is logged and the
 * shared strings are checked as a fallback. Elements without
 * [data-i18n-view] resolve against shared strings only.
 *
 * @param {string} lang - Language code to apply.
 */
export function applyLanguage(lang) {
    // Update elements with text content.
    document.querySelectorAll(`[${I18N_KEY}]`).forEach((element) => {
        let value = resolveElementI18nValue(element, I18N_KEY, lang);
        if (value !== undefined) {
            // Apply placeholder substitution if needed.
            const arg = element.getAttribute(I18N_ARG_KEY);
            if (arg !== null && typeof value === 'string') {
                value = value.replace('{n}', arg);
            }
            element.textContent = value;
        }
    });

    // Update elements with placeholder attributes.
    document.querySelectorAll(`[${I18N_PLACEHOLDER_KEY}]`).forEach((element) => {
        const value = resolveElementI18nValue(element, I18N_PLACEHOLDER_KEY, lang);
        if (value !== undefined) {
            element.setAttribute('placeholder', value);
        }
    });

    // Update the document language attribute for screen readers.
    document.documentElement.lang = lang;
}