"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  /** Keep the footer pinned while the body scrolls. */
  sticky?: boolean
  /** Element focused when the modal opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  className?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  sticky,
  initialFocusRef,
  className,
}: ModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
      if (e.key === "Tab" && cardRef.current) {
        // Minimal focus trap: keep Tab cycling inside the dialog.
        const focusables = cardRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !cardRef.current.contains(active))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const t = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else {
        cardRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
      }
    }, 0)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
      clearTimeout(t)
    }
  }, [open, onOpenChange, initialFocusRef])

  if (!open) return null
  // Portal: el overlay es position:fixed, pero igual hereda del lugar donde se
  // monta. Abriendolo desde una celda de tabla heredaba su whitespace-nowrap y
  // ningun texto del modal envolvia. Colgado del body no hereda nada de eso.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-4 sm:items-center animate-in fade-in duration-200"
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex w-[540px] max-w-full flex-col overflow-hidden rounded-xl bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] shadow-[var(--ds-shadow-modal)] max-h-[min(800px,80vh)] animate-in fade-in zoom-in-95 duration-200",
          className
        )}
      >
        {(title || description) && (
          // Sticky: header pinned above the scroll area. Otherwise it scrolls with the body.
          <header
            className={cn(
              "flex shrink-0 flex-col gap-1.5 rounded-t-xl border-b border-[var(--ds-gray-alpha-400)] px-6 py-5 text-[var(--ds-gray-1000)] dark:bg-[var(--ds-background-100)]",
              sticky ? "" : "hidden"
            )}
          >
            {title && (
              <h3 className="text-xl font-semibold leading-6 text-[var(--ds-gray-1000)]">{title}</h3>
            )}
            {description && (
              <p className="text-copy-14 leading-relaxed text-[var(--ds-gray-900)]">{description}</p>
            )}
          </header>
        )}
        {/* Body: content (and header, when not sticky) on the background-200 surface. */}
        <div
          className={cn(
            "flex-1 overflow-y-auto text-copy-16 text-[var(--ds-gray-1000)] dark:bg-[var(--ds-background-200)]",
            sticky ? "px-6 pt-6 pb-6" : "rounded-t-xl px-6 pt-5 pb-6"
          )}
        >
          {!sticky && (title || description) && (
            <header className="mb-6 last:mb-0">
              {title && (
                <h3 className="text-heading-24 pb-1 text-[var(--ds-gray-1000)]">{title}</h3>
              )}
              {description && (
                <div className="text-copy-16 text-[var(--ds-gray-1000)]">{description}</div>
              )}
            </header>
          )}
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--ds-gray-alpha-400)] p-4 dark:bg-[var(--ds-background-200)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
