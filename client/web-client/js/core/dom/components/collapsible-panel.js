/**
 * collapsible-panel.js
 *
 * A reusable collapsible panel component built from standard DOM elements.
 * Provides accessible expand/collapse behavior with CSS-driven animation.
 *
 * The component uses a button element as the trigger, which provides
 * keyboard support and focus management for free. ARIA attributes
 * (aria-expanded, aria-controls, aria-labelledby) maintain the
 * relationship between trigger and content for assistive technology.
 *
 * The content region animates open and closed using the CSS grid
 * technique: grid-template-rows transitions between 0fr and 1fr.
 * This avoids JavaScript-based height measurement while preserving
 * smooth animation. See collapsible-panel.css for details.
 *
 * Structural CSS classes (collapsible-panel, collapsible-panel__content,
 * etc.) are always applied. The classNames option adds to these, it does
 * not replace them. This ensures core behavior (twistie rotation, collapse
 * animation) works regardless of custom styling.
 *
 * header and content accept either:
 *   - A string: treated as HTML, wrapped in a div
 *   - A DOM node: used as-is
 *   - An object: passed directly to createElement (supports i18n, attrs,
 *     props, class, and all other createElement options)
 *
 * Usage (simple):
 *
 *   import { createCollapsiblePanel } from './collapsible-panel.js';
 *
 *   const panel = createCollapsiblePanel({
 *       header: 'Panel Title',
 *       content: '<p>Panel body content</p>',
 *       startOpen: true,
 *       onToggle: (state, event) => console.log('Panel is now ' + state),
 *   });
 *
 *   document.body.appendChild(panel.root);
 *
 * Usage (createElement API for header, with custom classes):
 *
 *   const panel = createCollapsiblePanel({
 *       header: {
 *           text: 'Panel Title',
 *           i18n: {
 *               'data-i18n': 'mykey',
 *               exclusions: ['data-i18n-.*'],
 *               forceShared: true
 *           }
 *       },                                  // passed to createElement
 *       content: '<p>Panel body content</p>', // created in-house (wrapped in div)
 *       classNames: {
 *           root: ['panel-styles'],          // added to structural classes
 *           content: ['panel-content', 'mystyles']
 *       },
 *       startOpen: true,
 *       onToggle: (state, event) => console.log('Panel is now ' + state),
 *   });
 *
 *   panel.open();   // silent - does not fire onToggle
 *   panel.close();  // silent - does not fire onToggle
 *   panel.toggle(); // silent - does not fire onToggle
 *   panel.destroy(); // removes event listeners
 */

import {
    createElement
} from './../dom.js';

let panelCounter = 0;

/**
 * Validates that a value is a plain object (not null, not an array,
 * not a class instance with a custom prototype).
 *
 * Used to validate the options object and nested objects like classNames.
 * This ensures callers pass proper object literals and catches mistakes
 * like passing an array or a class instance where an options object is
 * expected.
 *
 * @param {*} value - The value to validate
 * @param {string} name - The parameter name, used in the error message
 * @throws {TypeError} If value is not a plain object
 */
function assertPlainObject(value, name) {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype
    ) {
        throw new TypeError(
            name + ' must be a plain object. Received: ' + Object.prototype.toString.call(value)
        );
    }
}

/**
 * Validates the panel options object before any DOM is created.
 *
 * This function exists to fail fast. Rather than creating DOM elements
 * and then discovering that an option was invalid halfway through the
 * factory, we validate everything up front. This means the factory
 * either succeeds and returns a fully functional component, or throws
 * a descriptive error before any side effects occur.
 *
 * @param {Object} options - The raw options object passed to the factory
 * @throws {TypeError} If any option fails validation
 */
function validateOptions(options) {
    assertPlainObject(options, 'options');

    // Validate startOpen
    if (
        options.startOpen !== undefined && typeof options.startOpen !== 'boolean'
    ) {
        throw new TypeError(
            "startOpen must be a boolean. Received: " + String(options.startOpen)
        );
    }

    // Validate onToggle
    if (
        options.onToggle !== undefined &&
        options.onToggle !== null &&
        typeof options.onToggle !== 'function'
    ) {
        throw new TypeError(
            'onToggle must be a function. Received: ' + typeof options.onToggle
        );
    }

    // Validate idPrefix
    if (options.idPrefix !== undefined && typeof options.idPrefix !== 'string') {
        throw new TypeError(
            'idPrefix must be a string. Received: ' + typeof options.idPrefix
        );
    }

    // Validate id
    if (options.id !== undefined) {
        if (typeof options.id !== 'string' || options.id.trim() === '') {
            throw new TypeError(
                'id must be a non-empty string. Received: ' + typeof options.id
            );
        }
    }

    // Validate classNames
    if (options.classNames !== undefined) {
        assertPlainObject(options.classNames, 'classNames');
        for (const key of ['root', 'trigger', 'content', 'twistie']) {
            if (
                options.classNames[key] !== undefined &&
                (!Array.isArray(options.classNames[key]) ||
                    !options.classNames[key].every((item) => typeof item === 'string'))
            ) {
                throw new TypeError(
                    'classNames.' + key + ' must be an Array of strings. Received: ' +
                    typeof options.classNames[key]
                );
            }
        }
    }

    // Validate header and content are present and valid
    if (options.header === undefined) {
        throw new TypeError('header is required');
    }
    if (options.content === undefined) {
        throw new TypeError('content is required');
    }
}

/**
 * Resolves flexible header/content input into a live DOM node.
 *
 * The factory accepts three input forms for both header and content:
 * a string, an existing DOM node, or an options object. Rather than
 * duplicating the branching logic at each call site, this function
 * centralizes it so the factory only ever works with a single type
 * downstream: a DOM node.
 *
 * Accepted input forms:
 *
 *   - Node: returned as-is, no wrapping needed
 *   - string: treated as HTML, wrapped in a div element
 *   - object: passed directly to createElement (caller
 *     responsible for ensuring correct API options for
 *     createElement were provided)
 *
 * Throws a TypeError if the input matches none of the accepted forms.
 * This ensures invalid input is caught immediately rather than silently
 * producing an empty or broken component.
 *
 * @param {*} input - The header or content value to resolve
 * @param {string} name - The parameter name ('header' or 'content'),
 *                        used in error messages for clarity
 * @returns {Node} A DOM node ready to be appended to the component
 * @throws {TypeError} If input does not match any accepted form
 */
function resolveContentNode(input, name) {
    // Already a live DOM node - use it directly
    if (input instanceof Node) {
        return input;
    }

    // String input - treat as HTML for flexibility with rich content
    if (typeof input === 'string') {
        const container = document.createElement('div');
        container.innerHTML = input;
        return container;
    }

    // Object input - pass directly to createElement so it can handle i18n
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
        return createElement('div', input);
    }

    // No accepted form matched - fail loudly so the caller knows immediately
    throw new TypeError(
        name + ' must be a string, DOM Node, or object with node, text, or html property. ' +
        'Received: ' + Object.prototype.toString.call(input)
    );
}

/**
 * Creates a collapsible panel component.
 *
 * The returned object exposes the component's DOM elements and control
 * methods. The root element is not automatically appended to the
 * document; the caller is responsible for inserting it where needed.
 *
 * Programmatic methods (open, close, toggle) are silent by design.
 * They do not fire the onToggle callback. The callback fires only in
 * response to user interaction (clicking the trigger). This prevents
 * surprising side effects when code opens or closes panels during
 * setup or in response to unrelated events.
 *
 * @param {Object} options - Component configuration
 * @param {string|Node|Object} options.header - Content for the clickable trigger.
 *										If a string, a <div> will be created.
 *										If Node
 * @param {string|Node|Object} options.content - Content for the collapsible region
 * @param {boolean} [options.startOpen=false] - Initial panel state
 * @param {Function} [options.onToggle] - Callback invoked on user-initiated
 *                                        toggle. Receives (state, event)
 *                                        where state is 'open' or 'closed'.
 * @param {string} [options.idPrefix='collapsible-panel'] - Prefix for
 *                                                          generated element IDs
 * @param {Object} [options.classNames] - Optional CSS class overrides
 * @param {string[]} [options.classNames.root=['collapsibile-panel-default]] -
 * 										Classes for the root element
 * 										Note: ALL panels get 'collapsible-panel' class
 * 										If user supplies overrides, it will get appended.
 * 										It does not provide any styling; it just
 * 										assists in twistie animation.
 * @param {string[]} [options.classNames.trigger=['collapsible-panel__trigger]] -
 * 										Classes for the trigger element
 * @param {string[]} [options.classNames.content=['collapsible-panel__content-default]]
 * 										Classes for the content region
 * 										Note: ALL content regions will have
 * 										'collapsible-panel__content added (if user
 * 										sends overrids, it will get appended to it;
 * 										this class is necessary to handle the
 * 										collapse animatino)
 * @param {string[]} [options.classNames.twistie=['collapsible-panel__twistie']] -
 * 										Classes for the twistie icon
 *
 * @returns {Object} The panel component with the following properties:
 *   root    - HTMLElement, the outermost panel element
 *   trigger - HTMLButtonElement, the clickable header button
 *   content - HTMLElement, the collapsible content region
 *   twistie - HTMLElement, the CSS-rotated arrow indicator
 *   open    - Function, opens the panel silently
 *   close   - Function, closes the panel silently
 *   toggle  - Function, toggles the panel silently
 *   destroy - Function, removes event listeners
 *
 * @throws {TypeError} If any option fails validation
 */
export function createCollapsiblePanel(options = {}) {
    // Fail fast before any DOM is created
    validateOptions(options);

    const {
        header,
        content,
        startOpen = false,
        onToggle = null,
        id,
        idPrefix = 'collapsible-panel',
        classNames = {},
    } = options;

    // Resolve the panel ID. If the caller provided an explicit id, use it
    // directly. Otherwise fall back to the generated scheme using idPrefix
    // and the global counter. This gives callers control over IDs when
    // they need it (e.g., linking to a panel from elsewhere) while
    // still providing unique IDs automatically when they don't care.
    const panelId = options.id !== undefined ?
        options.id :
        idPrefix + '-' + (++panelCounter);
    const triggerId = panelId + '-trigger';
    const contentId = panelId + '-content';

    // Resolve CSS classes with defaults and caller overrides
    const classes = {
        root: classNames.root || ['collapsible-panel-default'],
        trigger: classNames.trigger || ['collapsible-panel__trigger'],
        content: classNames.content || ['collapsible-panel__content-default'],
        twistie: classNames.twistie || ['collapsible-panel__twistie'],
    };

    // Build the DOM structure using standard elements.

    // Root container - the outermost element the caller appends to the page
    const root = document.createElement('div');
    let rootClasses = classes.root;
    // collapsible-panel class determines twistie animation behavior so it must be present
    rootClasses.push('collapsible-panel');
    root.className = rootClasses.join(' ');
    root.classList.add(startOpen ? 'is-open' : 'is-closed');
    root.id = panelId;

    // Trigger button - native button element gives keyboard support,
    // focus handling, and correct semantic role without extra work
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = classes.trigger.join(' ');;
    trigger.id = triggerId;
    trigger.setAttribute('aria-expanded', startOpen ? 'true' : 'false');
    trigger.setAttribute('aria-controls', contentId);

    // Twistie icon - purely decorative, controlled by CSS. Hidden from
    // screen readers since the aria-expanded attribute already conveys
    // the panel's state.
    const twistie = document.createElement('span');
    twistie.className = classes.twistie.join(' ');
    twistie.setAttribute('aria-hidden', 'true');

    // Content region - the collapsible area. The role="region" and
    // aria-labelledby attributes establish the relationship with the
    // trigger for assistive technology.
    const contentRegion = document.createElement('div');
    let contentClasses = classes.content;
    // collapsible-panel__content class determines collapse behavior so it must be present
    contentClasses.push('collapsible-panel__content');
    contentRegion.className = contentClasses.join(' ');
    contentRegion.id = contentId;
    contentRegion.setAttribute('role', 'region');
    contentRegion.setAttribute('aria-labelledby', triggerId);

    // The hidden attribute removes the content from the accessibility
    // tree when closed. The CSS overrides display:none during the
    // animation to allow the grid transition to complete visually.
    if (!startOpen) {
        contentRegion.hidden = true;
    }

    // Resolve flexible header and content input into live DOM nodes.
    // This happens once here so the rest of the component only deals
    // with a single type: DOM nodes.
    const headerNode = resolveContentNode(header, 'header');
    const contentNode = resolveContentNode(content, 'content');

    // Assemble the DOM tree. The twistie is a child of the trigger so
    // it moves and rotates with the button. The header content follows
    // the twistie inside the trigger.
    trigger.appendChild(twistie);
    trigger.appendChild(headerNode);
    contentRegion.appendChild(contentNode);

    root.appendChild(trigger);
    root.appendChild(contentRegion);

    // Track current state in a closure variable. This is the single
    // source of truth for the component's open/closed state.
    let isOpen = startOpen;

    /**
     * Updates the panel state and all associated DOM attributes.
     *
     * This is the only place where state changes are applied to the
     * DOM. Both user-initiated toggles and programmatic control flow
     * through this function, ensuring consistent behavior.
     *
     * Does not fire the onToggle callback. That is handled by the
     * calling context (either the click handler for user toggles, or
     * not at all for programmatic control).
     *
     * @param {boolean} open - Whether the panel should be open
     */
    function setState(open) {
        isOpen = open;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        contentRegion.hidden = !open;
        root.classList.toggle('is-open', open);
        root.classList.toggle('is-closed', !open);
    }

    /**
     * Handles user-initiated toggle via click on the trigger.
     *
     * This is the only code path that fires the onToggle callback.
     * The callback receives the new state and the original click
     * event, allowing callers to react to user interaction with
     * full context.
     *
     * @param {Event} event - The click event from the trigger
     */
    function handleTriggerClick(event) {
        setState(!isOpen);
        if (typeof onToggle === 'function') {
            onToggle(isOpen ? 'open' : 'closed', event);
        }
    }

    // Attach the click listener. This is the only event listener the
    // component needs. It is removed by destroy() to prevent memory
    // leaks when panels are dynamically created and removed.
    trigger.addEventListener('click', handleTriggerClick);

    /**
     * Programmatically opens the panel.
     * Silent - does not fire the onToggle callback.
     */
    function open() {
        setState(true);
    }

    /**
     * Programmatically closes the panel.
     * Silent - does not fire the onToggle callback.
     */
    function close() {
        setState(false);
    }

    /**
     * Programmatically toggles the panel.
     * Silent - does not fire the onToggle callback.
     */
    function toggle() {
        setState(!isOpen);
    }

    /**
     * Removes event listeners to prevent memory leaks.
     *
     * Call this when the panel is removed from the document and will
     * not be used again. After calling destroy, the component methods
     * (open, close, toggle) will still work if called, but user clicks
     * on the trigger will no longer fire the onToggle callback.
     */
    function destroy() {
        trigger.removeEventListener('click', handleTriggerClick);
    }

    return {
        root,
        trigger,
        content: contentRegion,
        twistie,
        open,
        close,
        toggle,
        destroy,
    };
}