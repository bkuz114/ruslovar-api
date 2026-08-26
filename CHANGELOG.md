# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-26-8

### Added

- Multiple root matches support: the API now returns all possible dictionary roots for a word, wrapped in a `matches` list (`e6fd30e`)
- Multiple plural paradigm support: `plural` is now a list to handle nouns with more than one plural form (`2d5d1fe`)
- Invariant noun handling: invariant nouns return the same word for all cases with `invariant: true` (`22778af`, `62c9176`)
- Strict mode restored for multi-root lookups (`8ae241e`)
- Docker support with compose file, pre-built images on Docker Hub, and multi-arch support (`ba74dfa`, `71fd413`)
- Database verification script for confirming setup (`ce93a47`)
- Database setup script with data fix for `дети` → `ребенок` (`9106fd7`)
- CLI client table output mode with colors and language support (`017c130`, `9552c2d`, and related refinements)
- CLI client gender value localization (`201b96d`)
- CLI client color theme support (`c41cb6a`)
- Demo page multi-root rendering with tabs and metadata (`36ea6a7`)
- Demo page URL parameter support (`748b091`)
- Demo page metadata label language switching (`cc1c63d`)
- Docker developer guide for building and testing images (`036f54c`)
- Multi-arch building documentation for arm64 support (`69f940b`)

### Changed

- API response schema: top-level `word` and `matches` list replaces single-root response (`e6fd30e`)
- API response schema: `plural` changed from object to list (`2d5d1fe`)
- Demo page UI updated for new schema with tabs, metadata, and plural lists (`36ea6a7`)
- CLI client refactored with consolidated table output, language strings, and color handling (`9552c2d`)
- README rewritten with Docker and manual quickstart paths (`9623f15`)
- Database setup docs updated for new scripts and data fixes (`0b442be`, `b046fca`, `bf44e4f`, `7646b97`, `1c9223c`)

### Fixed

- Invariant noun misclassification for plural-only forms like `люди` (`cc982b5`)
- Correct nominative forms in declension assembly (`21dbb3a`)
- Irregular plural resolution for words like `люди` (`7a2fcb1`)
- Standardized `get_children` return type to list (`8d0585a`)
- Verification script misleading summary message (`5c4cf6b`)
- Expected row count updated after `дети` data fix (`c3157fa`)

### Security

- None

## [1.0.0] - 2026-22-8

### Added

- Repository scaffolding, license, and initial README stub (`dff1e5f`)
- Project dependencies and environment configuration template (`03e406d`, `07c155f`)
- Noun declension API with FastAPI (`6511ac1`)
  - `GET /api/v1/nouns/{word}/declensions`
  - Strict mode via query parameter
  - Automatic resolution of declined forms to dictionary root
  - Invariant noun handling
  - Read-only database access
- CLI client for noun declension lookup (`32b5239`)
- Database schema analysis documentation (`7697885`)
- API contract documentation (`98c5f24`)
- Database setup guide and helper SQL file (`82414fd`)
- Quickstart guide (`5377093`)
- Developer guide with request lifecycle and extension documentation (`c8c2a2c`)
- Offline Swagger UI support with local assets (`0c58f96`)
- Swagger UI appendix in developer guide (`477bca6`)
- Browser demo page with Russian/English language toggle (`5cc4daa`)
- Demo page README (`d7eb11d`)
- Full README with project overview and links (`b7cd75a`)

### Changed

- None

### Deprecated

- None

### Removed

- None

### Fixed

- None

### Security

- None
