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
  "matches": [
    {
      "root": "кролик",
      "invariant": false,
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
      "plural": [
        {
          "nominative": "кролики",
          "genitive": "кроликов",
          "dative": "кроликам",
          "accusative": "кроликов",
          "instrumental": "кроликами",
          "prepositional": "кроликах"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
}
```

#### Response fields

See [Noun response model](#noun-response-model) for the full response schema and field descriptions.

### `POST /nouns/batch`

Returns declension tables for multiple Russian nouns in a single request.

Each word is processed independently. Lookup failures (word not found, strict mode violations) are returned as per-item errors with HTTP 200. Non-200 responses occur only for system errors (malformed request, database unreachable).

#### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `words` | list of strings | Yes | The Russian nouns to look up (Cyrillic, UTF-8). Must contain at least one word. |
| `strict` | boolean | No | If `true`, each word must be in dictionary form. Defaults to `false`. |

```json
{
  "words": ["кролик", "человек", "кофе"],
  "strict": false
}
```

#### Response

**Status:** `200 OK`

```json
{
  "results": [
    {
      "word": "кролик",
      "status": "success",
      "result": {
        "word": "кролик",
        "matches": [
          {
            "root": "кролик",
            "invariant": false,
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
            "plural": [
              {
                "nominative": "кролики",
                "genitive": "кроликов",
                "dative": "кроликам",
                "accusative": "кроликов",
                "instrumental": "кроликами",
                "prepositional": "кроликах"
              }
            ],
            "additional_forms": {
              "partitive": null,
              "locative": null,
              "vocative": null,
              "counting": null
            }
          }
        ]
      },
      "error": null
    },
    {
      "word": "несуществующееслово",
      "status": "error",
      "result": null,
      "error": "Word 'несуществующееслово' not found in dictionary"
    }
  ]
}
```

#### Response fields

**top-level response**

| field | type | description |
|---|---|---|
| `result` | object \| null | The full [Noun response model](#noun-response-model) response for this word. Present when `status` is `"success"`, `null` otherwise. |

**result item (`nounbatchitem`)**

| field | type | description |
|---|---|---|
| `word` | string | the word as submitted in the request. |
| `status` | string | either `"success"` or `"error"`. |
| `result` | object \| null | the full `nounlookupresponse` for this word. present when `status` is `"success"`, `null` otherwise. |
| `error` | string \| null | a description of the lookup failure. present when `status` is `"error"`, `null` otherwise. |

---

## Noun Response Model

### Response Structure

This section provides a brief explanation for the response structure, as it is non-obvious.

The API returns a top-level object with two fields: `word` and `matches`.

`word` is the word as submitted by the client. `matches` is a list of one or more declension tables, each representing a possible dictionary root for that word.

**Why is `matches` a list?**

Most words have exactly one match. However, some Russian words map to multiple distinct roots. For example, `абаки` is both the plural of `абак` and the plural of `абака`. The API cannot determine which root the user intended, so it returns all possible matches.

**Why is `plural` also a list?**

Within each match, `plural` is also a list. This is because some nouns have more than one distinct plural form. For example, `человек` has both `люди` and `человеки`. Each item in the `plural` list represents one set of plural forms.

**Note**: Some of these forms may be archaic, rare, or not commonly used in colloquial Russian. However, they are still represented in the Sshra morphological database, and so the API returns them.

Thus, the `matches` and `plural` lists reflect the reality of the Sshra morphology data: a single word can correspond to multiple dictionary entries, and a single dictionary entry can have multiple plural forms.

**Duplicates that aren't duplicates**

In some cases, multiple matches may appear identical because the database does not store stress marks. For example, `замок` (and its declensions) returns two matches that look the same, but are distinct entries (corresponding to `за́мок` (castle) and `замо́к` (lock)).

### Response Schema

**Top-level response**

| Field | Type | Description |
|---|---|---|
| `word` | string | The word as submitted by the client. |
| `matches` | list | One or more declension tables, one per possible dictionary root. |

**Match object (`NounDeclensions`)**

| Field | Type | Description |
|---|---|---|
| `root` | string | The dictionary form (lemma). |
| `invariant` | boolean | `true` for invariant nouns (e.g., кофе, радио), `false` otherwise. |
| `gender` | string \| null | Grammatical gender. One of: `муж`, `жен`, `ср`, `общ`. `null` if unknown. |
| `animacy` | boolean \| null | `true` = animate, `false` = inanimate, `null` = unknown. |
| `singular` | object | Singular declensions, keyed by English case name. Empty object if the noun has no singular forms. |
| `plural` | list | List of plural paradigms. Each item is an object keyed by English case name. Empty list if the noun has no plural forms. |
| `additional_forms` | object | Rare or archaic case forms. Always present. |

### Case name mapping

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
  "matches": [
    {
      "root": "кролик",
      "invariant": false,
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
      "plural": [
        {
          "nominative": "кролики",
          "genitive": "кроликов",
          "dative": "кроликам",
          "accusative": "кроликов",
          "instrumental": "кроликами",
          "prepositional": "кроликах"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
}
```

### Example 2: Declined form input (automatic resolution)

```bash
curl "http://localhost:8000/api/v1/nouns/кролика/declensions"
```

```json
{
  "word": "кролика",
  "matches": [
    {
      "root": "кролик",
      "invariant": false,
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
      "plural": [
        {
          "nominative": "кролики",
          "genitive": "кроликов",
          "dative": "кроликам",
          "accusative": "кроликов",
          "instrumental": "кроликами",
          "prepositional": "кроликах"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
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
  "matches": [
    {
      "root": "кофе",
      "invariant": true,
      "gender": "муж",
      "animacy": false,
      "singular": {
        "nominative": "кофе",
        "genitive": "кофе",
        "dative": "кофе",
        "accusative": "кофе",
        "instrumental": "кофе",
        "prepositional": "кофе"
      },
      "plural": [
        {
          "nominative": "кофе",
          "genitive": "кофе",
          "dative": "кофе",
          "accusative": "кофе",
          "instrumental": "кофе",
          "prepositional": "кофе"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
}
```

### Example 5: Word with multiple possible roots

```bash
curl "http://localhost:8000/api/v1/nouns/лук/declensions"
```

```json
{
  "word": "лук",
  "matches": [
    {
      "root": "лук",
      "invariant": false,
      "gender": "муж",
      "animacy": false,
      "singular": {
        "nominative": "лук",
        "genitive": "лука",
        "dative": "луку",
        "accusative": "лук",
        "instrumental": "луком",
        "prepositional": "луке"
      },
      "plural": [
        {
          "nominative": "луки",
          "genitive": "луков",
          "dative": "лукам",
          "accusative": "луки",
          "instrumental": "луками",
          "prepositional": "луках"
        }
      ],
      "additional_forms": {
        "partitive": "луку",
        "locative": null,
        "vocative": null,
        "counting": null
      }
    },
    {
      "root": "лука",
      "invariant": false,
      "gender": "жен",
      "animacy": false,
      "singular": {
        "nominative": "лука",
        "genitive": "луки",
        "dative": "луке",
        "accusative": "луку",
        "instrumental": "лукой",
        "prepositional": "луке"
      },
      "plural": [
        {
          "nominative": "луки",
          "genitive": "лук",
          "dative": "лукам",
          "accusative": "луки",
          "instrumental": "луками",
          "prepositional": "луках"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": null,
        "counting": null
      }
    }
  ]
}
```

### Example 6: Word with multiple plural forms

```bash
curl "http://localhost:8000/api/v1/nouns/человек/declensions"
```

```json
{
  "word": "человек",
  "matches": [
    {
      "root": "человек",
      "invariant": false,
      "gender": "муж",
      "animacy": true,
      "singular": {
        "nominative": "человек",
        "genitive": "человека",
        "dative": "человеку",
        "accusative": "человека",
        "instrumental": "человеком",
        "prepositional": "человеке"
      },
      "plural": [
        {
          "nominative": "люди",
          "genitive": "людей",
          "dative": "людям",
          "accusative": "людей",
          "instrumental": "людьми",
          "prepositional": "людях"
        },
        {
          "nominative": "человеки",
          "genitive": "человеков",
          "dative": "человекам",
          "accusative": "человеков",
          "instrumental": "человеками",
          "prepositional": "человеках"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": "человече",
        "counting": null
      }
    }
  ]
}
```

### Example 7: Irregular plural form resolving to its root

```bash
curl "http://localhost:8000/api/v1/nouns/люди/declensions"
```

```json
{
  "word": "люди",
  "matches": [
    {
      "root": "человек",
      "invariant": false,
      "gender": "муж",
      "animacy": true,
      "singular": {
        "nominative": "человек",
        "genitive": "человека",
        "dative": "человеку",
        "accusative": "человека",
        "instrumental": "человеком",
        "prepositional": "человеке"
      },
      "plural": [
        {
          "nominative": "люди",
          "genitive": "людей",
          "dative": "людям",
          "accusative": "людей",
          "instrumental": "людьми",
          "prepositional": "людях"
        },
        {
          "nominative": "человеки",
          "genitive": "человеков",
          "dative": "человекам",
          "accusative": "человеков",
          "instrumental": "человеками",
          "prepositional": "человеках"
        }
      ],
      "additional_forms": {
        "partitive": null,
        "locative": null,
        "vocative": "человече",
        "counting": null
      }
    }
  ]
}
```

### Example 8: Batch lookup

```bash
curl -X POST "http://localhost:8000/api/v1/nouns/batch" \
  -H "Content-Type: application/json" \
  -d '{"words": ["кролик", "несуществующееслово", "кофе"], "strict": false}'
```

```json
{
  "results": [
    {
      "word": "кролик",
      "status": "success",
      "result": {
        "word": "кролик",
        "matches": [
          {
            "root": "кролик",
            "invariant": false,
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
            "plural": [
              {
                "nominative": "кролики",
                "genitive": "кроликов",
                "dative": "кроликам",
                "accusative": "кроликов",
                "instrumental": "кроликами",
                "prepositional": "кроликах"
              }
            ],
            "additional_forms": {
              "partitive": null,
              "locative": null,
              "vocative": null,
              "counting": null
            }
          }
        ]
      },
      "error": null
    },
    {
      "word": "несуществующееслово",
      "status": "error",
      "result": null,
      "error": "Word 'несуществующееслово' not found in dictionary"
    },
    {
      "word": "кофе",
      "status": "success",
      "result": {
        "word": "кофе",
        "matches": [
          {
            "root": "кофе",
            "invariant": true,
            "gender": "муж",
            "animacy": false,
            "singular": {
              "nominative": "кофе",
              "genitive": "кофе",
              "dative": "кофе",
              "accusative": "кофе",
              "instrumental": "кофе",
              "prepositional": "кофе"
            },
            "plural": [
              {
                "nominative": "кофе",
                "genitive": "кофе",
                "dative": "кофе",
                "accusative": "кофе",
                "instrumental": "кофе",
                "prepositional": "кофе"
              }
            ],
            "additional_forms": {
              "partitive": null,
              "locative": null,
              "vocative": null,
              "counting": null
            }
          }
        ]
      },
      "error": null
    }
  ]
}
```

---

## Notes

- All input words must be Cyrillic. The API validates this and returns a `422` error for non-Cyrillic input.
- The API is read-only. It does not modify the underlying database.
- The response schema is stable. Additional fields may be added in future versions without breaking changes, but existing fields will not be renamed or removed without a major version bump.
