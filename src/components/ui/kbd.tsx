"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface KbdProps extends React.ComponentPropsWithoutRef<"kbd"> {
  meta?: boolean
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
  keys?: string[]
  size?: "sm" | "md"
  small?: boolean
}

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, meta, shift, alt, ctrl, keys = [], size = "md", small = false, children, ...props }, ref) => {
    const [isMac, setIsMac] = React.useState(true)

    React.useEffect(() => {
      if (typeof window !== "undefined" && typeof navigator !== "undefined") {
        const platform = navigator.userAgent.toLowerCase()
        setIsMac(platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad"))
      }
    }, [])

    const mappedSize = (small || size === "sm") ? "sm" : "md"

    // Resolve shortcut parts
    const parts: string[] = []

    if (keys.length > 0) {
      keys.forEach((k) => {
        const lower = k.toLowerCase()
        if (lower === "meta" || lower === "cmd") {
          parts.push(isMac ? "⌘" : "Ctrl")
        } else if (lower === "shift") {
          parts.push("⇧")
        } else if (lower === "alt" || lower === "option") {
          parts.push("⌥")
        } else if (lower === "ctrl") {
          parts.push("⌃")
        } else if (lower === "enter") {
          parts.push("↵")
        } else if (lower === "escape" || lower === "esc") {
          parts.push("Esc")
        } else {
          parts.push(k)
        }
      })
    } else {
      if (meta) parts.push(isMac ? "⌘" : "Ctrl")
      if (shift) parts.push("⇧")
      if (alt) parts.push("⌥")
      if (ctrl) parts.push("⌃")
    }

    const mainKey = children ? String(children) : ""

    return (
      <kbd
        ref={ref}
        data-slot="kbd"
        data-geist-kbd=""
        data-version="v1"
        className={cn(
          "font-sans! text-[var(--ds-gray-1000)] bg-[var(--ds-background-100)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] !leading-[1.7em] inline-block text-center rounded-sm font-medium select-none",
          mappedSize === "sm"
            ? "text-xs py-0 h-5 px-1 min-w-5 min-h-5 ml-0.5 [&>span]:text-xs [&>span]:!leading-[1.7em]"
            : "text-sm px-1.5 py-0 min-w-6 min-h-6 ml-1 [&>span]:text-sm",
          className
        )}
        {...props}
      >
        {parts.map((part, index) => {
          // Vercel applies style="min-width:1em;display:inline-block" specifically to modifier words like "Ctrl"
          const isWord = part === "Ctrl" || part === "Shift" || part === "Alt" || part === "Esc"
          return (
            <span
              key={index}
              style={isWord ? { minWidth: "1em", display: "inline-block" } : undefined}
            >
              {part}
            </span>
          )
        })}
        {mainKey && (
          <span>
            {mainKey}
          </span>
        )}
      </kbd>
    )
  }
)

Kbd.displayName = "Kbd"
