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
 *   getNestedValue({ a: { b: 1 } }, "a.b") → 1
 *
 * @param {Object} obj - The object to search.
 * @param {string} path - Dot-separated key path.
 * @returns {*} The value at the path, or undefined if any intermediate
 *     key is missing or null.
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => {
        return acc && typeof acc === 'object' ? acc[key] : undefined;
    }, obj);
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
 * @returns {string|undefined} The resolved string, or undefined if not found.
 */
export function getString(key, {
    viewId = null,
    lang = currentLanguage
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

    if (value === undefined) {
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
 * @param {string} key - Dot-notation key to resolve (e.g.,
 *     "case_labels.nominative").
 * @param {string} lang - Language code to look up ("ru" or "en").
 * @param {string|null} [viewId=null] - Optional view ID to scope the
 *     lookup. If null or empty, the key resolves against shared strings
 *     only. If provided and the key is not found in that view's strings,
 *     a warning is logged and shared strings are checked as a fallback.
 * @returns {string|undefined} The resolved string, or undefined if not
 *     found in either the view-specific or shared string tables.
 */
export function resolveI18nValue(key, lang, viewId) {
    // Validate key (the i18n key to lookup) is a non-empty string.
    if (typeof key !== 'string' || key.length === 0) {
        console.error(
            `i18n.resolveI18nValue: Invalid key argument. Expected non-empty string, received:`,
            key
        );
        return;
    }

    // Validate lang is one of the supported language codes.
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.error(
            `i18n.resolveI18nValue: Unsupported language. Expected one of ${SUPPORTED_LANGUAGES.join(', ')}, received:`,
            lang
        );
        return;
    }

    let useSharedString = true;
    let value = null;

    // Only attempt view-specific lookup when a non-empty viewId is
    // provided. Empty strings are treated as "no view scope" to match
    // the behavior of getAttribute() returning null.
    if (viewId) {
        // View-specific lookup first.
        value = getString(key, {
            viewId: viewId,
            lang: lang
        });
        useSharedString = false;

        if (value === undefined) {
            // Warn and fall back to shared.
            console.warn(
                `i18n.applyLanguage: Key "${key}" not found in view "${viewId}", falling back to shared strings`
            );
            useSharedString = true;
        }
    }

    if (useSharedString) {
        // Shared lookup only.
        value = getString(key, {
            lang: lang
        });
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
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.getAttribute('data-i18n');
        const viewId = element.getAttribute('data-i18n-view');

        const value = resolveI18nValue(key, lang, viewId);
        if (value !== undefined) {
            // Apply placeholder substitution if needed.
            const arg = element.getAttribute('data-i18n-arg');
            if (arg !== null && typeof value === 'string') {
                value = value.replace('{n}', arg);
            }
            element.textContent = value;
        } else {
            console.error(
                `i18n.applyLanguage: Unable to resolve key "${key}" for view "${viewId || 'shared'}"`
            );
        }
    });

    // Update elements with placeholder attributes.
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        const key = element.getAttribute('data-i18n-placeholder');
        const viewId = element.getAttribute('data-i18n-view');

        const value = resolveI18nValue(key, lang, viewId);
        if (value !== undefined) {
            element.setAttribute('placeholder', value);
        } else {
            console.error(
                `i18n.applyLanguage: Unable to resolve placeholder key "${key}" for view "${viewId || 'shared'}"`
            );
        }
    });

    // Update the document language attribute for screen readers.
    document.documentElement.lang = lang;
}