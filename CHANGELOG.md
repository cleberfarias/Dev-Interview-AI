# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows semantic versioning.

## [Unreleased]

### Changed
- Secured live coach websocket auth flow without passing Firebase tokens in query strings.
- Added frontend typecheck and production build validation to CI.
- Updated Android release version to 1.0.1 (`versionCode` 20260317).

## [0.1.0] - 2026-01-29

### Added
- Interview duration limits per plan (free/pro) and free trial credits.
- AI evaluation normalization and report scores summary based on real answers.
- Backend and frontend test suites (pytest + vitest).
- Smoke test harness and correction plan doc.
- Production build config for backend routing via /api.

### Changed
- Audio recording now captures audio-only to reduce payload size.
- TTS endpoint routing fixed for production.
- Updated OpenAI TTS voice configuration.
