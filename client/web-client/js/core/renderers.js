/**
 * Ruslovar API Demo — Shared Renderers
 *
 * Provides reusable DOM-building functions for rendering declension
 * tables, metadata sections, match tabs, and raw JSON. These are used
 * by both single and batch views, ensuring consistent output without
 * duplicated rendering logic.
 *
 * Shared renderers use only shared strings. They never reference
 * view-specific strings. If a future component needs view-specific
 * text, that logic belongs in the view module, not here.
 *
 * Responsibilities:
 *   - Build DOM elements from API response data.
 *   - Apply shared i18n strings during construction.
 *   - Set data-i18n attributes so language switches update in place.
 *   - Handle edge cases such as multiple plural sets and duplicate roots.
 *
 * Dependencies:
 *   - i18n.js (getSharedString)
 *   - dom.js (createElement)
 */

import {
    getString,
    getSharedString
} from './i18n.js';
import {
    createElement
} from './dom.js';

/**
 * Create a declension table for a set of case forms.
 *
 * Only rows with non-null forms are rendered. The heading carries a
 * data-i18n attribute so it updates on language switch. If a
 * headingIndex is provided, it is stored in data-i18n-arg so the {n}
 * placeholder can be re-substituted after language switching.
 *
 * @param {string} i18nKey - Shared i18n key for the heading text.
 * @param {Object} forms - Case forms object (e.g., singular or plural).
 * @param {number|null} [headingIndex=null] - Optional index to substitute
 *     into the heading when the string contains a {n} placeholder.
 * @returns {HTMLElement} A wrapper div containing the heading and table.
 */
export function createDeclensionTable(i18nKey, forms, headingIndex = null) {
    const wrapper = createElement('div', 'declension-section');

    const heading = createElement('h2', 'declension-heading');

    // Set data-i18n so applyLanguage() updates this heading in place
    // when the language changes. The data-i18n-arg attribute stores the
    // heading index (if any) so {n} substitution survives the switch.
    heading.setAttribute('data-i18n', i18nKey);
    if (headingIndex !== null) {
        heading.setAttribute('data-i18n-arg', headingIndex);
    }

    // Set initial text content.
    let headingText = getSharedString(i18nKey);
    if (headingIndex !== null) {
        headingText = headingText.replace('{n}', headingIndex);
    }
    heading.textContent = headingText;

    wrapper.appendChild(heading);

    const table = createElement('table', 'declension-table');
    const tbody = createElement('tbody');

    const caseLabels = getSharedString('case_labels');

    // Iterate cases in a fixed, grammatical order.
    for (const [caseKey, caseLabel] of Object.entries(caseLabels)) {
        const form = forms[caseKey];

        // Skip cases where the form is null or undefined.
        if (form) {
            const row = createElement('tr');

            const caseCell = createElement('td', '', caseLabel);
            caseCell.setAttribute('data-i18n', `case_labels.${caseKey}`);

            const wordCell = createElement('td', '', form);

            row.appendChild(caseCell);
            row.appendChild(wordCell);
            tbody.appendChild(row);
        }
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

    return wrapper;
}

/**
 * Create the metadata section for a match.
 *
 * Displays the root word as a heading, an invariant badge when
 * applicable, and metadata items for gender and animacy. All localized
 * elements carry data-i18n attributes so they update in place on
 * language switch.
 *
 * @param {Object} match - Match object from the API response.
 * @returns {HTMLElement} A div containing the metadata section.
 */
export function createMetadataSection(match) {
    const section = createElement('div', 'metadata-section');

    // Root word is displayed prominently. Not localized.
    const rootHeading = createElement('h3', 'match-root', match.root);
    section.appendChild(rootHeading);

    if (match.invariant) {
        const badge = createElement(
            'span',
            'invariant-badge',
            getSharedString('invariant_label')
        );
        badge.setAttribute('data-i18n', 'invariant_label');
        section.appendChild(badge);
    }

    const metaList = createElement('div', 'metadata-list');

    // Gender is optional in the API response.
    if (match.gender) {
        const item = createElement('span', 'metadata-item');

        const label = createElement('span', '', getSharedString('gender_label'));
        label.setAttribute('data-i18n', 'gender_label');

        const value = createElement(
            'span',
            '',
            getSharedString(`gender_values.${match.gender}`) || match.gender
        );
        value.setAttribute('data-i18n', `gender_values.${match.gender}`);

        item.appendChild(label);
        item.appendChild(document.createTextNode(': '));
        item.appendChild(value);

        metaList.appendChild(item);
    }

    // Animacy is optional in the API response.
    if (match.animacy !== null && match.animacy !== undefined) {
        const item = createElement('span', 'metadata-item');

        const label = createElement('span', '', getSharedString('animacy_label'));
        label.setAttribute('data-i18n', 'animacy_label');

        const animacyKey = match.animacy ? 'animacy_animate' : 'animacy_inanimate';
        const value = createElement('span', '', getSharedString(animacyKey));
        value.setAttribute('data-i18n', animacyKey);

        item.appendChild(label);
        item.appendChild(document.createTextNode(': '));
        item.appendChild(value);

        metaList.appendChild(item);
    }

    section.appendChild(metaList);

    return section;
}

/**
 * Create a tab bar for switching between multiple matches.
 *
 * Each tab is labeled with the root word of its match. If multiple
 * matches share the same root (e.g., "замок"), a number is appended
 * for clarity.
 *
 * The tab bar and match containers are scoped to the provided container
 * element, avoiding reliance on global DOM queries.
 *
 * @param {Object[]} matches - List of match objects from the API response.
 * @param {HTMLElement} container - Parent element that holds all match
 *     containers. Tab click handlers toggle visibility within this scope.
 * @returns {HTMLElement} The tab bar element.
 */
export function createMatchTabs(matches, container) {
    const tabBar = createElement('div', 'match-tabs');
    tabBar.setAttribute('role', 'tablist');

    matches.forEach((match, index) => {
        const tab = document.createElement('button');
        tab.className = 'match-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        tab.textContent = getMatchLabel(match, index, matches);

        // Clicking a tab updates active states and shows only the
        // corresponding match container within the scoped container.
        tab.addEventListener('click', () => {
            // Reset all tabs within this tab bar.
            tabBar.querySelectorAll('.match-tab').forEach((t) => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // Hide all match containers, then show the selected one.
            container.querySelectorAll('.match-container').forEach((matchContainer) => {
                matchContainer.classList.add('hidden');
            });

            const target = container.querySelector(
                `.match-container[data-match-index="${index}"]`
            );
            if (target) {
                target.classList.remove('hidden');
            }
        });

        // First tab starts active.
        if (index === 0) {
            tab.classList.add('active');
        }

        tabBar.appendChild(tab);
    });

    return tabBar;
}

/**
 * Generate a label for a match tab.
 *
 * If multiple matches share the same root, append a number to make
 * tabs distinguishable. Otherwise, use the root word alone.
 *
 * @param {Object} match - The match object.
 * @param {number} index - Index of this match in the matches array.
 * @param {Object[]} matches - Full matches array for duplicate detection.
 * @returns {string} The label to display on the tab.
 */
function getMatchLabel(match, index, matches) {
    const duplicateRoots = matches.filter((m) => m.root === match.root).length > 1;

    if (duplicateRoots) {
        return `${match.root} (${index + 1})`;
    }

    return match.root;
}

/**
 * Render all matches for a word.
 *
 * Supports two layouts:
 *   - 'tabs': Multiple matches are shown in a tabbed interface.
 *     Used by the single noun view.
 *   - 'stacked': Matches are rendered vertically in separate panels.
 *     Used by the batch noun view.
 *
 * @param {Object} result - NounLookupResponse object.
 * @param {Object} [options] - Rendering options.
 * @param {string} [options.layout='tabs'] - 'tabs' or 'stacked'.
 * @param {string} [options.matchLabelViewId] - View ID for resolving
 *     the "Match {n}" label. Required when layout is 'stacked'.
 * @returns {HTMLElement} Container with all matches rendered.
 */
export function createMatchesContainer(result, {
    layout = 'tabs',
    matchLabelViewId = null
} = {}) {
    const container = createElement('div', `matches-container matches-${layout}`);

    if (layout === 'tabs' && result.matches.length > 1) {
        container.appendChild(createMatchTabs(result.matches, container));
    }

    result.matches.forEach((match, index) => {
        const panel = createElement('div', 'match-container');
        panel.dataset.matchIndex = index;

        // In tab layout, hide all but the first panel initially.
        if (layout === 'tabs' && result.matches.length > 1) {
            panel.classList.add('hidden');
            if (index === 0) {
                panel.classList.remove('hidden');
            }
        }

        // In stacked layout, add a label when multiple matches exist.
        if (layout === 'stacked' && result.matches.length > 1) {
            const label = createElement('h3', 'match-label');
            const labelText = getString(matchLabelViewId, 'match_label');
            label.setAttribute('data-i18n', 'match_label');
            label.setAttribute('data-i18n-view', matchLabelViewId);
            label.setAttribute('data-i18n-arg', index + 1);
            label.textContent = labelText.replace('{n}', index + 1);
            panel.appendChild(label);
        }

        panel.appendChild(createMetadataSection(match));
        panel.appendChild(createDeclensionTable('singular_heading', match.singular));

        match.plural.forEach((pluralForms, pluralIndex) => {
            const headingKey = match.plural.length > 1 ?
                'plural_heading_numbered' :
                'plural_heading';
            const headingIndex = match.plural.length > 1 ? pluralIndex + 1 : null;
            panel.appendChild(createDeclensionTable(headingKey, pluralForms, headingIndex));
        });

        container.appendChild(panel);
    });

    return container;
}

/**
 * Create a collapsible raw JSON section.
 *
 * Used by views to display the full API response in a <details> element.
 *
 * @param {Object} data - The data to stringify and display.
 * @returns {HTMLElement} A <details> element containing formatted JSON.
 */
export function createRawJsonToggle(data) {
    const details = createElement('details', 'raw-json');

    const summary = createElement('summary', '', getSharedString('raw_json_heading'));
    summary.setAttribute('data-i18n', 'raw_json_heading');

    details.appendChild(summary);

    const pre = createElement('pre', '', JSON.stringify(data, null, 2));
    details.appendChild(pre);

    return details;
}