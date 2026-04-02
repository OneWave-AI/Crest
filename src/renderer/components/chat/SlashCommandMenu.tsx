import React, { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Trash, Cpu, CurrencyDollar, Question,
} from '@phosphor-icons/react'
import { useChatColors } from './chatTheme'

export interface SlashCommand {
  command: string
  description: string
  icon: React.ReactNode
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/clear', description: 'Clear conversation history', icon: <Trash size={13} /> },
  { command: '/cost', description: 'Show token usage and cost', icon: <CurrencyDollar size={13} /> },
  { command: '/model', description: 'Show current model info', icon: <Cpu size={13} /> },
  { command: '/help', description: 'Show available commands', icon: <Question size={13} /> },
]

export function getFilteredCommands(filter: string): SlashCommand[] {
  const q = filter.toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.command.startsWith(q))
}

interface Props {
  filter: string
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
}

export function SlashCommandMenu({ filter, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const filtered = getFilteredCommands(filter)
  const colors = useChatColors()

  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (filtered.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
      className="absolute bottom-full left-0 right-0 mb-1 z-50"
    >
      <div
        ref={listRef}
        className="overflow-y-auto rounded-xl py-1"
        style={{
          maxHeight: 220,
          background: colors.popoverBg,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${colors.popoverBorder}`,
          boxShadow: colors.popoverShadow,
        }}
      >
        {filtered.map((cmd, i) => {
          const isSelected = i === selectedIndex
          return (
            <button
              key={cmd.command}
              onClick={() => onSelect(cmd)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
              style={{
                background: isSelected ? colors.accentLight : 'transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.accentLight
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                style={{
                  background: isSelected ? colors.accentSoft : colors.surfaceHover,
                  color: isSelected ? colors.accent : colors.textTertiary,
                }}
              >
                {cmd.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className="text-[12px] font-mono font-medium"
                  style={{ color: isSelected ? colors.accent : colors.textPrimary }}
                >
                  {cmd.command}
                </span>
                <span
                  className="text-[11px] ml-2"
                  style={{ color: colors.textTertiary }}
                >
                  {cmd.description}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
