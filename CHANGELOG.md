# Changelog

All notable changes to Crest are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Upgraded to Electron 42 for the latest upstream platform updates
- Bumped `electron-vite` to 5.x and `electron-builder` to 26.x to match
- Added a Content Security Policy on renderer responses
- Removed an unused spreadsheet dependency (`xlsx`)
- Cleaned up illustrative comments that referenced a local home path

### Added
- Dependabot config (weekly npm grouped updates, monthly GitHub Actions)
- `SECURITY.md` describing how to report a vulnerability
- `CONTRIBUTING.md` with dev setup and PR guidelines
- This changelog
- **HyperFrames starter skill** — auto-installs on first launch. Ask Claude
  for "a video", "an animation", "a title card" and it scaffolds a HyperFrames
  composition via `npx hyperframes`.

## [2.3.1] – 2026-04-07

### Added
- Direct DMG downloads from the website (replaces ad-hoc hosting)
- Automated release workflow via GitHub Actions

### Fixed
- Sleep/wake restores terminal sessions instead of bouncing to the home screen
- Chat prompt is passed as a positional argument (resolves a stdin formatting regression)
- Chat permissions and streaming performance improvements
- CI build: install `setuptools` so `node-gyp` can compile `node-pty`

## [2.3.0]

### Added
- **Orchestrator agent** with five production improvements
- Activity timeline with live action tracking from terminal output
- Floating labels on the website screenshot showcase

### Changed
- **Renamed to Crest** (new wave-crest logo, rewritten landing page)
- Dashboard polished to a more refined aesthetic
- Landing page redesigned with new copy and an emerald accent
- Terminal wrapper UI cleaned up

### Fixed
- Chat mode: strip nested Claude env vars, drop verbose flag, better spawn error handling
- Super Agent terminal reading: comprehensive ANSI stripping and tighter detection
- Skill/agent detection works for new users and existing CLI users
- Memory leak that caused excessive RAM growth during long sessions
- Repository Visualization hanging on large codebases

## [2.2.0]

### Added
- Five major features: Voice input, Usage view, Memory UI, Prompt Queue, Repository Visualization
- Natural-language Memory UI
- Hive Management screen (now accessible from home)
- Screenshot gallery on the website
- Linux/Chromebook download buttons + setup instructions
- Analytics dashboard, plan panel

### Changed
- Website redesigned with sub-pages and a more premium UI
- macOS-only positioning (Windows/Linux mentions removed pending native builds)
- Project earlier carried the names *ClaudeCodeUI*, *ClaudeCode Arena*, and *Claude Code Unleashed* before settling on Crest. Older commits reflect those names.

### Fixed
- Analytics charts not populating due to a timezone mismatch
- Swarm prompts now produce consistent terminal input

## [2.1.0]

### Added
- Hive Management
- Improved file handling
- Side-by-side view for Super Agent history

[Unreleased]: https://github.com/OneWave-AI/Crest/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/OneWave-AI/Crest/releases/tag/v2.3.1
[2.3.0]: https://github.com/OneWave-AI/Crest/releases/tag/v2.3.0
[2.2.0]: https://github.com/OneWave-AI/Crest/releases/tag/v2.2.0
