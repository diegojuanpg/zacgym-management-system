"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Kbd } from "@/components/ui/kbd"

export const TooltipProvider = ({ children }: { children: React.ReactNode; delayDuration?: number }) => <>{children}</>
TooltipProvider.displayName = "TooltipProvider"

type Side = "top" | "bottom" | "left" | "right"
type BoxAlign = "left" | "center" | "right"
type TooltipType = "success" | "error" | "warning" | "violet"

interface TooltipContextType {
  open: boolean
  setOpen: (open: boolean) => void
  side: Side
  sideOffset: number
  boxAlign: BoxAlign
  type?: TooltipType
}

const TooltipContext = React.createContext<TooltipContextType | null>(null)

const TYPE_STYLES: Record<TooltipType, string> = {
  success: "bg-[var(--ds-green-700)] text-white",
  error: "bg-[var(--ds-red-700)] text-white",
  warning: "bg-[var(--ds-amber-700)] text-black",
  violet: "bg-[var(--ds-purple-700)] text-white",
}
const TYPE_ARROW: Record<TooltipType, string> = {
  success: "bg-[var(--ds-green-700)]",
  error: "bg-[var(--ds-red-700)]",
  warning: "bg-[var(--ds-amber-700)]",
  violet: "bg-[var(--ds-purple-700)]",
}

function boxPos(side: Side, sideOffset: number, boxAlign: BoxAlign): React.CSSProperties {
  if (side === "top" || side === "bottom") {
    const v = side === "top"
      ? { bottom: "100%", ["--ty" as string]: `-${sideOffset}px` }
      : { top: "100%", ["--ty" as string]: `${sideOffset}px` }
    const h =
      boxAlign === "left" ? { left: 0, transform: "translateY(var(--ty))" }
      : boxAlign === "right" ? { right: 0, transform: "translateY(var(--ty))" }
      : { left: "50%", transform: "translate(-50%, var(--ty))" }
    return { ...v, ...h }
  }
  const tx = side === "left" ? `-${sideOffset}px` : `${sideOffset}px`
  const edge = side === "left" ? { right: "100%" } : { left: "100%" }
  const v =
    boxAlign === "left" ? { top: 0, transform: `translateX(${tx})` }
    : boxAlign === "right" ? { bottom: 0, transform: `translateX(${tx})` }
    : { top: "50%", transform: `translate(${tx}, -50%)` }
  return { ...edge, ...v }
}

function arrowClass(side: Side, boxAlign: BoxAlign, type?: TooltipType): string {
  const isVert = side === "top" || side === "bottom"
  const hAlign = isVert
    ? boxAlign === "left" ? "left-3"
      : boxAlign === "right" ? "right-3"
      : "left-1/2 -translate-x-1/2"
    : boxAlign === "left" ? "top-3"
      : boxAlign === "right" ? "bottom-3"
      : "top-1/2 -translate-y-1/2"
  return cn(
    "absolute w-1.5 h-1.5 rotate-45",
    type ? TYPE_ARROW[type] : "bg-[var(--ds-gray-1000)]",
    side === "top" && cn("bottom-[-3px] border-r border-b border-[var(--ds-gray-alpha-300)]", hAlign),
    side === "bottom" && cn("top-[-3px] border-l border-t border-[var(--ds-gray-alpha-300)]", hAlign),
    side === "left" && cn("right-[-3px] border-r border-t border-[var(--ds-gray-alpha-300)]", hAlign),
    side === "right" && cn("left-[-3px] border-l border-b border-[var(--ds-gray-alpha-300)]", hAlign)
  )
}

function boxClass(type?: TooltipType, center = true, className?: string): string {
  return cn(
    "absolute z-50 w-max max-w-[280px] select-none rounded-lg px-2 py-1.5 text-[13px] font-normal leading-[1.3] text-pretty whitespace-pre-line break-words",
    center ? "text-center" : "text-left",
    type ? TYPE_STYLES[type] : "bg-[var(--ds-gray-1000)] text-[var(--ds-background-100)]",
    "animate-in fade-in-0 zoom-in-95 duration-150",
    className
  )
}

export interface TooltipProps {
  children?: React.ReactNode
  /** Content (alias: text). */
  content?: React.ReactNode
  text?: React.ReactNode
  keys?: string[]
  side?: Side
  /** Alias for side. */
  position?: Side
  sideOffset?: number
  boxAlign?: BoxAlign
  type?: TooltipType
  /** Hover open delay in ms; pass false for none. */
  delay?: number | boolean
  delayDuration?: number
  /** Show the little arrow/tip indicator (default true). */
  tip?: boolean
  /** Center the text (default true); false left-aligns it. */
  center?: boolean
  className?: string
}

export function Tooltip({
  children,
  content,
  text,
  keys,
  side,
  position,
  sideOffset = 6,
  boxAlign = "center",
  type,
  delay,
  delayDuration = 300,
  tip = true,
  center = true,
  className,
}: TooltipProps) {
  const resolvedSide: Side = position ?? side ?? "top"
  const resolvedContent = text ?? content
  const openDelay = delay === false ? 0 : typeof delay === "number" ? delay : delayDuration

  const [open, setOpen] = React.useState(false)
  const timerRef = React.useRef<number | null>(null)

  const show = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(true), openDelay)
  }
  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(false), 100)
  }

  React.useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])

  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  }

  if (resolvedContent !== undefined) {
    return (
      <div className="relative inline-block" {...handlers}>
        <span tabIndex={0}>{children}</span>
        {open && (
          <div data-slot="tooltip" style={boxPos(resolvedSide, sideOffset, boxAlign)} className={boxClass(type, center, className)}>
            <span className={cn(keys && "inline-flex items-center gap-1.5")}>
              {resolvedContent}
              {keys && (
                <Kbd
                  keys={keys}
                  size="sm"
                  className="border-white/20 bg-white/10 text-white dark:border-black/20 dark:bg-black/10 dark:text-black opacity-80"
                />
              )}
            </span>
            {tip && <div className={arrowClass(resolvedSide, boxAlign, type)} />}
          </div>
        )}
      </div>
    )
  }

  return (
    <TooltipContext.Provider value={{ open, setOpen, side: resolvedSide, sideOffset, boxAlign, type }}>
      <div className="relative inline-block" {...handlers}>
        {children}
      </div>
    </TooltipContext.Provider>
  )
}
Tooltip.displayName = "Tooltip"

export interface TooltipTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

export function TooltipTrigger({ children, asChild, ...props }: TooltipTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, props)
  }
  return (
    <span tabIndex={0} {...props}>
      {children}
    </span>
  )
}
TooltipTrigger.displayName = "TooltipTrigger"

export interface TooltipContentProps {
  children: React.ReactNode
  className?: string
}

export function TooltipContent({ children, className }: TooltipContentProps) {
  const context = React.useContext(TooltipContext)
  if (!context) return null
  const { open, side, sideOffset, boxAlign, type } = context
  if (!open) return null

  return (
    <div data-slot="tooltip" style={boxPos(side, sideOffset, boxAlign)} className={boxClass(type, true, className)}>
      {children}
      <div className={arrowClass(side, boxAlign, type)} />
    </div>
  )
}
TooltipContent.displayName = "TooltipContent"
