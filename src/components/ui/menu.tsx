"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useDismissable } from "@/hooks/use-dismissable"

export interface MenuItem {
  label?: string
  icon?: React.ReactNode
  suffix?: React.ReactNode
  disabled?: boolean
  locked?: boolean
  destructive?: boolean
  href?: string
  separator?: boolean
  section?: string
  onSelect?: () => void
}

const LockIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="text-[var(--ds-gray-700)] ml-auto">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M5 5V4a3 3 0 1 1 6 0v1h.5A1.5 1.5 0 0 1 13 6.5v6A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-6A1.5 1.5 0 0 1 4.5 5zm1.5 0V4a1.5 1.5 0 0 1 3 0v1z"
      clipRule="evenodd"
    />
  </svg>
)

const ChevronDown = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    className={cn("text-[var(--ds-gray-700)] transition-transform duration-150", open && "rotate-180")}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M13.06 6.06 8 11.12 2.94 6.06 4 5l4 4 4-4z"
      clipRule="evenodd"
    />
  </svg>
)

export interface MenuProps {
  items: MenuItem[]
  trigger?: React.ReactNode
  triggerLabel?: string
  chevron?: boolean
  align?: "start" | "end"
  side?: "bottom" | "top"
  variant?: "primary" | "secondary"
}

export function Menu({
  items,
  trigger,
  triggerLabel = "Open",
  chevron,
  align = "start",
  side = "bottom",
  variant = "primary",
}: MenuProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  useDismissable(ref, open, close)

  const isSecondary = variant === "secondary"

  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        {trigger ?? (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "outline-none m-0 border-0 align-baseline no-underline group/trigger relative cursor-pointer select-none transform translate-z-0 flex text-[var(--themed-fg,_var(--ds-background-100))] bg-[var(--themed-bg,_var(--ds-gray-1000))] font-medium !px-(--geist-gap-half) max-w-full items-center justify-center transition-[border-color,background,color,transform,box-shadow] duration-[150ms] ease-in-out focus-visible:transition-none focus-visible:shadow-[var(--ds-focus-ring)] [&_svg]:shrink-0 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:text-[var(--ds-gray-700)] disabled:bg-[var(--ds-gray-100)] aria-disabled:text-[var(--ds-gray-700)] aria-disabled:bg-[var(--ds-gray-100)] disabled:![--themed-border:_var(--ds-gray-400)] [--x-padding:10px] [--height:40px] text-[14px] !pl-[var(--x-padding)] !pr-[var(--x-padding)] rounded-lg h-[var(--height)] hover:bg-[var(--themed-hover-bg,_hsl(0,_0%,_22%))] dark:hover:bg-[var(--themed-hover-bg,_hsl(0,_0%,_80%))] hover:[--themed-border:var(--themed-hover-bg,_var(--ds-gray-200))] hover:disabled:bg-[var(--ds-gray-100)]",
              isSecondary && "[--themed-bg:var(--ds-background-100)] shadow-[0_0_0_1px_var(--themed-border)] [--themed-hover-bg:var(--ds-gray-alpha-200)] [--themed-fg:var(--ds-gray-1000)] [--themed-border:var(--ds-gray-400)] hover:bg-[var(--ds-gray-100)] dark:hover:bg-[var(--ds-gray-200)]"
            )}
          >
            <span className="truncate px-1.5 flex items-center justify-center">
              <span className="flex items-center justify-between gap-1 flex-nowrap w-full">
                {triggerLabel}
                {chevron && <ChevronDown open={open} />}
              </span>
            </span>
          </button>
        )}
      </span>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 min-w-50 border-0 p-2 material-menu overflow-x-hidden overflow-y-auto overscroll-contain outline-none animate-in fade-in-50 zoom-in-95 duration-100",
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="my-1.5 h-px bg-[var(--ds-gray-alpha-300)] -mx-2" />
            }
            if (item.section) {
              return (
                <div
                  key={i}
                  className="px-2 py-1.5 text-xs font-medium text-[var(--ds-gray-700)] select-none uppercase tracking-wider"
                >
                  {item.section}
                </div>
              )
            }
            const inactive = item.disabled || item.locked
            const cls = cn(
              "outline-none cursor-pointer flex items-center px-2 h-10 rounded-[6px] w-full transition-colors duration-150 select-none text-sm",
              inactive
                ? "cursor-default text-[var(--ds-gray-600)] pointer-events-none"
                : item.destructive
                ? "text-[var(--ds-red-900)] hover:bg-[var(--ds-red-100)]"
                : "text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-100)]"
            )
            const inner = (
              <>
                {item.icon && (
                  <span className="flex size-4.5 shrink-0 items-center justify-center text-current mr-2 [&_svg]:size-[18px]">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 truncate text-left">{item.label}</span>
                {item.locked ? (
                  <LockIcon />
                ) : (
                  item.suffix && (
                    <span className="shrink-0 flex items-center justify-center ml-2">
                      {item.suffix}
                    </span>
                  )
                )}
              </>
            )
            if (item.href && !inactive) {
              return (
                <a
                  key={i}
                  href={item.href}
                  role="menuitem"
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  {inner}
                </a>
              )
            }
            return (
              <div
                key={i}
                role="menuitem"
                aria-disabled={inactive}
                onClick={() => {
                  if (inactive) return
                  item.onSelect?.()
                  setOpen(false)
                }}
                className={cls}
              >
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
