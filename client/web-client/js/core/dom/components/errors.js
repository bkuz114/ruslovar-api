/**
 * Ruslovar API Demo — Error UI Components
 *
 * Provides reusable DOM components for displaying error messages.
 * These components are shared across views and renderers.
 *
 * Components:
 *   - createErrorDiv: styled error message container with i18n support.
 *
 * Dependencies:
 *   - core/dom/dom.js (createElement)
 */

import {
    createElement
} from './../dom.js';

/**
 * Create an error message div.
 *
 * The error is rendered as a styled div with role="alert". It can
 * display either a localized string (via i18n key), a literal message,
 * or both.
 *
 * If both i18nKey and message are provided, the element's initial text
 * is set to the literal message. The i18n key is also set, so future
 * language switches will replace the literal message with the localized
 * string.
 *
 * @param {Object} [options] - Error options.
 * @param {string} [options.i18nKey] - i18n key for a localized error
 *     message.
 * @param {string} [options.message] - Literal error message to display.
 *     Used as initial text if provided.
 * @returns {HTMLElement} The error div element.
 * @throws {TypeError} If i18nKey is not a string or null.
 * @throws {TypeError} If message is not a string or null.
 * @throws {TypeError} If neither i18nKey nor message is provided.
 */
export function createErrorDiv({
    i18nKey = null,
    message = null
} = {}) {
    if (i18nKey !== null && typeof i18nKey !== 'string') {
        throw new TypeError('createErrorDiv: i18nKey must be a string or null');
    }

    if (message !== null && typeof message !== 'string') {
        throw new TypeError('createErrorDiv: message must be a string or null');
    }

    if (!i18nKey && !message) {
        throw new TypeError('createErrorDiv: either i18nKey or message is required');
    }

    const i18nConfig = i18nKey ? {
        'data-i18n': i18nKey
    } : {};

    return createElement('div', {
        class: 'error-message',
        text: message,
        i18n: i18nConfig,
        attrs: {
            role: 'alert'
        },
    });
}