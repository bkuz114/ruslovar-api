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
        singular_heading: "Единственное число",
        plural_heading: "Множественное число",
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
        singular_heading: "Singular",
        plural_heading: "Plural",
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

// ==========================================================================
// Rendering
// ==========================================================================

/**
 * Render the declension table and raw JSON into the results area.
 * @param {object} data - The parsed API response.
 */
function renderResults(data) {
    const container = document.createElement("div");

    // Word info header
    const wordInfo = document.createElement("p");
    wordInfo.className = "word-info";
    wordInfo.textContent = `${data.word} → ${data.root}`;
    container.appendChild(wordInfo);

    // Build singular and plural tables
    if (hasAnyForms(data.singular)) {
        container.appendChild(createDeclensionTable("singular_heading", data.singular));
    }

    if (hasAnyForms(data.plural)) {
        container.appendChild(createDeclensionTable("plural_heading", data.plural));
    }

    // Raw JSON toggle
    container.appendChild(createRawJsonToggle("raw_json_heading", data));

    elements.resultsArea.innerHTML = "";
    elements.resultsArea.appendChild(container);
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
 * @param {string} headingText - The heading for this table.
 * @param {object} forms - The case forms object.
 * @returns {HTMLElement} The created table wrapped in a container.
 */
function createDeclensionTable(i18nKey, forms) {
    const wrapper = document.createElement("div");
    wrapper.className = "declension-section";

    const heading = document.createElement("h2");
    heading.className = "declension-heading";
    heading.setAttribute("data-i18n", i18nKey);
    heading.textContent = STRINGS[currentLanguage][i18nKey];
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