# Contributing to Crest

Thanks for the interest. Crest is a small project maintained by OneWave AI —
contributions are welcome, but please keep a few things in mind so review
goes smoothly.

## Before you start

For anything larger than a bug fix or a typo, **open an issue first** and
sketch what you're planning. That saves you the effort of building something
that doesn't fit the direction we're taking the app.

Small fixes (typos, broken links, dead code, obvious bugs) — just open the PR.

## Development setup

```bash
git clone https://github.com/OneWave-AI/Crest.git
cd Crest
npm install
npm run dev
```

You'll need Node 20+ and macOS on Apple Silicon for the full dev experience.
`node-pty` builds native bindings against Electron — `npm install` runs
`electron-builder install-app-deps` automatically.

## Pull requests

- Keep the diff focused. One concern per PR.
- Match the style of the surrounding code. We aren't strict, but consistency
  helps reviewers.
- Update `CHANGELOG.md` under `[Unreleased]` if your change is user-visible.
- Run `npm run build` locally before pushing — CI does the same and we'd
  rather catch a broken build before it hits a PR.
- If you touch security-sensitive code (IPC handlers, the local-file
  protocol, the renderer CSP), call that out in the PR description.

## Reporting bugs

Use [GitHub Issues](https://github.com/OneWave-AI/Crest/issues). Include:

- Your Crest version (`Crest → About` or the DMG filename)
- macOS version
- Steps to reproduce
- What you expected vs. what happened
- Any relevant console output (Cmd+Opt+I opens DevTools)

## Reporting vulnerabilities

**Do not** open a public issue for security problems. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure process.

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](./LICENSE).
