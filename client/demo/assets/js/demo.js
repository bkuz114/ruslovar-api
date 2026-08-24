/**
 * Ruslovar API Demo — Client-Side Logic
 *
 * This script handles:
 * - Loading configuration from config.json
 * - Language switching (Russian / English) with localStorage persistence
 * - Form submission and API requests
 * - Rendering declension tables
 * - Displaying raw JSON responses
 * - Error handling and display
 */

// ==========================================================================
// Configuration
// ==========================================================================

/** location to look for config file (relative web server root) */
const CONFIG_PATH = "config.json";

/** Default configuration values (fallback if config.json not loaded). */
const DEFAULT_CONFIG = {
    api_base_url: "http://127.0.0.1:8000",
};

/** Current configuration, populated from config.json. */
let config = {
    ...DEFAULT_CONFIG
};

// ==========================================================================
// Language strings
// ==========================================================================

/**
 * UI strings for each supported language.
 * Keys are used in the HTML via data attributes or element IDs.
 */
const STRINGS = {
    ru: {
        page_title: "Демонстрация склонений",
        language_label: "Выбор языка",
        word_label: "Существительное",
        word_placeholder: "Например: кролик",
        strict_label: "Строгий режим",
        submit_button: "Показать склонения",
        results_placeholder: "Введите слово, чтобы увидеть склонения.",
        results_label: "Результаты",
        raw_json_heading: "Исходный JSON",
        error_not_found: "Слово не найдено в словаре.",
        error_strict: "Слово не в словарной форме.",
        error_network: "Ошибка соединения с API.",
        error_unknown: "Произошла неизвестная ошибка.",
        case_labels: {
            nominative: "Именительный",
            genitive: "Родительный",
            dative: "Дательный",
            accusative: "Винительный",
            instrumental: "Творительный",
            prepositional: "Предложный",
        },
        gender_values: {
            "муж": "мужской",
            "жен": "женский",
            "ср": "средний",
            "общ": "общий",
        },
        singular_heading: "Единственное число",
        plural_heading: "Множественное число",
        gender_label: "Род",
        animacy_label: "Одушевлённость",
        animacy_animate: "одуш",
        animacy_inanimate: "неодуш",
        invariant_label: "Неизменяемое",
        singular_heading: "Единственное число",
        plural_heading: "Множественное число",
        plural_heading_numbered: "Множественное число {n}",
        match_label: "Вариант {n}",
    },
    en: {
        page_title: "Declension Demo",
        language_label: "Language selection",
        word_label: "Noun",
        word_placeholder: "e.g. кролик",
        strict_label: "Strict mode",
        submit_button: "Show declensions",
        results_placeholder: "Enter a word to see declensions.",
        results_label: "Results",
        raw_json_heading: "Raw JSON",
        error_not_found: "Word not found in dictionary.",
        error_strict: "Word is not in dictionary form.",
        error_network: "Could not connect to the API.",
        error_unknown: "An unknown error occurred.",
        case_labels: {
            nominative: "Nominative",
            genitive: "Genitive",
            dative: "Dative",
            accusative: "Accusative",
            instrumental: "Instrumental",
            prepositional: "Prepositional",
        },
        gender_values: {
            "муж": "masculine",
            "жен": "feminine",
            "ср": "neuter",
            "общ": "common",
        },
        singular_heading: "Singular",
        plural_heading: "Plural",
        gender_label: "Gender",
        animacy_label: "Animacy",
        animacy_animate: "animate",
        animacy_inanimate: "inanimate",
        invariant_label: "Invariant",
        singular_heading: "Singular",
        plural_heading: "Plural",
        plural_heading_numbered: "Plural {n}",
        match_label: "Match {n}",
    },
};

/** Current language. Defaults to Russian. */
let currentLanguage = "ru";

// ==========================================================================
// DOM element references (populated after DOMContentLoaded)
// ==========================================================================

let elements = {};

// ==========================================================================
// Initialization
// ==========================================================================

/**
 * Load configuration from config.json, restore language preference,
 * and set up event listeners.
 */
document.addEventListener("DOMContentLoaded", async () => {
    cacheDomElements();
    restoreLanguagePreference();
    await loadConfig();
    bindEvents();
    applyLanguage(currentLanguage);
    preloadWordFromUrl();
});

/**
 * Cache references to DOM elements we interact with.
 */
function cacheDomElements() {
    elements = {
        pageTitle: document.getElementById("page-title"),
        wordLabel: document.getElementById("word-label"),
        wordInput: document.getElementById("word-input"),
        strictLabel: document.getElementById("strict-label"),
        strictMode: document.getElementById("strict-mode"),
        submitButton: document.getElementById("submit-button"),
        resultsArea: document.getElementById("results-area"),
        resultsPlaceholder: document.getElementById("results-placeholder"),
        langRu: document.getElementById("lang-ru"),
        langEn: document.getElementById("lang-en"),
    };
}

/**
 * Load config.json and merge with defaults.
 */
async function loadConfig() {
    try {
        const response = await fetch(CONFIG_PATH);
        if (!response.ok) {
            console.warn(`Could not load ${CONFIG_PATH}, using defaults.`);
            return;
        }
        const userConfig = await response.json();
        config = {
            ...DEFAULT_CONFIG,
            ...userConfig
        };
    } catch (error) {
        console.warn(`Error loading ${CONFIG_PATH}, using defaults.`, error);
    }
}

/**
 * Restore language preference from localStorage, if set.
 */
function restoreLanguagePreference() {
    const saved = localStorage.getItem("demo_language");
    if (saved === "ru" || saved === "en") {
        currentLanguage = saved;
    }
}

/**
 * Bind event listeners to the form, buttons, and language toggle.
 */
function bindEvents() {
    elements.langRu.addEventListener("click", () => setLanguage("ru"));
    elements.langEn.addEventListener("click", () => setLanguage("en"));

    document.getElementById("lookup-form").addEventListener("submit", handleFormSubmit);
}

// ==========================================================================
// Language management
// ==========================================================================

/**
 * Set the active language and update the UI.
 * @param {string} lang - "ru" or "en"
 */
function setLanguage(lang) {
    if (lang !== "ru" && lang !== "en") return;

    currentLanguage = lang;
    localStorage.setItem("demo_language", lang);
    applyLanguage(lang);
}

function getNestedValue(obj, path) {
    return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

/**
 * Apply the given language to all UI strings and ARIA labels.
 * @param {string} lang - "ru" or "en"
 */
function applyLanguage(lang) {
    const s = STRINGS[lang];

    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        const value = getNestedValue(s, key);
        if (value !== undefined) {
            el.textContent = value;
        }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (s[key] !== undefined) {
            el.setAttribute("placeholder", s[key]);
        }
    });

    elements.langRu.classList.toggle("active", lang === "ru");
    elements.langRu.setAttribute("aria-pressed", String(lang === "ru"));
    elements.langEn.classList.toggle("active", lang === "en");
    elements.langEn.setAttribute("aria-pressed", String(lang === "en"));

    document.documentElement.lang = lang;
}

// ==========================================================================
// Form handling
// ==========================================================================

/**
 * Handle form submission: send API request and render results.
 * @param {Event} event - The submit event.
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const word = elements.wordInput.value.trim();
    if (!word) return;

    const strict = elements.strictMode.checked;
    clearResults();

    try {
        const response = await fetchNounDeclensions(word, strict);
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = getErrorMessage(response.status, errorData);
            showError(errorMessage);
            return;
        }

        const data = await response.json();
        renderResults(data);
    } catch (error) {
        console.error("Error during API request:", error);
        showError(STRINGS[currentLanguage].error_network);
    }
}

/**
 * Fetch noun declensions from the API.
 * @param {string} word - The word to look up.
 * @param {boolean} strict - Whether strict mode is enabled.
 * @returns {Promise<Response>} The fetch response.
 */
async function fetchNounDeclensions(word, strict) {
    const url = `${config.api_base_url}/api/v1/nouns/${encodeURIComponent(word)}/declensions?strict=${strict}`;
    return fetch(url);
}

/**
 * Map HTTP status codes to user-facing error messages.
 * @param {number} status - The HTTP status code.
 * @param {object|null} data - Parsed error response body, if any.
 * @returns {string} The error message to display.
 */
function getErrorMessage(status, data) {
    const s = STRINGS[currentLanguage];

    if (status === 404) {
        // The API returns detail messages that distinguish between
        // "not found" and "not in dictionary form" (strict mode).
        if (data && typeof data.detail === "string" && data.detail.includes("dictionary form")) {
            return s.error_strict;
        }
        return s.error_not_found;
    }

    if (status >= 500) {
        return s.error_network;
    }

    return s.error_unknown;
}

/**
 * Check the URL for a word parameter, populate the input field, and
 * automatically submit the lookup.
 *
 * Allows users to share direct links like demo.html?word=кролик.
 */
function preloadWordFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const word = params.get("word");
    if (word) {
        elements.wordInput.value = word;
        document.getElementById("lookup-form").requestSubmit();
    }
}

// ==========================================================================
// Rendering
// ==========================================================================

/**
 * Render the API response into the results area.
 *
 * The response may contain multiple matches (possible dictionary roots).
 * If more than one match exists, a tab bar is created so the user can
 * switch between them. A single raw JSON toggle is added at the bottom
 * showing the complete API response.
 *
 * @param {object} data - The parsed API response.
 */
function renderResults(data) {
    elements.resultsArea.innerHTML = "";

    // If multiple matches exist, create tabs to switch between them.
    if (data.matches.length > 1) {
        elements.resultsArea.appendChild(createMatchTabs(data.matches));
    }

    // Render each match as a separate container.
    // Containers are hidden by default when tabs are present; the first
    // match is shown initially.
    data.matches.forEach((match, index) => {
        const container = document.createElement("div");
        container.className = "match-container";
        container.dataset.matchIndex = index;

        if (data.matches.length > 1) {
            container.classList.add("hidden");
            if (index === 0) {
                container.classList.remove("hidden");
            }
        }

        container.appendChild(createMetadataSection(match));
        container.appendChild(
            createDeclensionTable("singular_heading", match.singular)
        );

        // Plural is a list. Each item is a separate set of plural forms.
        match.plural.forEach((pluralForms, pluralIndex) => {
            // If there are multiple plural forms, number them.
            // Otherwise, use the simple heading.
            const headingKey = match.plural.length > 1 ?
                "plural_heading_numbered" :
                "plural_heading";
            const headingIndex = match.plural.length > 1 ? pluralIndex + 1 : null;
            container.appendChild(createDeclensionTable(headingKey, pluralForms, headingIndex));
        });

        elements.resultsArea.appendChild(container);
    });

    // Raw JSON toggle appears once, showing the full API response.
    elements.resultsArea.appendChild(
        createRawJsonToggle("raw_json_heading", data)
    );
}

/**
 * Create a tab bar for switching between multiple matches.
 *
 * Each tab is labeled with the root word of its match. If multiple
 * matches have the same root word (e.g., замок), a number is appended
 * to distinguish them.
 *
 * Clicking a tab hides all match containers and shows only the selected
 * one.
 *
 * @param {Array<object>} matches - The list of match objects from the
 *     API response.
 * @returns {HTMLElement} The tab bar element.
 */
function createMatchTabs(matches) {
    const tabBar = document.createElement("div");
    tabBar.className = "match-tabs";
    tabBar.setAttribute("role", "tablist");

    matches.forEach((match, index) => {
        const tab = document.createElement("button");
        tab.className = "match-tab";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
        tab.textContent = getMatchLabel(match, index, matches);

        // Clicking a tab updates the active state and shows the
        // corresponding match container.
        tab.addEventListener("click", () => {
            document.querySelectorAll(".match-tab").forEach(t => {
                t.classList.remove("active");
                t.setAttribute("aria-selected", "false");
            });
            tab.classList.add("active");
            tab.setAttribute("aria-selected", "true");

            document.querySelectorAll(".match-container").forEach(container => {
                container.classList.add("hidden");
            });
            const target = document.querySelector(
                `.match-container[data-match-index="${index}"]`
            );
            if (target) {
                target.classList.remove("hidden");
            }
        });

        // First tab starts active.
        if (index === 0) {
            tab.classList.add("active");
        }

        tabBar.appendChild(tab);
    });

    return tabBar;
}

/**
 * Generate a label for a match tab.
 *
 * If multiple matches share the same root word, a number is appended to
 * make the tabs distinguishable. Otherwise, the root word alone is used.
 *
 * @param {object} match - The match object.
 * @param {number} index - The index of this match in the matches array.
 * @param {Array<object>} matches - The full matches array, used to check
 *     for duplicate root words.
 * @returns {string} The label to display on the tab.
 */
function getMatchLabel(match, index, matches) {
    const duplicateRoots = matches.filter(m => m.root === match.root).length > 1;
    if (duplicateRoots) {
        return `${match.root} (${index + 1})`;
    }
    return match.root;
}

/**
 * Create the metadata section for a match.
 *
 * Displays the root word prominently, along with invariant status,
 * gender, and animacy when available.
 *
 * @param {object} match - The match object from the API response.
 * @returns {HTMLElement} The metadata section element.
 */
function createMetadataSection(match) {
    const s = STRINGS[currentLanguage];
    const section = document.createElement("div");
    section.className = "metadata-section";

    const rootHeading = document.createElement("h2");
    rootHeading.className = "match-root";
    rootHeading.textContent = match.root;
    section.appendChild(rootHeading);

    if (match.invariant) {
        const invariantBadge = document.createElement("span");
        invariantBadge.className = "invariant-badge";
        invariantBadge.textContent = s.invariant_label;
        section.appendChild(invariantBadge);
    }

    const metaList = document.createElement("div");
    metaList.className = "metadata-list";

    if (match.gender) {
        const genderItem = document.createElement("span");
        genderItem.className = "metadata-item";

        const genderLabel = document.createElement("span");
        genderLabel.setAttribute("data-i18n", "gender_label");
        genderLabel.textContent = s.gender_label;

        const genderValue = document.createElement("span");
        const genderKey = match.gender;
        genderValue.setAttribute("data-i18n", `gender_values.${genderKey}`);
        genderValue.textContent = s.gender_values[genderKey];

        genderItem.appendChild(genderLabel);
        genderItem.appendChild(document.createTextNode(": "));
        genderItem.appendChild(genderValue);
        metaList.appendChild(genderItem);
    }

    if (match.animacy !== null && match.animacy !== undefined) {
        const animacyItem = document.createElement("span");
        animacyItem.className = "metadata-item";

        const animacyLabel = document.createElement("span");
        animacyLabel.setAttribute("data-i18n", "animacy_label");
        animacyLabel.textContent = s.animacy_label;

        const animacyValue = document.createElement("span");
        const animacyKey = match.animacy ? "animacy_animate" : "animacy_inanimate";
        animacyValue.setAttribute("data-i18n", animacyKey);
        animacyValue.textContent = s[animacyKey];

        animacyItem.appendChild(animacyLabel);
        animacyItem.appendChild(document.createTextNode(": "));
        animacyItem.appendChild(animacyValue);
        metaList.appendChild(animacyItem);
    }

    section.appendChild(metaList);
    return section;
}

/**
 * Check whether a case forms object has at least one non-null value.
 * @param {object} forms - The case forms object (e.g., data.singular).
 * @returns {boolean} True if at least one form exists.
 */
function hasAnyForms(forms) {
    if (!forms) return false;
    return Object.values(forms).some((value) => value !== null && value !== undefined);
}

/**
 * Create a table element for a set of case forms.
 *
 * @param {string} i18nKey - The i18n key for the heading text. The
 *     resolved string is looked up in STRINGS using the current
 *     language.
 * @param {object} forms - The case forms object.
 * @param {number|null} [headingIndex=null] - Optional index to insert
 *     into the heading text, used when there are multiple plural forms
 *     and the heading contains a {n} placeholder.
 * @returns {HTMLElement} The created table wrapped in a container.
 */
function createDeclensionTable(i18nKey, forms, headingIndex = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "declension-section";

    const heading = document.createElement("h2");
    heading.className = "declension-heading";
    heading.setAttribute("data-i18n", i18nKey);
    heading.textContent = STRINGS[currentLanguage][i18nKey];

    if (headingIndex !== null) {
        heading.textContent = heading.textContent.replace("{n}", headingIndex);
    }
    wrapper.appendChild(heading);

    const table = document.createElement("table");
    table.className = "declension-table";

    const tbody = document.createElement("tbody");

    // Case display names (used for table row labels)
    // Use localized case labels for table row names.
    const caseLabels = STRINGS[currentLanguage].case_labels;

    for (const [caseKey, caseLabel] of Object.entries(caseLabels)) {
        if (forms[caseKey]) {
            const row = document.createElement("tr");

            const caseCell = document.createElement("td");
            caseCell.setAttribute("data-i18n", `case_labels.${caseKey}`);
            caseCell.textContent = caseLabel;

            const wordCell = document.createElement("td");
            wordCell.textContent = forms[caseKey];

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
 * Create a collapsible raw JSON section.
 * @param {string} headingText - The summary text.
 * @param {object} data - The data to stringify.
 * @returns {HTMLElement} The created details element.
 */
function createRawJsonToggle(headingKey, data) {
    const details = document.createElement("details");
    details.className = "raw-json";

    const summary = document.createElement("summary");
    summary.setAttribute("data-i18n", headingKey);
    summary.textContent = STRINGS[currentLanguage][headingKey];

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(data, null, 2);

    details.appendChild(summary);
    details.appendChild(pre);
    return details;
}

/**
 * Clear the results area and restore the placeholder.
 */
function clearResults() {
    const s = STRINGS[currentLanguage];
    elements.resultsArea.innerHTML = "";
    const placeholder = document.createElement("p");
    placeholder.id = "results-placeholder";
    placeholder.className = "results-placeholder";
    placeholder.textContent = s.results_placeholder;
    elements.resultsArea.appendChild(placeholder);
    elements.resultsPlaceholder = placeholder;
}

/**
 * Display an error message in the results area.
 * @param {string} message - The error message to display.
 */
function showError(message) {
    elements.resultsArea.innerHTML = "";

    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.setAttribute("role", "alert");
    errorDiv.textContent = message;

    elements.resultsArea.appendChild(errorDiv);
}