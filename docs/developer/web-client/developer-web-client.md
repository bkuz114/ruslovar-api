# Ruslovar Web Client — Architecture Documentation

This document describes the architecture, design decisions, and development conventions for the Ruslovar browser-based client. It is intended for developers who need to understand, maintain, or extend the codebase.

---

## Purpose and Scope

The web client provides a browser-based interface for querying the Ruslovar API. It currently supports two views:

1. **Single noun lookup** — query declensions for one Russian noun.
2. **Batch noun lookup** — upload a word list and query declensions for multiple nouns in one request.

The client is intentionally **vanilla JavaScript** with no frameworks and no build step. It uses native ES modules and is served directly from the repository.

---

## Directory Layout

```
web-client/
  index.html              # Application shell (header, nav, mount point)
  config.json              # Optional runtime configuration (API base URL)
  css/
    base.css               # Design tokens, reset, header, nav, language switcher
    components.css         # Shared component styles (tables, metadata, submit controls, etc.)
    views/
      noun-single.css      # View-specific styles for single noun lookup
      noun-batch.css       # View-specific styles for batch noun lookup
  js/
    app.js                 # Application shell bootstrap and view lifecycle
    core/
      config.js            # Config loading and access
      i18n.js              # String lookup and DOM language switching
      api.js               # API request functions and typed errors
      errors.js            # Error classes
      dom.js               # DOM utility functions
      renderers.js         # Shared rendering functions
      view-registry.js     # Single source of truth for view descriptors
    views/
      noun-single.js       # Single noun lookup view
      noun-batch.js        # Batch noun lookup view
```

---

## Architecture Overview

The client is organized around a **view registry** and a set of **core services**.

- The **view registry** is the single source of truth for view identity and view-related data (including localized strings).
- **Core services** provide cross-cutting concerns: configuration, API access, i18n, DOM utilities, and shared rendering.
- **Views** are self-contained modules that register themselves with the view registry and define their own mount/unmount lifecycle.

The application shell (`app.js`) bootstraps the core services, renders navigation, and manages the active view.

---

## View Registry

`js/core/view-registry.js`

The view registry stores descriptors for all registered views. A view descriptor is a plain object:

```js
{
    id: 'noun-single',              // Unique identifier
    labelKey: 'view_label',         // i18n key for navigation label
    strings: VIEW_STRINGS,          // Localized strings for this view
    mount(container) { ... },       // Build DOM and bind events
    unmount() { ... },              // Clean up (optional but recommended)
}
```

Key principles:

- Each view declares its own `strings` object. The view registry does not interpret or validate the contents; it only ensures the field exists.
- The `id` is the canonical identity for a view. It is used by the shell for navigation and by i18n for string lookup.
- Registration happens at module load time. View modules call `registerView()` when they are imported.

---

## i18n Architecture

`js/core/i18n.js`

The i18n module handles language switching (Russian/English). It contains the strings that are shared across views. View-specific strings live on the view descriptor in the view registry.

### String Lookup

A single function provides all string resolution:

```js
getString(key, { viewId, lang })
```

- If `viewId` is provided, the string is resolved against that view's strings.
- If `viewId` is omitted, the string is resolved against shared strings.
- If `lang` is omitted, the current language is used.

Examples:

```js
// Shared string
getString('submit_button');

// View-specific string
getString('word_label', { viewId: 'noun-single' });

// With explicit language
getString('case_labels.nominative', { lang: 'en' });
```

### DOM Updates

Language switching is handled by `applyLanguage(lang)`. It scans the document for elements with `data-i18n` attributes and updates their text content in place.

For view-specific strings, elements must also carry a `data-i18n-view` attribute:

```html
<label data-i18n="word_label" data-i18n-view="noun-single">
```

For shared strings, `data-i18n-view` is omitted:

```html
<h2 data-i18n="singular_heading">
```

### Placeholder Substitution

Some strings contain a `{n}` placeholder (e.g., `"Plural {n}"`). To support in-place language switching without losing the substituted value, elements can carry a `data-i18n-arg` attribute:

```html
<h2 data-i18n="plural_heading_numbered" data-i18n-arg="2">
```

`applyLanguage()` substitutes the arg value into the resolved string.

### Lookup Rules

- If `data-i18n-view` is present, the string is resolved against that view's strings first.
- If not found there, a `console.warn` is logged and shared strings are checked as a fallback.
- If `data-i18n-view` is absent, the string is resolved against shared strings only.
- If the key cannot be resolved anywhere, a `console.error` is logged.

### Design Rules

1. **Shared renderers use only shared strings.** If a function in `core/renderers.js` needs a string, it must be in `SHARED_STRINGS`.
2. **View-specific rendering uses view strings.** If a string is only used by one view, it belongs on that view's descriptor.
3. **No hidden state.** i18n does not track the "current view." Callers pass the view ID explicitly via the options object.

---

## Shared Renderers

`js/core/renderers.js`

Shared renderers build DOM elements that are used by multiple views. They must only use shared strings.

Current shared renderers:

- `createDeclensionTable(i18nKey, forms, headingIndex)` — builds a declension table for a set of case forms.
- `createMetadataSection(match)` — builds the root heading, invariant badge, gender, and animacy metadata.
- `createMatchTabs(matches, container)` — builds a tab bar for switching between multiple matches.
- `createMatchesContainer(result, options)` — builds all matches for a word, using either `tabs` or `stacked` layout.
- `createRawJsonToggle(data)` — builds a collapsible raw JSON section.
- `createSubmitControls(options)` — builds the strict mode checkbox group and submit button.

### Submit Controls

`createSubmitControls` returns an object:

```js
{
    element,       // wrapper to append to the view DOM
    submitButton,  // button element (for click binding or disabled state)
    isStrictMode,  // function returning the current checkbox state
}
```

Options:

- `submitType` — `'submit'` (default) or `'button'`.
- `disable` — `true` to render the button disabled (default `false`).

If additional API parameters are added in the future, they should be added to `createSubmitControls` so both views receive them without changes.

**Important:** If a future API endpoint introduces a parameter that is specific to one view (e.g., batch-only or single-only), that control should be built in the affected view and appended alongside the shared submit controls, rather than added to `createSubmitControls`.

---

## View Lifecycle

`js/app.js`

The application shell manages the active view.

1. On load, all view modules are imported. Each calls `registerView()`.
2. `init()` loads config, restores language preference, renders navigation, and mounts the first registered view.
3. When the user selects a different view from the dropdown, the shell:
   - Calls `unmount()` on the current view (if defined).
   - Clears the mount container.
   - Calls `mount(container)` on the new view.
4. Language switching does **not** remount views. All `data-i18n` elements update in place.

### View Module Responsibilities

A view module (`js/views/noun-single.js`) is responsible for:

- Defining its `VIEW_STRINGS`.
- Registering itself via `registerView()`.
- Building its DOM in `mount()`.
- Binding event listeners.
- Cleaning up in `unmount()`.
- Rendering its own dynamic content using shared renderers where appropriate.

---

## API Access

`js/core/api.js`

All HTTP requests go through the API module. It provides:

- `fetchNounDeclensions(word, strict)` — GET request for single noun.
- `fetchNounBatch(words, strict)` — POST request for batch nouns.

The API module also normalizes errors into typed error classes:

- `NetworkError` — fetch failed (no response).
- `HttpError` — non-2xx status code.
- `ParseError` — response body could not be parsed.

Views catch these errors and map them to user-facing messages via i18n.

---

## Configuration

`js/core/config.js`

Configuration is loaded from `config.json` at startup. If the file is missing or malformed, defaults are used.

The only current configuration key is:

```json
{
  "api_base_url": "http://127.0.0.1:8000"
}
```

---

## CSS Organization

CSS is split into shared and view-specific files.

- `base.css` — design tokens (`:root` custom properties), reset, typography, header, nav, language switcher, layout.
- `components.css` — shared component styles (declension tables, metadata, submit controls, match tabs, raw JSON, error messages).
- `views/noun-single.css` — styles specific to the single noun view.
- `views/noun-batch.css` — styles specific to the batch noun view.

All colors, spacing, fonts, and borders are defined as CSS custom properties in `base.css`. No raw values should appear in component or view stylesheets.

---

## Adding a New View

To add a new view (e.g., adjective lookup):

1. Create `js/views/adjective-single.js`.
2. Define `VIEW_STRINGS` with `view_label` and any view-specific keys.
3. Define the view descriptor:

```js
const VIEW_ID = 'adjective-single';

registerView({
    id: VIEW_ID,
    labelKey: 'view_label',
    strings: VIEW_STRINGS,
    mount(container) { ... },
    unmount() { ... },
});
```

4. Import the view in `js/app.js` so it self-registers.
5. Create `css/views/adjective-single.css` and lazy-load it in `mount()` via `loadStylesheet()`.
6. Use shared renderers where possible. If a string is only used by this view, keep it in `VIEW_STRINGS` and set `data-i18n-view` on elements that use it.

---

## Error Handling Conventions

- API errors are typed (`ApiError` subclasses).
- Views catch errors and map them to localized messages.
- `console.error` is used for unexpected failures that indicate bugs.
- `console.warn` is used for recoverable issues (e.g., missing config, fallback string lookup).

---

## Future Considerations

- **Additional views** — adjective declensions, other parts of speech.
- **Batch filters** — show/hide singular or plural tables in batch view.
- **Deep linking** — URL parameters for view state.
- **Input validation** — Cyrillic-only validation for single view word input.
- **Testing** — no test scaffolding yet, but core modules (i18n, parsing, renderers) are good candidates for unit tests.

When adding new subsystems, avoid duplicating view identity. The view registry should remain the single source of truth for view-related data.
