/**
 * Ruslovar API Demo — Configuration Loader
 *
 * Loads and exposes client configuration from a config.json file located
 * at the web server root. Configuration is optional; sensible defaults
 * are used when the file is missing or malformed.
 *
 * Responsibilities:
 *   - Fetch config.json once during application bootstrap.
 *   - Merge loaded values with default configuration.
 *   - Provide a synchronous getter for resolved configuration.
 *
 * Dependencies:
 *   - None (standalone module)
 */

/** Path to config file, relative to the web server root. */
const CONFIG_PATH = 'config.json';

/**
 * Default configuration values used when config.json is unavailable
 * or does not specify a key.
 *
 * @typedef {Object} AppConfig
 * @property {string} api_base_url - Base URL of the Ruslovar API server.
 */
const DEFAULT_CONFIG = {
    api_base_url: 'http://127.0.0.1:8000',
};

/**
 * Resolved configuration. Populated by loadConfig() and read via
 * getConfig().
 *
 * @type {AppConfig}
 */
let resolvedConfig = {
    ...DEFAULT_CONFIG
};

/**
 * Fetch config.json and merge the result with defaults.
 *
 * This function should be called once during application bootstrap,
 * before any API requests are made. Failures are non-fatal: defaults
 * are used and a warning is logged to the console.
 *
 * @returns {Promise<void>} Resolves when configuration has been loaded
 *     (or when loading has failed and defaults are in place).
 */
export async function loadConfig() {
    try {
        const response = await fetch(CONFIG_PATH);

        if (!response.ok) {
            console.warn(`Could not load ${CONFIG_PATH} (HTTP ${response.status}), using defaults.`);
            return;
        }

        const userConfig = await response.json();

        resolvedConfig = {
            ...DEFAULT_CONFIG,
            ...userConfig,
        };
    } catch (error) {
        console.warn(`Error loading ${CONFIG_PATH}, using defaults.`, error);
    }
}

/**
 * Return the resolved configuration.
 *
 * Safe to call at any time; returns defaults if loadConfig() has not
 * completed or failed.
 *
 * @returns {AppConfig} The resolved configuration object.
 */
export function getConfig() {
    return resolvedConfig;
}