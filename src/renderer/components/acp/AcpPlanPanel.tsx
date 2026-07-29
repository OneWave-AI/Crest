import React from 'react'
import { Check, CircleDashed, Loader2 } from 'lucide-react'
import type { AcpPlanEntry } from '@shared/acp'

/**
 * The agent's plan arrives as a typed `plan` update — no scraping a todo list out
 * of rendered terminal text. Each update replaces the plan wholesale (ACP rule).
 */
export default function AcpPlanPanel({ entries }: { entries: AcpPlanEntry[] }) {
  const done = entries.filter((e) => e.status === 'completed').length

  return (
    <aside className="w-64 shrink-0 border-l border-surface-border bg-surface overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Plan</span>
        <span className="text-[11px] text-neutral-600 font-mono">
          {done}/{entries.length}
        </span>
      </div>
      <ul className="p-2 space-y-1">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-start gap-2 px-1.5 py-1.5 rounded">
            {entry.status === 'completed' ? (
              <Check size={12} className="mt-0.5 shrink-0 text-neutral-600" />
            ) : entry.status === 'in_progress' ? (
              <Loader2 size={12} className="mt-0.5 shrink-0 text-accent animate-spin" />
            ) : (
              <CircleDashed size={12} className="mt-0.5 shrink-0 text-neutral-700" />
            )}
            <span
              className={`text-[12px] leading-[1.45] ${
                entry.status === 'completed'
                  ? 'text-neutral-600 line-through'
                  : entry.status === 'in_progress'
                    ? 'text-neutral-200'
                    : 'text-neutral-400'
              }`}
            >
              {entry.content}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
