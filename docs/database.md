# Database Schema: Russian Noun Declensions

This document describes the structure and semantics of the MySQL database used by the Russian Dictionary API.

## Source

The data originates from the [sshra/database-russian-morphology](https://github.com/sshra/database-russian-morphology) project, which provides SQL dumps of Russian morphological data.

- **Database:** `runouns`
- **Table:** `nouns_morf`
- **Row count:** ~768,000
- **Encoding:** UTF-8 (Cyrillic text throughout)

The database is read-only from the perspective of the API. It is a static dictionary imported once from the SQL dump provided by the upstream project. Modifications are applied via `sql/setup_database.sql` after import.

---

## Table overview (`nouns_morf`)

The database contains a single table: `nouns_morf`.

This table stores all word forms for Russian nouns. Each row represents one form of a word — a root form, a singular declension, or a plural declension. The table uses a self-referencing structure via the `code` and `code_parent` columns to link declined forms back to their dictionary root.

The `nouns_morf` table is the only table used by the API at this time.

Would you like me to place this after the Source section?

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

The indexes were added manually via `sql/setup_database.sql` after importing the data from the SQL dump. The upstream project does not include them by default.

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

The API fills all singular and plural case forms with the invariant word, and sets the invariant field to `true`.

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

## Notable data characteristics

### Multiple plural forms for a single root

Some nouns have more than one nominative plural form, each with its own set of declensions.

**Example:** `человек` has two nominative plural forms: `люди` and `человеки`.

```
человек   (root,     code=35307,  code_parent=0)
люди      (nom. pl., code=1378733, code_parent=35307)
человеки  (nom. pl., code=1379833, code_parent=35307)
```

The API represents each set of plural forms as a separate item in the `plural` list.

### Words mapping to multiple distinct roots

A single word form can appear as a declined form of different dictionary roots.

**Example:** `абаки` is both the plural of `абак` and the plural of `абака`.

The API returns all possible roots in the `matches` list, since it cannot determine which root the user intended.

### Dictionary artifacts

Some words exist both as a standalone root with `wcase = NULL` and as a declined form of another root.

**Example:** `люди` has a standalone root row (`code_parent = 0`, `wcase = NULL`) and a child row pointing to `человек`.

The standalone root is a dictionary artifact: it allows the word to be found when searched directly, but the word's actual declensions come from the other root. The API detects this and resolves to the useful root.

### Plurals for uncountable nouns

Many nouns that are semantically uncountable or singular-only in common usage still have plural forms in the database.

**Examples:** `дружба`, `север`, `одежда`, `январь`.

These plurals may be rare, archaic, or context-specific, but they are grammatically possible and included in the Sshra data. The API returns all forms present in the database without making judgments about which are common or preferred.

### Missing suppletive plural links

The upstream dump does not link all suppletive plural forms to their singular roots.

**Example:** `дети` was linked only to `дитя`, not to `ребенок`, even though it is also the suppletive plural of `ребенок`.

The setup script adds the missing link so `дети` resolves to both roots.

---

## Lookup algorithm

Given an input word, the API now finds all possible dictionary roots and returns one declension table per root.

### 1. Find all matching rows

```sql
SELECT * FROM nouns_morf WHERE word = ?;
```

If no rows are found, return 404.

### 2. Resolve each row to its root

For each matching row, walk the parent chain until reaching a row with `code_parent = 0`.

If the root row has `wcase = NULL`, check whether the word also exists as a child of another root. If so, follow that child row instead. This handles dictionary artifacts.

### 3. Deduplicate roots

Multiple rows may resolve to the same root. Group by root code to produce a distinct set.

### 4. For each root, gather declensions

For each distinct root:

- Singular rows: children of the root where `plural = 0`, plus the root row itself as nominative singular.
- Nominative plural rows: children of the root where `plural = 1`.
- Plural rows: for each nominative plural row, its children.

### 5. Assemble the response

The rows for each root are organized into singular and plural case forms, and each root becomes one entry in the `matches` list of the response.

---

## Why this design?

The upstream data was imported as-is from the Sshra project. The self-referencing `code` / `code_parent` structure is the original design of that dataset, not something introduced by this API.

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
