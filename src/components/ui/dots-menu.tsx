"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useDismissable } from "@/hooks/use-dismissable"

export interface DotsMenuItem {
  label?: string
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
  onSelect?: () => void
}

const ICON_SIZE = {
  sm: "size-2.5",
  md: "size-3",
  lg: "size-4.5",
}

export interface DotsMenuProps {
  items: CommandMenuItem[]
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  align?: "start" | "end"
}

type CommandMenuItem = DotsMenuItem // alias for compat

export function DotsMenu({ items, size = "lg", disabled, align = "end" }: DotsMenuProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  useDismissable(ref, open, close)

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-[var(--ds-gray-1000)] transition-colors cursor-pointer select-none",
          "hover:bg-[var(--ds-gray-alpha-200)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          open && "bg-[var(--ds-gray-alpha-200)]"
        )}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className={cn("text-current shrink-0", ICON_SIZE[size])}
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M4 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m4 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <>
          <div
            role="menu"
            className={cn(
              "absolute top-full z-50 mt-1 min-w-44 material-menu p-1 animate-dots-menu-in",
              align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"
            )}
          >
            {items.map((item, i) =>
              item.separator ? (
                <div key={i} className="my-1 h-px bg-[var(--ds-gray-alpha-400)]" />
              ) : (
                <div
                  key={i}
                  role="menuitem"
                  aria-disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return
                    item.onSelect?.()
                    setOpen(false)
                  }}
                  className={cn(
                    "flex h-9 cursor-pointer items-center rounded-md px-3 text-sm transition-colors select-none",
                    item.disabled
                      ? "cursor-not-allowed text-[var(--ds-gray-600)] hover:bg-transparent"
                      : item.destructive
                      ? "text-[var(--ds-red-900)] hover:bg-[var(--ds-red-100)]"
                      : "text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-100)]"
                  )}
                >
                  <span className="truncate w-full text-left">{item.label}</span>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
