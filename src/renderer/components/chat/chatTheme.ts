/**
 * Chat UI color tokens — dark-only palette adapted from clui-cc theme.
 * Maps to V2's dark theme aesthetic (bg #0d0d0d).
 */

const chatColors = {
  // Container
  containerBg: '#1a1a1c',
  containerBorder: '#2a2a2d',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.35), 0 1px 6px rgba(0, 0, 0, 0.25)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.35)',

  // Surface layers
  surfacePrimary: '#242426',
  surfaceSecondary: '#2e2e31',
  surfaceHover: 'rgba(255, 255, 255, 0.05)',
  surfaceActive: 'rgba(255, 255, 255, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#2a2a2d',
  inputFocusBorder: 'rgba(204, 120, 92, 0.4)',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#b0b0b0',
  textTertiary: '#707070',
  textMuted: '#404040',

  // Accent — matches V2's accent-red
  accent: '#cc785c',
  accentLight: 'rgba(204, 120, 92, 0.1)',
  accentSoft: 'rgba(204, 120, 92, 0.15)',

  // Status
  statusIdle: '#707070',
  statusRunning: '#cc785c',
  statusRunningBg: 'rgba(204, 120, 92, 0.1)',
  statusComplete: '#7aac8c',
  statusCompleteBg: 'rgba(122, 172, 140, 0.1)',
  statusError: '#c47060',
  statusErrorBg: 'rgba(196, 112, 96, 0.08)',

  // User message bubble
  userBubble: '#242426',
  userBubbleBorder: '#2e2e31',
  userBubbleText: '#e0e0e0',

  // Tool card
  toolBg: '#242426',
  toolBorder: '#2e2e31',
  toolRunningBorder: 'rgba(204, 120, 92, 0.3)',
  toolRunningBg: 'rgba(204, 120, 92, 0.05)',

  // Timeline
  timelineLine: '#242426',
  timelineNode: 'rgba(204, 120, 92, 0.2)',
  timelineNodeActive: '#cc785c',

  // Scrollbar
  scrollThumb: 'rgba(255, 255, 255, 0.15)',
  scrollThumbHover: 'rgba(255, 255, 255, 0.25)',

  // Buttons
  stopBg: '#ef4444',
  stopHover: '#dc2626',
  sendBg: '#cc785c',
  sendHover: '#b86a50',
  sendDisabled: 'rgba(204, 120, 92, 0.3)',

  // Popover
  popoverBg: '#1e1e20',
  popoverBorder: '#2a2a2d',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)',

  // Code block
  codeBg: '#141416',

  // Mic
  micBg: '#242426',
  micColor: '#b0b0b0',
  micDisabled: '#2e2e31',

  // Misc
  placeholder: '#606060',
  btnDisabled: '#2e2e31',
  textOnAccent: '#ffffff',
  btnHoverColor: '#b0b0b0',
  btnHoverBg: '#242426',
  accentBorder: 'rgba(204, 120, 92, 0.19)',

  // Permission (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',
} as const

export type ChatColors = typeof chatColors

/** Returns the chat color palette */
export function useChatColors(): ChatColors {
  return chatColors
}

export { chatColors }
