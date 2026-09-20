import type { AppTheme } from '../../shared/types'

/**
 * Stamps the chrome theme onto the document root.
 *
 * Every themed value in the app resolves through a CSS channel variable
 * (`--c-surface-*`, `--c-ink-*`, `--c-overlay`) declared in globals.css, and a
 * theme is nothing but a block overriding those under `[data-theme="..."]`.
 * So switching themes is one attribute write -- no re-render, no component
 * anywhere needs to know which theme is active.
 *
 * `default` deliberately writes no attribute: the base `:root` block IS the
 * default theme, and a `[data-theme="default"]` selector that overrode nothing
 * would be dead weight in the stylesheet.
 */
export function applyAppTheme(theme: AppTheme | undefined | null): void {
  const root = document.documentElement
  if (!theme || theme === 'default') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', theme)
}
