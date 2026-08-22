# Database Schema: Russian Noun Declensions

This document describes the structure and semantics of the MySQL database used by the Russian Dictionary API.

## Source

The data originates from the [sshra/database-russian-morphology](https://github.com/sshra/database-russian-morphology) project, which provides SQL dumps of Russian morphological data.

- **Database:** `runouns`
- **Table:** `nouns_morf`
- **Row count:** ~768,000
- **Encoding:** UTF-8 (Cyrillic text throughout)

The database is read-only from the perspective of the API. It is a static dictionary imported once from the SQL dump provided by the upstream project.

---

## Columns

| Column | Type | Null | Description |
|---|---|---|---|
| `IID` | int | No | Auto-increment primary key |
| `word` | varchar(60) | No | Surface form of the word (Cyrillic, UTF-8) |
| `code` | int | No | Unique identifier for this row |
| `code_parent` | int | No | `code` of the parent row, or `0` if this row is a root form |
| `plural` | tinyint(1) | Yes | `0` = singular, `1` = plural |
| `gender` | enum | Yes | `муж`, `жен`, `ср`, `общ`, or `NULL` |
| `wcase` | enum | Yes | Grammatical case (see below) |
| `soul` | tinyint(1) | Yes | `0` = inanimate, `1` = animate, or `NULL` |

---

## Grammatical cases (`wcase`)

| Value | Meaning | Example |
|---|---|---|
| `им` | nominative | `кролик` |
| `род` | genitive | `кролика` |
| `дат` | dative | `кролику` |
| `вин` | accusative | `кролика` |
| `тв` | instrumental | `кроликом` |
| `пр` | prepositional | `кролике` |
| `зват` | vocative (rare, archaic) | `боже` |
| `парт` | partitive | `чаю` |
| `мест` | locative | `в лесу` |
| `счет` | counting form | `два часа` |

The six standard cases (`им` through `пр`) appear for most nouns. The four additional cases (`зват`, `парт`, `мест`, `счет`) appear only for a small subset of nouns and are treated separately in the API response.

---

## Parent-child relationships

The table uses a self-referencing structure via the `code` and `code_parent` columns.

### Root forms

A root form (dictionary form) has:

```
code_parent = 0
```

This indicates that the row has no parent and is itself the canonical dictionary entry for that noun.

### Singular declensions

Singular declined forms point directly to the root:

```
кролик   (root,     code=27249, code_parent=0)
кролика  (gen. sg., code=27250, code_parent=27249)
кролику  (dat. sg., code=27251, code_parent=27249)
...
```

### Plural declensions

Plural declensions point to the **nominative plural form**, which in turn points to the root:

```
кролик   (root,     code=27249,  code_parent=0)
кролики  (nom. pl., code=1303599, code_parent=27249)
кроликов (gen. pl., code=1303600, code_parent=1303599)
кроликам (dat. pl., code=1303601, code_parent=1303599)
...
```

This creates a two-level hierarchy:

```
root form (code_parent = 0)
├── singular declensions (code_parent = root.code)
└── nominative plural (code_parent = root.code, plural = 1)
    └── plural declensions (code_parent = nom_pl.code)
```

---

## Indexes

The following indexes exist on `nouns_morf`:

| Index name | Column | Cardinality | Notes |
|---|---|---|---|
| `PRIMARY` | `IID` | 767,694 | Auto-increment primary key |
| `code_idx` | `code` | 767,694 | Full index |
| `code_parent_idx` | `code_parent` | 127,949 | Full index |
| `word_idx` | `word` | 47,980 | Prefix index (first 5 bytes only) |

The indexes were added manually after importing the data from the SQL dump. The upstream project does not include them by default.

**Note:** `word_idx` is a prefix index covering only the first 5 bytes of the `word` column. For Cyrillic UTF-8 text, this corresponds to roughly the first 2–3 characters. Lookups by full word still benefit from the index, but may scan additional rows to confirm exact matches.

---

## Edge cases

### Invariant nouns

Some nouns have no declensions at all. They appear in the table only as a root form with:

- `code_parent = 0`
- `wcase = NULL`
- No child rows

**Example:** `кофе`

```
кофе (root, code=122227, code_parent=0, wcase=NULL)
```

The API returns empty objects for `singular` and `plural` in this case.

### Plural-only nouns

Some nouns exist only in plural form. They have a root-like entry that serves as the nominative plural, and all child rows point to it. There is no singular nominative row and no singular declensions.

**Example:** `часы`

```
часы (nom. pl., code=1378487, code_parent=35277)
```

The `code_parent` value points to a row that may be the singular root (`час`) or another intermediate form. The lookup algorithm resolves this by walking the parent chain until it reaches a row with `code_parent = 0`.

### NULL values

- `gender` is `NULL` on plural rows. It is only populated on singular rows.
- `soul` can be `NULL` for some entries.
- `wcase` is `NULL` for invariant nouns.
- `plural` is generally `0` or `1`, but may be `NULL` in rare cases.

The API handles all `NULL` values explicitly and does not assume they are absent.

---

## Lookup algorithm

Given an input word (which may or may not be in dictionary form), the API performs the following steps:

### 1. Find the input word

```sql
SELECT * FROM nouns_morf WHERE word = ? LIMIT 1;
```

If no row is found, return 404.

### 2. Walk to the root form

If the input word has `code_parent != 0`, follow the parent chain:

```sql
SELECT * FROM nouns_morf WHERE code = ? LIMIT 1;
```

Repeat until a row with `code_parent = 0` is reached. Based on the current data, the maximum depth is two levels (declined form → root, or declined form → nominative plural → root).

### 3. Get all singular declensions

```sql
SELECT * FROM nouns_morf WHERE code_parent = ? AND plural = 0;
```

This returns all singular declined forms of the root.

### 4. Get the nominative plural

```sql
SELECT * FROM nouns_morf WHERE code_parent = ? AND plural = 1 AND wcase = 'им';
```

If no row is found, the noun has no plural forms.

### 5. Get all plural declensions

```sql
SELECT * FROM nouns_morf WHERE code_parent = ?;
```

Where `?` is the `code` of the nominative plural row from step 4.

### 6. Assemble the response

The rows from steps 3 and 5 are organized by case and number into the API response structure defined in [`api.md`](api.md).

---

## Why this design?

The upstream data was imported as-is from the `sshra` project. The self-referencing `code` / `code_parent` structure is the original design of that dataset, not something introduced by this API.

This structure has several advantages:

- **Compact**: each word form is stored once, with relationships expressed via integer codes.
- **Extensible**: additional grammatical information (gender, animacy, case) can be attached to individual rows without schema changes.
- **Resolvable**: any word form can be traced back to its dictionary root by following `code_parent`.

The main cost is that assembling a full declension table requires multiple queries. With the indexes in place, these queries are fast (sub-millisecond each).

---

## Future additions

The same database structure exists for adjectives in a separate database/table:

- **Database:** `ruadjectives`
- **Table:** `adjectives_morf`

The adjective table has additional columns (e.g., `short`, `comp`) that are not present in the noun table. Documentation for the adjective schema will be added when the adjective endpoint is implemented.
