# Word List Parser

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Input Format](#input-format)
4. [Public API](#public-api)
   - [WordListDocument](#wordlistdocument)
   - [CategoryNode](#categorynode)
   - [WordNode](#wordnode)
5. [Node Identity and IDs](#node-identity-and-ids)
6. [Serialization and Reconstruction](#serialization)
7. [Freezing and Immutability](#freezing-and-immutability)
8. [Traversal and Queries](#traversal-and-queries)
9. [Validation and Error Handling](#validation-and-error-handling)
10. [Design Rationale](#design-rationale)
11. [Usage in Views](#usage-in-views)
12. [Testing](#testing)

---

## Overview

The word list parser converts plain-text word list files into a structured, class-based object model. It is used by batch lookup views to read user-provided files, extract words, and send them to the server for processing.

The parser supports:

- Optional YAML-style frontmatter for metadata
- Markdown-style category headings (`#`, `##`, `###`, etc.)
- Arbitrary category nesting depth
- Words before any heading (implicit category)

The parser is implemented as three exported classes:

| Class | Responsibility |
|---|---|
| `WordListDocument` | Main entry point. Holds raw text and parsed state. |
| `CategoryNode` | Represents a category heading and its contents. |
| `WordNode` | Represents a single word. |

The module supports full round-trip serialization via `toJSON()` and static `fromJSON()` methods on all three classes.

The module is standalone and has no dependencies.

---

## Getting Started

### Basic Usage

```js
import { WordListDocument } from '../core/wordlist-parser.js';

const rawText = `---
title: My batch
description: Practice words
---
# Nouns
кролик
лук

## Masculine
стол
`;

const doc = new WordListDocument(rawText);
doc.parse();

console.log(doc.metadata);
// { title: "My batch", description: "Practice words" }

console.log(doc.categories.length);
// 1

console.log(doc.countWords());
// 3

console.log(doc.allWords());
// ["кролик", "лук", "стол"]
```

### Immutable Document

```js
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();

// The document and all nested structures are now deeply frozen.
// Any attempt to mutate them will throw in strict mode.
```

### Accessing Nodes by ID

```js
const node = doc.getNodeById('line-5');

if (node && node.type === 'word') {
    console.log(node.word); // "кролик"
}
```

---

## Input Format

The parser accepts plain text with the following structure:

```
---
title: My batch
description: Practice words
---
# Nouns
кролик
лук

## Masculine
стол

## Feminine
лука

# Adjectives
красный
```

### Rules

- **Frontmatter** is optional. If present, it must be at the top of the file, enclosed by lines containing exactly `---`.
- **Frontmatter keys and values** are separated by a colon and optional whitespace.
- **Category headings** start with one or more `#` characters. The number of `#` characters determines the nesting level: `#` is level 1, `##` is level 2, etc.
- **Words** are any non-empty lines that do not start with `#` and are not inside the frontmatter block.
- **Blank lines** are ignored.
- **Malformed input** throws an `Error` with a descriptive message including the line number where the problem occurred.

### Implicit Category

Words that appear before any heading are grouped into an implicit category with an empty name:

```
удочка
леска

# Рыбы
щука
```

This produces:

- An implicit category (name `""`, level `1`) containing `удочка` and `леска`
- A top-level category `Рыбы` containing `щука`

The implicit category is prepended to the explicit categories in the document's `categories` array.

---

## Public API

### WordListDocument

The main entry point for parsing word list files.

#### Constructor

```js
new WordListDocument(rawText, { freeze = false } = {})
```

| Parameter | Type | Description |
|---|---|---|
| `rawText` | string | Raw word list file contents. Empty string allowed. |
| `options.freeze` | boolean | Whether to deeply freeze after parsing. Default `false`. |

#### Getters

| Getter | Returns | Description |
|---|---|---|
| `metadata` | object | Frontmatter key-value pairs. |
| `categories` | CategoryNode[] | Top-level categories. |
| `hasBeenParsed` | boolean | Whether `parse()` has been called successfully. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `parse()` | void | Parses raw text and populates state. Throws if already frozen. |
| `countWords()` | number | Total word count. Throws if not parsed. |
| `allWords()` | string[] | Flat array of word strings in depth-first order. Throws if not parsed. |
| `getNodeById(id)` | WordNode \| CategoryNode \| null | Lookup node by ID. Returns `null` for unknown IDs. Throws if not parsed. |
| `allNodes()` | Array<WordNode \| CategoryNode> | All nodes in document order. Throws if not parsed. |
| `toJSON()` | object | Serializable representation: `{ rawText, freeze, isParsed, metadata, categories }`. Throws if not parsed. |
| `fromJSON(json)` | WordListDocument | Static. Reconstructs a document from JSON string or plain object. See [Serialization](#serialization). |

#### Example

```js
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();

doc.metadata;        // { title: "My batch", ... }
doc.categories;      // [CategoryNode, ...]
doc.countWords();    // 6
doc.allWords();      // ["кролик", "лук", "стол", ...]
doc.getNodeById('line-5'); // WordNode | CategoryNode | null
doc.allNodes();      // [CategoryNode|WordNode, ...] in document order
doc.toJSON();        // { rawText: "...", freeze: true, isParsed: true, metadata: {...}, categories: [...] }
```

---

### CategoryNode

Represents a category heading and its contents.

#### Constructor

```js
new CategoryNode(name, level, lineNumber, words = [], subcategories = [], freeze = false)
```

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Category name. Empty string allowed for implicit category. |
| `level` | number | Heading level. Positive integer (1+). |
| `lineNumber` | number | 1-based source line number. |
| `words` | WordNode[] | Direct word nodes. Default `[]`. |
| `subcategories` | CategoryNode[] | Nested category nodes. Default `[]`. |
| `freeze` | boolean | Freeze instance and arrays. Default `false`. |

#### Getters

| Getter | Returns | Description |
|---|---|---|
| `type` | string | Always `'category'`. |
| `id` | string | Deterministic ID (`line-<n>`). |
| `name` | string | Category name without `#` characters. |
| `level` | number | Heading level. |
| `lineNumber` | number | 1-based source line number. |
| `words` | WordNode[] | Direct word nodes. |
| `subcategories` | CategoryNode[] | Nested subcategories. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `countWords()` | number | Total words including all descendants. |
| `allWords()` | string[] | Flat array of word strings in depth-first order. |
| `toJSON()` | object | Serializable representation: `{ type, id, lineNumber, name, level, words, subcategories, freeze }`. |
| `fromJSON(data)` | CategoryNode | Static. Reconstructs a category from a plain object. See [Serialization](#serialization). |

#### Example

```js
const category = new CategoryNode('Nouns', 1, 4);
category.words.push(new WordNode('кролик', 5));
category.words.push(new WordNode('лук', 6));

category.countWords(); // 2
category.allWords();   // ["кролик", "лук"]
category.toJSON();
// {
//   type: "category",
//   id: "line-4",
//   lineNumber: 4,
//   name: "Nouns",
//   level: 1,
//   words: [
//     { type: "word", id: "line-5", lineNumber: 5, word: "кролик", freeze: false },
//     { type: "word", id: "line-6", lineNumber: 6, word: "лук", freeze: false }
//   ],
//   subcategories: [],
//   freeze: false
// }
```

---

### WordNode

Represents a single word in the parsed document.

#### Constructor

```js
new WordNode(word, lineNumber, freeze = false)
```

| Parameter | Type | Description |
|---|---|---|
| `word` | string | The word text. Non-empty. |
| `lineNumber` | number | 1-based source line number. |
| `freeze` | boolean | Freeze instance. Default `false`. |

#### Getters

| Getter | Returns | Description |
|---|---|---|
| `type` | string | Always `'word'`. |
| `id` | string | Deterministic ID (`line-<n>`). |
| `lineNumber` | number | 1-based source line number. |
| `word` | string | The word text. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `toJSON()` | object | Serializable representation: `{ type, id, lineNumber, word, freeze }`. |
| `fromJSON(data)` | WordNode | Static. Reconstructs a word node from a plain object. See [Serialization](#serialization). |

#### Example

```js
const wordNode = new WordNode('кролик', 5);

wordNode.type;        // "word"
wordNode.id;          // "line-5"
wordNode.lineNumber;  // 5
wordNode.word;        // "кролик"
wordNode.toJSON();
// { type: "word", id: "line-5", lineNumber: 5, word: "кролик", freeze: false }
```

---

## Node Identity and IDs

Every node has a deterministic ID derived from the 1-based line number where it appears in the source file.

- `line-1` for the first line
- `line-5` for the fifth line
- `line-42` for the forty-second line

### Why Line Numbers?

1. **Unique per document** — Two nodes cannot share the same source line.
2. **Deterministic** — The same word or category in the same document always produces the same ID.
3. **Helpful for debugging** — The ID directly tells you where in the source file the node came from.

### Stability

IDs are stable across parses of the same raw text. If the raw text changes, IDs will shift accordingly. This is expected behavior—the ID reflects the source line, not the semantic content.

### lineNumber Getter

Every node exposes a `lineNumber` getter that returns the 1-based source line number used to generate its ID. This is useful for debugging and for serialization:

```js
const word = doc.getNodeById('line-5');
word.lineNumber; // 5
```

The `lineNumber` is included in `toJSON()` output and used by`fromJSON()` to reconstruct the node with the correct ID.

---

## Serialization

All node classes implement `toJSON()`, which returns plain objects suitable for `JSON.stringify`. The `toJSON()` output includes all state needed for full round-trip reconstruction.

### Document Serialization

```js
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();

const json = doc.toJSON();
// {
//   rawText: "---\ntitle: Test\n---\n# Nouns\nкролик\n",
//   freeze: true,
//   isParsed: true,
//   metadata: { title: "Test" },
//   categories: [...]
// }

const stringified = JSON.stringify(json);
```

The document `toJSON()` includes:

| Field | Type | Description |
|---|---|---|
| `rawText` | string | Original raw text. Needed for re-parsing. |
| `freeze` | boolean | Original freeze flag from construction. |
| `isParsed` | boolean | Whether `parse()` had been called. |
| `metadata` | object | Frontmatter key-value pairs. |
| `categories` | Array | Category tree, recursively serialized. |

### Node Serialization

Every `WordNode` and `CategoryNode` includes:

| Field | Type | Description |
|---|---|---|
| `type` | string | `'word'` or `'category'` |
| `id` | string | Deterministic ID (`line-<n>`) |
| `lineNumber` | number | 1-based source line number |
| `freeze` | boolean | Actual frozen state (detected via `Object.isFrozen()`) |

Example `WordNode` JSON:

```json
{
  "type": "word",
  "id": "line-5",
  "lineNumber": 5,
  "word": "кролик",
  "freeze": true
}
```

Example `CategoryNode` JSON:

```json
{
  "type": "category",
  "id": "line-4",
  "lineNumber": 4,
  "name": "Nouns",
  "level": 1,
  "words": [...],
  "subcategories": [...],
  "freeze": true
}
```

### Reconstruction with fromJSON()

All three classes provide static `fromJSON()` methods. They accept either a JSON string or a plain object.

```js
// Full document round-trip
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();

const json = JSON.stringify(doc);
const restored = WordListDocument.fromJSON(json);

restored.hasBeenParsed;   // true
restored.metadata;        // { title: "Test" }
restored.categories;      // [CategoryNode, ...]
restored.countWords();    // works immediately
restored.getNodeById('line-5'); // works immediately
restored.allNodes();      // works immediately
Object.isFrozen(restored); // true (matches original)
```

```js
// Standalone node round-trip
const word = new WordNode('кролик', 5, true);
const json = word.toJSON();
const restoredWord = WordNode.fromJSON(json);

restoredWord.word;        // "кролик"
restoredWord.id;          // "line-5"
Object.isFrozen(restoredWord); // true
```

```js
// CategoryNode round-trip (recursive)
const category = new CategoryNode('Nouns', 1, 4, [], [], true);
const json = category.toJSON();
const restoredCategory = CategoryNode.fromJSON(json);

restoredCategory.name;    // "Nouns"
restoredCategory.id;      // "line-4"
Object.isFrozen(restoredCategory); // true
```

### Key Points

- No circular references.
- Render functions can accept either live nodes or plain objects from `toJSON()`.
- The `type` field enables dispatch without `instanceof` checks.
- `fromJSON()` validates required fields and throws `TypeError` with a descriptive message if any are missing.
- `fromJSON()` restores the document in its exact original state:
  - If `isParsed` was `true`, the restored document is ready to use immediately.
  - If `freeze` was `true`, the restored document and all nested structures are deeply frozen.
  - If `isParsed` was `false`, the restored document requires `parse()` before accessing parsed data.
- `lineNumber` is stored in serialized output because it is needed to reconstruct nodes. The `id` is derived from `lineNumber` during reconstruction.
- `freeze` is detected via `Object.isFrozen()` at serialization time, so it reflects the actual state of the node, not just the intent.
- There is no `fromJSON()` on the document that accepts a separate `freeze` option. The original `freeze` flag is restored from the serialized data.

### Example: State Persistence

State management can persist a document by storing `JSON.stringify(doc)` and restore it later with `WordListDocument.fromJSON(savedState)`. No re-parsing is needed, and all node identity (IDs) is preserved.

---

## Freezing and Immutability

The parser supports optional deep freezing via the `{ freeze: true }` option on `WordListDocument`.

### Behavior

When `freeze: true` is set:

1. Parsing proceeds normally with mutable nodes.
2. After parsing completes, the document and all nested structures are deeply frozen:
   - The `WordListDocument` instance itself
   - The `metadata` object
   - The `categories` array
   - Every `CategoryNode`
   - Every `WordNode`
   - Every `words` and `subcategories` array

### Why Freeze After Parse?

The parser must build the category tree before it can be frozen. Freezing in the constructor would make `parse()` impossible because `parse()` must assign properties.

Freezing happens as the final step of `parse()`. Once frozen, the document is a completed, immutable snapshot.

### Re-parsing a Frozen Document

Calling `parse()` on a frozen document throws:

```js
const doc = new WordListDocument(rawText, { freeze: true });
doc.parse();

doc.parse(); // Error: WordListDocument: parse() cannot be called on a frozen document
```

This is intentional. A frozen document is immutable. To re-parse, create a new `WordListDocument` instance.

### Individual Node Freezing

`WordNode` and `CategoryNode` constructors also accept a `freeze` parameter for direct instantiation:

```js
const word = new WordNode('кролик', 5, true);
Object.isFrozen(word); // true

const category = new CategoryNode('Nouns', 1, 4, [], [], true);
Object.isFrozen(category); // true
Object.isFrozen(category.words); // true
Object.isFrozen(category.subcategories); // true
```

This is independent of document-level freezing. The document parser always creates mutable nodes during parsing and freezes them afterward if requested.

---

## Traversal and Queries

The parser provides several methods for traversing the document tree.

### countWords()

Counts total words including all descendants:

```js
doc.countWords(); // number
category.countWords(); // number for a subtree
```

### allWords()

Returns a flat array of word strings in depth-first order:

```js
doc.allWords(); // ["кролик", "лук", "стол", ...]
category.allWords(); // words from this category and all subcategories
```

Order: words from the current category first, then words from each subcategory recursively.

### allNodes()

Returns all nodes (words and categories) in document order:

```js
doc.allNodes(); // [CategoryNode, WordNode, WordNode, CategoryNode, ...]
```

Document order means depth-first traversal: a category node appears before its words and subcategories.

### getNodeById()

Looks up a node by its deterministic ID:

```js
const node = doc.getNodeById('line-5');

if (node) {
    console.log(node.type); // "word" or "category"
}
```

Returns `null` for unknown IDs.

---

## Validation and Error Handling

All constructors and public methods validate arguments.

### Error Types

| Error | When |
|---|---|
| `TypeError` | Wrong argument type (e.g., string instead of number) |
| `RangeError` | Invalid numeric range (e.g., level < 1, lineNumber < 1) |
| `Error` | Malformed input or invalid state (e.g., missing frontmatter closing delimiter, accessing parsed data before calling `parse()`) |

### Examples

```js
new WordNode('', 5);
// TypeError: WordNode: word must be a non-empty string

new WordNode('кролик', 0);
// RangeError: WordNode: lineNumber must be a positive integer

const doc = new WordListDocument(rawText);
doc.countWords();
// Error: WordListDocument: parse() must be called before accessing parsed data

const doc = new WordListDocument('---\ntitle: Test\n');
doc.parse();
// Error: Frontmatter block is missing closing "---" line.
```

### Error Messages

Error messages are descriptive and include:

- The class or method name
- The expected value or range
- The line number (for parsing errors)

This makes debugging easier, especially for user-provided input.

---

## Design Rationale

### Why Class-Based API Over Plain Objects?

The original parser returned plain object literals. This was simple but had several problems:

1. **No clear contract.** Callers had to know the internal shape of the returned objects. Nothing enforced or documented these structures at the language level.

2. **No validation.** If a caller constructed a malformed object, the error surfaced later, often far from the source. Each consumer duplicated structural checks.

3. **Poor fit for state management.** Upcoming work (#18) requires stable node identity, document traversal, and serialization support. Plain objects provide none of these.

Classes solve all three problems by providing a clear contract, built-in validation, and methods that encapsulate traversal and serialization behavior.

### Why `type` Getters Instead of `instanceof` Checks?

The `type` getter returns `'word'` or `'category'`. This enables:

- Render dispatch based on node type
- State restoration from plain JSON objects
- No reliance on `instanceof`, which breaks across realms and after serialization

Callers can work with either live nodes or serialized plain objects without knowing which they have.

### Why 1-Based Line Numbers for IDs?

Source files are conventionally numbered starting at 1. Using 0-based IDs would be misleading when debugging or inspecting saved state. The defensive check in `createLineId()` enforces this.

### Why Does `allNodes()` Walk the Tree Instead of Using a Map?

The document maintains an internal `_nodeMap` for O(1) ID lookup via `getNodeById()`. While `_nodeMap` insertion order happens to match document order today, relying on `Map` insertion order is fragile.

Future refactors—parallel parsing, lazy registration, new node types—could break it silently. Walking the tree makes the document-order guarantee explicit and independent of implementation details.

### Why Freeze the Entire Document, Not Just Its Contents?

Partial freezing is confusing. If `{ freeze: true }` is set, the entire document—including metadata and any future attributes—should be immutable. Freezing only categories and words would leave the document's own state mutable, creating ambiguity about what is protected.

### Why Disallow Re-parsing a Frozen Document?

Once frozen, the document is a completed, immutable snapshot. Re-parsing would require mutating internal state, which contradicts the purpose of freezing. Callers who need to re-parse should create a new `WordListDocument` instance.

### Why Store lineNumber Instead of Deriving It from id?

Reverse-engineering `lineNumber` from the `id` string (e.g. parsing `"line-5"` to extract `5`) is indirect and fragile. Storing `lineNumber` as instance data makes reconstruction straightforward and makes the serialized data self-documenting. The additional JSON payload is negligible.

### Why Detect freeze via Object.isFrozen() Instead of a \_freeze Flag?

`Object.isFrozen()` reflects the actual frozen state, not just the intent. If a caller froze a node manually after construction (e.g. `Object.freeze(wordNode)`), `toJSON()` would correctly report `freeze: true`. This is more reliable than tracking a separate flag.

### Why Restore the Original freeze Flag from Serialized Data?

True round-trip fidelity requires restoring the document in its exact original state. Allowing a separate `freeze` override in `fromJSON()` would introduce ambiguity about what the restored document actually is. The original `freeze` flag is restored from the serialized data.

---

## Usage in Views

### Typical View Workflow

```js
import { WordListDocument } from '../core/wordlist-parser.js';

function handleFileContent(content) {
    const doc = new WordListDocument(content);
    doc.parse();

    // Store the document for later use.
    parsedDocument = doc;

    // Enable submit if there are words.
    submitButton.disabled = doc.countWords() === 0;

    // Show summary.
    showFileSummary(doc.categories, doc.countWords());
}

async function handleSubmit() {
    // Get all words for the API request.
    const allWords = parsedDocument.allWords();

    // Remove duplicates for HTTP efficiency.
    const uniqueWords = [...new Set(allWords)];

    // Send to server.
    const data = await fetchNounBatch(uniqueWords, isStrictMode);

    // Render results using the parsed document.
    renderBatchResults(parsedDocument.categories, parsedDocument.metadata, data.results);
}
```

### Key Patterns

- **Parse once, use many times.** Store the `WordListDocument` in module state after parsing.
- **Use built-in traversal methods.** Avoid writing custom tree-walking helpers in views.
- **Use `toJSON()` for persistence.** No need to manually serialize.
- **Use `getNodeById()` for state restoration.** Map open node IDs back to live nodes.

---

## Testing

The test suite covers:

- Parsing behavior (frontmatter, categories, implicit category, nesting)
- Error handling (malformed input, missing delimiters, invalid headings)
- Class constructors and validation
- Freeze behavior (deep freezing, re-parse prevention)
- Traversal methods (`countWords`, `allWords`, `allNodes`, `getNodeById`)
- Serialization (`toJSON` output shape, `fromJSON` reconstruction)

### Running Tests

```bash
npm test
```

(Or the project-specific test command.)

### Test Files

- `client/web-client/js/core/wordlist-parser.test.js` — Parser unit tests

To run:

`node client/web-client/js/core/wordlist-parser.test.js`

---

## References

- Issue #18: View State Management
- Issue #19: Update batch word list parser to a class approach
- Commit `87ad196`: Original word list parser implementation
- Commit `5ced418`: Updates parser to class-based API
- Commit `a78d888`: (round-trip serialization to word list parser)
