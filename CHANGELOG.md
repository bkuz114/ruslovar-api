# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
