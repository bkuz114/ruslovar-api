# Ruslovar API Web Client State Management System — Developer Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Architecture](#3-architecture)
4. [State Management Flow](#4-state-management-flow)
5. [Core Modules](#5-core-modules)
   - 5.1 [Store (`core/store.js`)](#51-store-corestorejs)
   - 5.2 [Data Layer (`core/data-layer.js`)](#52-data-layer-coredata-layerjs)
   - 5.3 [Storage Adapters (`core/storage-adapters.js`)](#54-storage-adapters-corestorage-adaptersjs)
   - 5.4 [View Registry (`core/view-registry.js`)](#55-view-registry-coreview-registryjs)
   - 5.5 [Word List Parser (`core/wordlist-parser.js`)](#56-word-list-parser-corewordlist-parserjs)
6. [View Contract](#6-view-contract)
7. [Shell Lifecycle](#7-shell-lifecycle)
8. [State Shapes](#8-state-shapes)
   - 8.1 [Single Noun View](#81-single-noun-view)
   - 8.2 [Batch Noun View](#82-batch-noun-view)
9. [Key Patterns and Invariants](#9-key-patterns-and-invariants)
10. [Expansion State Tracking](#10-expansion-state-tracking)
11. [Serialization and Round-Trip Restoration](#11-serialization-and-round-trip-restoration)
12. [Request Lifecycle and Policies](#12-request-lifecycle-and-policies)
13. [Error Handling](#13-error-handling)
14. [Testing and Debugging](#14-testing-and-debugging)
15. [Future Considerations](#15-future-considerations)

---

## 1. Overview

The Ruslovar API web client is the browser-based frontend for the Ruslovar FastAPI backend. It provides interactive access to Russian morphological data, including single noun declension lookups and batch noun processing. The application uses a view registry architecture: multiple views register themselves with a shell, and the user navigates between them via a dropdown. When navigation occurs, the currently active view is unmounted and the newly selected view is mounted. Each view maps to a specific set of API endpoints and manages its own DOM, events, and API interactions.

The state management system preserves view state across mount/unmount cycles in a vanilla JavaScript application with a view registry architecture. When a user switches between views via the navigation dropdown, the currently active view is unmounted and the newly selected view is mounted. Without state management, all user input, API results, parsed files, expansion state, and scroll position are lost.

The system is composed of three core layers: a store for namespaced state slices, a data layer for request lifecycle and caching, and a formal view contract for state capture and restoration. Together, these layers ensure that navigating away from a view and back restores the user's exact working context.

---

## 2. Problem Statement

The application shell previously destroyed all view state on navigation. Each view managed its own state via module-scoped variables, which were reset during the unmount operation. This resulted in loss of form inputs, API results, parsed files, user selections such as strict mode, UI expansion state, scroll position, and in-flight request context.

The goal is to preserve state across mount/unmount cycles without coupling views to each other or to the shell. The solution must be robust, maintainable, testable, and scalable to additional views in the future.

---

## 3. Architecture

The architecture separates concerns into three layers: views, state management, and data management.

```text
┌─────────────────────────────────────────────────────────────┐
│                        Shell (app.js)                       │
│  - Navigation and view switching                            │
│  - Loads config once and extracts api_base_url              │
│  - Captures state from old view before unmount              │
│  - Passes saved state and request context to views          │
│  - Handles per-view request policies                        │
│  - Renders error fallback if a view mount fails             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ mount(container, context)
                       │ unmount()
                       │ getState()
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Views (noun-single, noun-batch)                │
│  - Build DOM and bind events                                │
│  - Declare state contract via getState()                    │
│  - Restore internal state from context.state                │
│  - Call API methods via context.requestContext              │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               │ setState / getState      │ request / fetch
               ▼                          ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│   Store (core/store.js)   │   │  Data Layer                 │
│  - In-memory key-value    │   │  (core/data-layer/          │
│  - Namespaced by view ID  │   │   data-layer.js)            │
│  - Pub/sub notification   │   │  - Caching with TTL         │
│  - Dev-mode deep freeze   │   │  - Request deduplication    │
│  - Optional persistence   │   │  - Request lifecycle        │
└───────────────────────────┘   │  - Abort handling           │
                                │  - Request context factory  │
                                │  - Endpoint functions       │
                                └─────────────────────────────┘
```

---

## 4. State Management Flow

The following sequence describes a full view switch from the batch noun view to the single noun view and back.

```text
User switches from noun-batch to noun-single
────────────────────────────────────────────────────────────────

1. Shell detects navigation change.

2. Shell calls noun-batch.getState().

3. noun-batch returns a JSON-serializable snapshot:
   {
     version: 1,
     fileName: "nouns.txt",
     parsedDocument: { ... },
     results: { ... },
     strict: false,
     openNodeIds: ["line-5", "line-12"],
     scrollTop: 4200
   }

4. Shell stores this snapshot in the store:
   store.setState("noun-batch", snapshot)

5. Shell calls noun-batch.unmount().
   noun-batch resets its module-scoped variables.
   DOM is discarded.

6. Shell creates a request context for noun-single:
   createRequestContext("noun-single", "survive-unmount", apiBaseUrl)

7. Shell calls noun-single.mount(container, context).
   context.state is read from the store:
   store.getState("noun-single")
   context.requestContext is the context from step 6.

8. noun-single builds its DOM and restores from context.state.
   Form input, strict mode, results, and scroll position are restored.
   requestContext is stored for later API calls.

Later: user switches back to noun-batch
────────────────────────────────────────────────────────────────

9. Shell calls noun-single.getState().
   noun-single returns its snapshot.

10. Shell stores noun-single state in the store.

11. Shell calls noun-single.unmount().

12. Shell creates a request context for noun-batch:
    createRequestContext("noun-batch", "abort-on-unmount", apiBaseUrl)

13. Shell calls noun-batch.mount(container, context).
    context.state contains the snapshot from step 3.
    context.requestContext is the context from step 12.

14. noun-batch restores:
    - WordListDocument.fromJSON(state.parsedDocument)
    - File name
    - API results
    - Strict mode
    - Expansion state (openNodeIds)
    - Scroll position

The user is returned to exactly where they left off.
```

---

## 5. Core Modules

### 5.1 Store (`core/store.js`)

The store is a singleton module that provides a minimal, framework-agnostic state container. It is intentionally dumb and does not validate state shape or know about views.

**API:**

- `getState(namespace)` — Returns the stored state slice for a namespace, or undefined.
- `setState(namespace, state)` — Replaces the stored state for a namespace and notifies subscribers.
- `hasState(namespace)` — Returns true if the namespace has stored state.
- `clearState(namespace)` — Removes stored state for a namespace.
- `subscribe(namespace, callback)` — Registers a change listener. Returns an unsubscribe function.
- `enablePersistence(namespace, options)` — Enables optional persistence for a namespace using a storage adapter.
- `disablePersistence(namespace)` — Disables persistence for a namespace.
- `loadPersistedState()` — Loads persisted state for all namespaces with persistence enabled.

**Key invariants:**

- State objects are stored by reference. Callers must not mutate a state object returned by `getState()`.
- In development mode, state objects are deeply frozen on both `getState()` and `setState()`. This catches accidental mutation during development.
- State replacement is the only supported operation. No merging is performed.
- Persistence is opt-in per namespace. The store core is in-memory only.

### 5.2 Data Layer (`core/data-layer/data-layer.js`)

The data layer manages request lifecycle independently of views. It provides caching, deduplication, request tracking, abort handling, and a request context factory.

**API:**

- `request(options)` — Performs a request with caching and lifecycle management. Returns a request handle with `promise` and `cancel()`.
- `getCached(cacheKey)` — Checks the cache for a fresh response without triggering a fetch.
- `abortRequestsForView(viewId)` — Aborts all active requests for a view.
- `clearCache()` — Removes all cached entries and pending request tracking.
- `buildCacheKey(endpoint, params)` — Generates a canonical cache key from an endpoint and parameters.
- `createRequestContext(viewId, requestPolicy, baseUrl)` — Creates a request context bound to a view's identity, policy, and base URL.

**Key options for `request()`:**

- `cacheKey` — Unique string identifying the request.
- `fetcher` — Function that performs the actual fetch. Receives an AbortSignal.
- `viewId` — Optional ID of the requesting view.
- `requestPolicy` — Either `survive-unmount` (default) or `abort-on-unmount`.
- `ttl` — Cache time-to-live in milliseconds. Defaults to 5 minutes.

**Key invariants:**

- Identical in-flight requests share the same underlying promise.
- A new request for the same view aborts the previous request for that view.
- Abort-on-unmount requests are aborted when the shell calls `abortRequestsForView()`.
- Successful responses are cached with their TTL.
- Stale cache entries are removed automatically on access.

### 5.3 Storage Adapters (`core/data-layer/storage-adapters.js`)

Storage adapters provide the Web Storage API interface (`getItem`, `setItem`, `removeItem`) for the store's persistence mechanism.

**Exports:**

- `localStorageAdapter` — Persistent across browser sessions. Falls back to in-memory storage if localStorage is unavailable.
- `sessionStorageAdapter` — Persistent only for the current tab session. Falls back to in-memory storage if sessionStorage is unavailable.

### 5.4 View Registry (`core/view-registry.js`)

The view registry is the single source of truth for view identity and view-related metadata.

**View descriptor fields:**

- `id` — Unique string identifier.
- `labelKey` — i18n key for the navigation label.
- `strings` — Localized string table.
- `mount` — Function called with `(container, context)` when the view becomes active.
- `unmount` — Optional cleanup function.
- `getState` — Optional but strongly recommended for stateful views. Returns a JSON-serializable snapshot.
- `requestPolicy` — Optional. `survive-unmount` (default) or `abort-on-unmount`.

The registry validates required fields and types. It warns in development mode if a view lacks `getState()`.

### 5.5 Word List Parser (`core/wordlist-parser.js`)

The word list parser produces a `WordListDocument` instance from raw text input. Both categories and words are represented as nodes with stable, line-number-based IDs.

**Key methods:**

- `parse()` — Parses raw text.
- `countWords()` — Returns total word count.
- `allWords()` — Returns all words depth-first.
- `allNodes()` — Returns all nodes in document order.
- `getNodeById(id)` — Returns a node by ID or null.
- `toJSON()` — Returns a serializable plain object.
- `WordListDocument.fromJSON(json)` — Reconstructs a document from serialized JSON.

The parser supports full round-trip serialization. A document saved via `toJSON()` can be restored via `fromJSON()` without re-parsing the original text.

---

## 6. View Contract

Each view that needs state preservation implements `getState()` and restores state in `mount()`.

**`mount(container, context)`**

- `container` — The DOM element to mount into.
- `context.state` — The saved state slice, or undefined if none.
- `context.urlParams` — A URLSearchParams instance for the current URL.
- `context.isFirstMount` — True if no saved state exists.
- `context.requestContext` — Pre-bound API methods for this view's identity and request policy.

The view builds its DOM, binds events, and if `context.state` is present and valid, restores its internal state from it. The view may also check `context.urlParams` for deep-link support.

The view stores `context.requestContext` for later use. When the view needs to contact the API, it calls methods on that context rather than importing API functions directly.
`

**`unmount()`**

- Performs cleanup only. State preservation is handled by the shell calling `getState()` before `unmount()`.

**`getState()`**

- Returns a plain, JSON-serializable object representing the current state.
- Must include a `version` field.
- Called by the shell before unmount.

---

## 7. Shell Lifecycle

The shell coordinates view switching and state preservation.

**`mountView(viewId)`**

1. Looks up the old view by `activeViewId`.
2. Calls `oldView.getState()` and stores the result in the store.
3. If the old view has `abort-on-unmount` policy, calls `abortRequestsForView(oldView.id)`.
4. Calls `oldView.unmount()`.
5. Clears the mount container.
6. Reads saved state from the store for the new view.
7. Creates a request context via `createRequestContext(viewId, view.requestPolicy, apiBaseUrl)`.
8. Builds the context object containing saved state, URL params, first-mount flag, and request context.
9. Calls `newView.mount(container, context)`.
10. If the mount function throws synchronously or returns a rejected promise, renders an error fallback.
`

**`unmountActiveView()`**

1. Captures state via `getState()`.
2. Handles request policy.
3. Calls `unmount()`.
4. Sets `activeViewId` to null.

Every boundary is wrapped in try/catch. Errors are logged and the application continues.

Also, the shell loads configuration once during `init()` via `loadConfig()`. It extracts `api_base_url` and stores it in a module-level variable. This value is passed to `createRequestContext()` during each mount. The data layer never calls `getConfig()` directly.


---

## 8. State Shapes

### 8.1 Single Noun View

```json
{
  "version": 1,
  "input": "кролик",
  "strict": true,
  "results": { },
  "scrollTop": 420
}
```

- `input` — Current word input value.
- `strict` — Strict mode checkbox state.
- `results` — Full API response from the most recent lookup, or null.
- `scrollTop` — Results area scroll position.

### 8.2 Batch Noun View

```json
{
  "version": 1,
  "fileName": "nouns.txt",
  "parsedDocument": { },
  "results": { },
  "strict": false,
  "openNodeIds": ["line-5", "line-12"],
  "scrollTop": 4200
}
```

- `fileName` — Original file name, if available.
- `parsedDocument` — Serialized WordListDocument via `toJSON()`.
- `results` — Full API response from the most recent batch submission, or null.
- `strict` — Strict mode checkbox state.
- `openNodeIds` — Array of node IDs that are currently open.
- `scrollTop` — Results area scroll position.

---

## 9. Key Patterns and Invariants

**Module-scoped state during view lifetime.**

Views hold their state in module-scoped variables during their active lifetime. The DOM is a projection of this state, not the source of truth. For example, the single noun view stores `lastResults` in a module variable rather than reconstructing it from the DOM.

**Snapshot on `getState()`.**

`getState()` packages module state into a plain, serializable object. It must not return live objects that could be mutated by the store or by subsequent view operations.

**Restore on mount.**

`mount()` reads `context.state` and rebuilds the view's module state from it. The view must validate the state version before restoring.

**Do not mutate store state.**

State objects returned by `store.getState()` are deeply frozen in development mode. Callers must create new objects and call `setState()` to update state.

**Set `open` before attaching toggle listeners.**

When rendering `<details>` elements, set the initial `open` state before attaching the `toggle` event listener. This prevents spurious toggle events during restoration.

**Reset `openNodeIds` after restoration.**

During restoration, render functions may fire toggle events that mutate `openNodeIds`. After rendering completes, `openNodeIds` is reset to a pristine copy of the restored snapshot.

---

## 10. Expansion State Tracking

Expansion state for the batch view tracks which category and word panels are open.

- A module-level `Set` named `openNodeIds` holds the IDs of open nodes.
- Each `<details>` element gets a `toggle` event listener that adds or removes its node ID from the set.
- `getState()` serializes the set to an array.
- Restoration converts the array back to a set and passes a snapshot to render functions.
- After rendering, `openNodeIds` is reset to a copy of the snapshot.

Category nodes and word nodes both have stable IDs derived from line numbers in the source file. IDs are unique within a parsed document and stable across parses of the same content.

---

## 11. Serialization and Round-Trip Restoration

The word list parser supports full round-trip serialization.

**Serialization:**

```js
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();
const json = doc.toJSON();
```

**Deserialization:**

```js
const restored = WordListDocument.fromJSON(json);
```

The restored document is fully functional. `countWords()`, `allWords()`, `allNodes()`, and `getNodeById()` all work immediately.

The batch view stores `parsedDocument.toJSON()` in state and reconstructs it via `WordListDocument.fromJSON()` during restoration. This avoids re-parsing the original file and preserves all document functionality.

---

## 12. Request Lifecycle and Policies

Requests are owned by the data layer, not by views.

**Policies:**

- `survive-unmount` — The request continues after the view unmounts. The result is cached and available on remount. This is the default policy and is used by the single noun view.
- `abort-on-unmount` — The request is aborted when the view unmounts. This is used by the batch noun view because batch requests are expensive and the user may navigate away without needing the result.

**Request context:**

View-bound requests are made through a request context created by the shell. The context is built with the view's ID, request policy, and base URL. Views call methods on the context (e.g., `requestContext.fetchNounBatch(words, strict)`). The context supplies the view's identity and policy to the underlying `request()` call automatically.

This ensures that every request made by a view is tracked by the data layer with the correct view ID, enabling per-view abort behavior without requiring views to pass their identity at each call site.
`

**Cancel on new request:**

If a view submits a new request for the same endpoint, the previous request for that view is aborted. This prevents stale responses from overwriting newer ones.

**Deduplication:**

Identical requests in flight share the same underlying promise. No duplicate fetches occur.

**Caching:**

Successful responses are cached with a TTL. Fresh cache entries are returned immediately without calling the fetcher. Stale entries are removed automatically.

---

## 13. Error Handling

Error handling occurs at every boundary.

**Shell:**

- `getState()` throwing is caught and logged. State may be lost but the app continues.
- `unmount()` throwing is caught and logged.
- `mount()` throwing synchronously or returning a rejected promise is caught and logged. An error fallback is rendered in the mount container.

**Data layer:**

- Fetcher errors propagate to the caller.
- Abort errors are distinguishable by `error.name === 'AbortError'`.
- Cache and pending request entries are cleaned up on success, failure, and abort.

**Store:**

- Subscriber errors are caught and logged. They do not prevent other subscribers from being notified.
- Persistence failures are caught and logged. They do not prevent in-memory state from being updated.

---

## 14. Testing and Debugging

**Store tests.**

- Test `setState`, `getState`, `hasState`, `clearState`.
- Test subscriber notification and unsubscribe behavior.
- Test that state objects are deeply frozen in development mode.

**Data layer tests.**

- Test cache hit and miss.
- Test deduplication of identical in-flight requests.
- Test abort on new request for the same view.
- Test abort on unmount via `abortRequestsForView()`.
- Test TTL expiration.

**Parser tests.**

- Test `toJSON()` and `fromJSON()` round-trip.
- Test that restored documents have working `countWords()`, `allWords()`, `allNodes()`, and `getNodeById()`.
- Test ID stability and uniqueness.

**View tests.**

- Test `getState()` returns the expected shape.
- Test `mount()` with no state builds a fresh UI.
- Test `mount()` with state restores the UI.
- Test expansion state restoration.

For development mode, the data layer logs request lifecycle events to the console. This provides visibility into caching, deduplication, and abort behavior.

---

## 15. Future Considerations

**LocalStorage persistence.**

The store API is ready for persistence. Enable it per namespace with `enablePersistence()` and a storage adapter from `core/data-layer/storage-adapters.js`. State slices include a `version` field for future migration support.

**Virtualization for large result sets.**

When batch results grow beyond approximately 1000 words, DOM-based rendering may become a performance bottleneck. Virtualization would replace `scrollTop` with an index-based approach. The view contract and state shape are designed to accommodate this without breaking changes.

**Cross-view shared state.**

If views need to share data, create a `shared` namespace in the store. Both views read and write `store.getState('shared')` and `store.setState('shared', ...)`. No direct view-to-view coupling.

**Undo and redo.**

The store's pub/sub mechanism supports future undo/redo functionality. A history of state snapshots per namespace could be maintained and restored on demand.

**Formal migration framework.**

State slices include a `version` field. When a view's state shape changes, the view can implement a migration map to transform old state to the new shape. This is currently handled per view and can be formalized later if migrations become frequent.

---

This document will be updated as the state management system evolves and as new views are added.
