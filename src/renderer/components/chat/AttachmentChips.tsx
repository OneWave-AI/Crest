import React from 'react'
import { X, FileText } from '@phosphor-icons/react'
import { useChatColors } from './chatTheme'

export interface Attachment {
  id: string
  name: string
  path?: string           // file path for Claude CLI
  mimeType?: string
  dataUrl?: string
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) {
  const colors = useChatColors()
  if (attachments.length === 0) return null

  return (
    <div className="flex gap-1.5 pb-1 px-4" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
      {attachments.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-1.5 group flex-shrink-0"
          style={{
            background: colors.surfacePrimary,
            border: `1px solid ${colors.surfaceSecondary}`,
            borderRadius: 14,
            padding: '4px 8px',
            maxWidth: 200,
          }}
        >
          <span className="flex-shrink-0" style={{ color: colors.textTertiary }}>
            <FileText size={14} />
          </span>
          <span className="text-[11px] font-medium truncate" style={{ color: colors.textPrimary }}>
            {a.name}
          </span>
          <button
            onClick={() => onRemove(a.id)}
            className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: colors.textTertiary }}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}
