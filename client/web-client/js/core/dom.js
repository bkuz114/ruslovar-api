/**
 * Ruslovar API Demo — DOM Utilities
 *
 * Small helper functions for DOM manipulation. Keeps view code cleaner
 * by reducing repetitive createElement / appendChild boilerplate.
 *
 * Dependencies:
 *   - None (standalone module)
 */

/**
 * Create an HTML element with optional class name and text content.
 *
 * @param {string} tagName - HTML tag name (e.g., "div", "h2", "table").
 * @param {string} [className] - CSS class name to apply.
 * @param {string} [textContent] - Text content for the element.
 * @returns {HTMLElement} The created element.
 */
export function createElement(tagName, className = '', textContent = '') {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
}

/**
 * Remove all children from a DOM element.
 *
 * @param {HTMLElement} element - The element to clear.
 */
export function clearElement(element) {
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
 */
export function loadStylesheet(href) {
    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}