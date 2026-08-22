# API Contract: Noun Declensions

This document defines the HTTP API for querying Russian noun declensions.

## Base URL

```
http://<host>:<port>/api/v1
```

All endpoints are prefixed with `/api/v1`.

---

## Design decisions

### English keys, Russian values

The API uses English key names for structural elements (`singular`, `plural`, `nominative`, etc.) while preserving Russian values for linguistic data (`муж`, `жен`, `ср`, etc.).

This decision was made for the following reasons:

- **Broader audience**: The API is intended for any developer working with Russian text, regardless of their proficiency in Russian. English keys make integration straightforward for non-Russian speakers.
- **Convention**: English is the de facto standard for key names in REST APIs. Consistency with this convention reduces cognitive overhead.
- **Preservation of linguistic data**: The actual Russian content — declined forms, gender values — remains in Russian. The dictionary is the source of truth, and the API does not translate or alter it.

For developers who require Russian key names, the mapping is straightforward and can be implemented as a thin client-side transformation layer. See the [case name mapping](#case-name-mapping) section below.

---

## Endpoints

### `GET /nouns/{word}/declensions`

Returns the full declension table for a Russian noun.

#### Path parameters

| Parameter | Type | Description |
|---|---|---|
| `word` | string | The Russian noun to look up (Cyrillic, UTF-8). May be in any grammatical form (dictionary form or declined form). |

#### Query parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `strict` | boolean | `false` | If `true`, the word must be in dictionary form. If the word is declined, the API returns a 404 error. If `false`, the API resolves the word to its dictionary form automatically. |

#### Response

**Status:** `200 OK`

```json
{
  "word": "кролика",
  "root": "кролик",
  "gender": "муж",
  "animacy": true,
  "singular": {
    "nominative": "кролик",
    "genitive": "кролика",
    "dative": "кролику",
    "accusative": "кролика",
    "instrumental": "кроликом",
    "prepositional": "кролике"
  },
  "plural": {
    "nominative": "кролики",
    "genitive": "кроликов",
    "dative": "кроликам",
    "accusative": "кроликов",
    "instrumental": "кроликами",
    "prepositional": "кроликах"
  },
  "additional_forms": {
    "partitive": null,
    "locative": null,
    "vocative": null,
    "counting": null
  }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `word` | string | The word as submitted by the client. May equal `root` if the input was already in dictionary form. |
| `root` | string | Same as `word`. Always present for schema consistency. |
| `gender` | string \| null | Grammatical gender. One of: `муж`, `жен`, `ср`, `общ`. `null` if unknown. |
| `animacy` | boolean \| null | `true` = animate, `false` = inanimate, `null` = unknown. |
| `singular` | object | Singular declensions, keyed by English case name. Empty object if the noun has no singular forms. |
| `plural` | object | Plural declensions, keyed by English case name. Empty object if the noun has no plural forms. |
| `additional_forms` | object | Rare or archaic case forms. Always present. Each key maps to a string or `null`. |

#### Case name mapping

| English key | Russian full name | Russian abbreviation | `wcase` value in DB |
|---|---|---|---|
| `nominative` | именительный | И | `им` |
| `genitive` | родительный | Р | `род` |
| `dative` | дательный | Д | `дат` |
| `accusative` | винительный | В | `вин` |
| `instrumental` | творительный | Т | `тв` |
| `prepositional` | предложный | П | `пр` |
| `partitive` | разделительный | — | `парт` |
| `locative` | местный | — | `мест` |
| `vocative` | звательный | — | `зват` |
| `counting` | счётная форма | — | `счет` |

---

## Error responses

### `404 Not Found` — word not found

```json
{
  "detail": "Word 'кролик' not found in dictionary"
}
```

### `404 Not Found` — not in dictionary form (strict mode)

```json
{
  "detail": "Word 'кролика' is not in dictionary form. Use strict=false to resolve automatically."
}
```

### `422 Unprocessable Entity` — invalid input

```json
{
  "detail": [
    {
      "loc": ["path", "word"],
      "msg": "Word must be a non-empty Cyrillic string",
      "type": "value_error"
    }
  ]
}
```

### `503 Service Unavailable` — database unreachable

```json
{
  "detail": "Database unavailable"
}
```

---

## Examples

### Example 1: Dictionary form input

```bash
curl "http://localhost:8000/api/v1/nouns/кролик/declensions"
```

```json
{
  "word": "кролик",
  "root": "кролик",
  "gender": "муж",
  "animacy": true,
  "singular": {
    "nominative": "кролик",
    "genitive": "кролика",
    "dative": "кролику",
    "accusative": "кролика",
    "instrumental": "кроликом",
    "prepositional": "кролике"
  },
  "plural": {
    "nominative": "кролики",
    "genitive": "кроликов",
    "dative": "кроликам",
    "accusative": "кроликов",
    "instrumental": "кроликами",
    "prepositional": "кроликах"
  },
  "additional_forms": {
    "partitive": null,
    "locative": null,
    "vocative": null,
    "counting": null
  }
}
```

### Example 2: Declined form input (automatic resolution)

```bash
curl "http://localhost:8000/api/v1/nouns/кролика/declensions"
```

```json
{
  "word": "кролика",
  "root": "кролик",
  "gender": "муж",
  "animacy": true,
  "singular": {
    "nominative": "кролик",
    "genitive": "кролика",
    "dative": "кролику",
    "accusative": "кролика",
    "instrumental": "кроликом",
    "prepositional": "кролике"
  },
  "plural": {
    "nominative": "кролики",
    "genitive": "кроликов",
    "dative": "кроликам",
    "accusative": "кроликов",
    "instrumental": "кроликами",
    "prepositional": "кроликах"
  },
  "additional_forms": {
    "partitive": null,
    "locative": null,
    "vocative": null,
    "counting": null
  }
}
```

### Example 3: Strict mode with declined form

```bash
curl "http://localhost:8000/api/v1/nouns/кролика/declensions?strict=true"
```

```json
{
  "detail": "Word 'кролика' is not in dictionary form. Use strict=false to resolve automatically."
}
```

### Example 4: Invariant noun

```bash
curl "http://localhost:8000/api/v1/nouns/кофе/declensions"
```

```json
{
  "word": "кофе",
  "root": "кофе",
  "gender": "муж",
  "animacy": false,
  "singular": {},
  "plural": {},
  "additional_forms": {
    "partitive": null,
    "locative": null,
    "vocative": null,
    "counting": null
  }
}
```

---

## Notes

- All input words must be Cyrillic. The API validates this and returns a `422` error for non-Cyrillic input.
- The API is read-only. It does not modify the underlying database.
- The response schema is stable. Additional fields may be added in future versions without breaking changes, but existing fields will not be renamed or removed without a major version bump.
