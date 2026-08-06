/**
 * The preview pane deliberately runs in its own storage jar rather than sharing
 * the app session, so preview cookies/localStorage never touch Crest's own.
 *
 * Both sides have to agree on the name: the renderer sets it as the <webview>
 * `partition` attribute, and the main process registers the `local-file:`
 * handler on that same session. They drifted once already -- only the default
 * session had the handler, which silently blanked every local-file preview --
 * so the string lives here instead of being spelled out twice.
 */
export const PREVIEW_PARTITION = 'persist:crest-preview'
