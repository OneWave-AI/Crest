import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  submenu?: ContextMenuItem[]
  divider?: boolean
  onClick?: () => void
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

interface SubmenuState {
  itemId: string
  position: { x: number; y: number }
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuState | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

  // Calculate position to keep menu within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let x = position.x
      let y = position.y

      // Adjust horizontal position
      if (x + rect.width > viewportWidth - 8) {
        x = viewportWidth - rect.width - 8
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight - 8) {
        y = viewportHeight - rect.height - 8
      }

      // Ensure minimum position
      x = Math.max(8, x)
      y = Math.max(8, y)

      setAdjustedPosition({ x, y })
    }
  }, [position])

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [onClose])

  // Get non-divider items for keyboard navigation
  const navigableItems = items.filter((item) => !item.divider)

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev + 1
            return next >= navigableItems.length ? 0 : next
          })
          setActiveSubmenu(null)
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev - 1
            return next < 0 ? navigableItems.length - 1 : next
          })
          setActiveSubmenu(null)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (focusedIndex >= 0) {
            const item = navigableItems[focusedIndex]
            if (item?.submenu && !item.disabled) {
              // Open submenu - position will be calculated by ContextMenuItem
              const menuItem = menuRef.current?.querySelector(
                `[data-item-id="${item.id}"]`
              ) as HTMLElement
              if (menuItem) {
                const rect = menuItem.getBoundingClientRect()
                setActiveSubmenu({
                  itemId: item.id,
                  position: { x: rect.right, y: rect.top }
                })
              }
            }
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          setActiveSubmenu(null)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (focusedIndex >= 0) {
            const item = navigableItems[focusedIndex]
            if (item && !item.disabled && !item.submenu) {
              item.onClick?.()
              onClose()
            }
          }
          break
      }
    },
    [focusedIndex, navigableItems, onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.submenu) return
    item.onClick?.()
    onClose()
  }

  const handleSubmenuOpen = (itemId: string, position: { x: number; y: number }) => {
    setActiveSubmenu({ itemId, position })
  }

  const handleSubmenuClose = () => {
    setActiveSubmenu(null)
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className={`fixed z-[200] min-w-[200px] py-1.5 rounded-xl border border-overlay/[0.08] bg-surface-4/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset] transition-all duration-150 origin-top-left ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y
      }}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return (
            <div
              key={item.id}
              className="my-1.5 mx-3 h-px bg-gradient-to-r from-transparent via-overlay/10 to-transparent"
            />
          )
        }

        const navigableIndex = navigableItems.findIndex((ni) => ni.id === item.id)
        const isFocused = navigableIndex === focusedIndex

        return (
          <ContextMenuItemComponent
            key={item.id}
            item={item}
            isFocused={isFocused}
            isSubmenuOpen={activeSubmenu?.itemId === item.id}
            onClick={() => handleItemClick(item)}
            onSubmenuOpen={handleSubmenuOpen}
            onSubmenuClose={handleSubmenuClose}
            onClose={onClose}
          />
        )
      })}

      {/* Submenu */}
      {activeSubmenu && (
        <ContextMenuSubmenu
          items={
            items.find((item) => item.id === activeSubmenu.itemId)?.submenu || []
          }
          position={activeSubmenu.position}
          onClose={onClose}
          onBack={handleSubmenuClose}
        />
      )}
    </div>
  )
}

interface ContextMenuItemComponentProps {
  item: ContextMenuItem
  isFocused: boolean
  isSubmenuOpen: boolean
  onClick: () => void
  onSubmenuOpen: (itemId: string, position: { x: number; y: number }) => void
  onSubmenuClose: () => void
  onClose: () => void
}

function ContextMenuItemComponent({
  item,
  isFocused,
  isSubmenuOpen,
  onClick,
  onSubmenuOpen,
  onSubmenuClose
}: ContextMenuItemComponentProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const handleMouseEnter = () => {
    if (item.submenu && !item.disabled) {
      hoverTimeoutRef.current = setTimeout(() => {
        if (itemRef.current) {
          const rect = itemRef.current.getBoundingClientRect()
          onSubmenuOpen(item.id, { x: rect.right - 4, y: rect.top - 6 })
        }
      }, 150)
    } else {
      onSubmenuClose()
    }
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  const Icon = item.icon

  return (
    <div
      ref={itemRef}
      role="menuitem"
      data-item-id={item.id}
      aria-disabled={item.disabled}
      tabIndex={-1}
      className={`group relative flex items-center gap-3 mx-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-100 ${
        item.disabled
          ? 'opacity-40 cursor-not-allowed'
          : isFocused || isSubmenuOpen
            ? item.danger
              ? 'bg-red-500/20 text-red-400'
              : 'bg-accent/15 text-white'
            : item.danger
              ? 'text-red-400 hover:bg-red-500/20'
              : 'text-ink hover:bg-overlay/[0.06] hover:text-ink-bright'
      }`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Icon */}
      {Icon && (
        <Icon
          size={16}
          aria-hidden="true"
          className={`flex-shrink-0 transition-colors duration-100 ${
            item.danger
              ? 'text-red-400'
              : isFocused || isSubmenuOpen
                ? 'text-accent'
                : 'text-ink-subtle group-hover:text-ink-muted'
          }`}
        />
      )}

      {/* Label */}
      <span className="flex-1 text-[13px] font-medium">{item.label}</span>

      {/* Shortcut */}
      {item.shortcut && (
        <span className="text-[11px] text-ink-subtle font-mono tracking-wide">
          {item.shortcut}
        </span>
      )}

      {/* Submenu indicator */}
      {item.submenu && (
        <ChevronRight
          size={14}
          className={`flex-shrink-0 transition-colors duration-100 ${
            isFocused || isSubmenuOpen ? 'text-accent' : 'text-ink-subtle'
          }`}
        />
      )}

      {/* Hover glow effect */}
      {!item.disabled && !item.danger && (isFocused || isSubmenuOpen) && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent/5 to-transparent pointer-events-none" />
      )}
    </div>
  )
}

interface ContextMenuSubmenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
  onBack: () => void
}

function ContextMenuSubmenu({ items, position, onClose, onBack }: ContextMenuSubmenuProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const submenuRef = useRef<HTMLDivElement>(null)

  // Calculate position to keep submenu within viewport
  useEffect(() => {
    if (submenuRef.current) {
      const rect = submenuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let x = position.x
      let y = position.y

      // If submenu would overflow right, position to the left of parent
      if (x + rect.width > viewportWidth - 8) {
        x = position.x - rect.width - 200 + 8 // Parent width approximation
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight - 8) {
        y = viewportHeight - rect.height - 8
      }

      // Ensure minimum position
      x = Math.max(8, x)
      y = Math.max(8, y)

      setAdjustedPosition({ x, y })
    }
  }, [position])

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return
    item.onClick?.()
    onClose()
  }

  return (
    <div
      ref={submenuRef}
      role="menu"
      aria-orientation="vertical"
      className={`fixed z-[201] min-w-[180px] py-1.5 rounded-xl border border-overlay/[0.08] bg-surface-4/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset] transition-all duration-150 origin-top-left ${
        isVisible ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-95 -translate-x-1'
      }`}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return (
            <div
              key={item.id}
              className="my-1.5 mx-3 h-px bg-gradient-to-r from-transparent via-overlay/10 to-transparent"
            />
          )
        }

        const Icon = item.icon

        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled}
            className={`group flex items-center gap-3 mx-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-100 ${
              item.disabled
                ? 'opacity-40 cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/20'
                  : 'text-ink hover:bg-overlay/[0.06] hover:text-ink-bright'
            }`}
            onClick={() => handleItemClick(item)}
          >
            {Icon && (
              <Icon
                size={16}
                aria-hidden="true"
                className={`flex-shrink-0 transition-colors duration-100 ${
                  item.danger
                    ? 'text-red-400'
                    : 'text-ink-subtle group-hover:text-ink-muted'
                }`}
              />
            )}
            <span className="flex-1 text-[13px] font-medium">{item.label}</span>
            {item.shortcut && (
              <span className="text-[11px] text-ink-subtle font-mono tracking-wide">
                {item.shortcut}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Hook for using context menu
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<{
    items: ContextMenuItem[]
    position: { x: number; y: number }
  } | null>(null)

  const showContextMenu = useCallback(
    (
      e: React.MouseEvent | MouseEvent,
      items: ContextMenuItem[]
    ) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({
        items,
        position: { x: e.clientX, y: e.clientY }
      })
    },
    []
  )

  const hideContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const ContextMenuComponent = contextMenu ? (
    <ContextMenu
      items={contextMenu.items}
      position={contextMenu.position}
      onClose={hideContextMenu}
    />
  ) : null

  return {
    showContextMenu,
    hideContextMenu,
    ContextMenuComponent,
    isOpen: contextMenu !== null
  }
}

export default ContextMenu
