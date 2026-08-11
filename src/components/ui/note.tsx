"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type NoteType = "default" | "secondary" | "success" | "error" | "warning" | "violet" | "cyan" | "alert"

// Custom SVG Icons matching Vercel
const InfoIcon = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16M6.25 7h1.5a1 1 0 0 1 1 1v4.25h-1.5V8.5h-1zM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
      clipRule="evenodd"
    />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-4.47-1.47.53-.53L11 4.94l-.53.53L6.5 9.44l-.97-.97L5 7.94 3.94 9l.53.53 1.5 1.5c.3.3.77.3 1.06 0z"
      clipRule="evenodd"
    />
  </svg>
)

const WarningIcon = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
    <path d="M8.56.5c.57 0 1.1.33 1.35.85l5.9 12.22a1 1 0 0 1-.9 1.43H1.09a1 1 0 0 1-.9-1.43L6.1 1.35A1.5 1.5 0 0 1 7.44.5zm-6.67 13h12.22L8.56 2H7.44zM8 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2m.75-1.25h-1.5v-4h1.5z" />
  </svg>
)

const OctagonIcon = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
    <path d="M10.9 0a1 1 0 0 1 .7.3l4.1 4.1.07.07a1 1 0 0 1 .23.63v5.8a1 1 0 0 1-.3.7l-4.1 4.1a1 1 0 0 1-.7.3H5a1 1 0 0 1-.53-.23l-.08-.06-4.1-4.1A1 1 0 0 1 0 10.9V5.1a1 1 0 0 1 .3-.7L4.4.3A1 1 0 0 1 5 0h5.9M1.5 5.3v5.4l3.8 3.8h5.4l3.8-3.8V5.3l-3.8-3.8H5.3zM8 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2m.75-1.25h-1.5v-5h1.5z" />
  </svg>
)

const ICONS: Record<NoteType, React.ReactNode> = {
  default: <InfoIcon />,
  secondary: <InfoIcon />,
  success: <CheckIcon />,
  error: <OctagonIcon />,
  warning: <WarningIcon />,
  violet: <InfoIcon />,
  cyan: <InfoIcon />,
  alert: <InfoIcon />,
}

export interface NoteProps extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  type?: NoteType
  size?: "sm" | "md" | "lg"
  label?: React.ReactNode | boolean
  action?: React.ReactNode
  fill?: boolean
  disabled?: boolean
}

export function Note({
  type = "default",
  size = "md",
  label,
  action,
  fill,
  disabled,
  className,
  children,
  ...props
}: NoteProps) {
  // Sizing styles matching Vercel
  const sizeStyles = {
    sm: "py-1 pl-2 pr-1.5 min-h-8 text-[13px] leading-4 rounded-[6px] gap-2",
    md: "py-1.5 px-3 min-h-9 text-sm leading-5 rounded-[6px] gap-3",
    lg: "py-1.5 px-3 min-h-10 text-sm leading-5 rounded-[6px] gap-3",
  }[size]

  // Color classes matching Vercel (Success is Blue, etc.)
  const colorStyles = fill
    ? {
        default: "bg-[var(--ds-gray-1000)] text-[var(--ds-background-100)] border-transparent",
        secondary: "bg-[var(--ds-gray-alpha-200)] text-[var(--ds-gray-alpha-900)] border-transparent",
        success: "bg-[var(--ds-blue-200)] text-[var(--ds-blue-900)] border-[var(--ds-blue-100)]",
        error: "bg-[var(--ds-red-200)] text-[var(--ds-red-900)] border-[var(--ds-red-100)]",
        warning: "bg-[var(--ds-amber-200)] text-[var(--ds-amber-900)] border-[var(--ds-amber-100)]",
        violet: "bg-[var(--ds-purple-200)] text-[var(--ds-purple-900)] border-[var(--ds-purple-100)]",
        cyan: "bg-[var(--ds-teal-200)] text-[var(--ds-teal-900)] border-[var(--ds-teal-100)]",
        alert: "bg-[var(--ds-red-200)] text-[var(--ds-red-900)] border-[var(--ds-red-100)]",
      }[type]
    : {
        default: "border-[var(--ds-gray-400)] bg-[var(--ds-background-100)] text-[var(--ds-gray-900)]",
        secondary: "border-[var(--ds-gray-alpha-400)] bg-transparent text-[var(--ds-gray-alpha-900)]",
        success: "border-[var(--ds-blue-400)] bg-transparent text-[var(--ds-blue-900)]",
        error: "border-[var(--ds-red-400)] bg-transparent text-[var(--ds-red-900)]",
        warning: "border-[var(--ds-amber-400)] bg-transparent text-[var(--ds-amber-900)]",
        violet: "border-[var(--ds-purple-400)] bg-transparent text-[var(--ds-purple-900)]",
        cyan: "border-[var(--ds-teal-400)] bg-transparent text-[var(--ds-teal-900)]",
        alert: "border-[var(--ds-red-400)] bg-transparent text-[var(--ds-red-900)]",
      }[type]

  // A custom (non-boolean) label renders as a bold text prefix; otherwise the
  // default type icon. label={false}/{null} shows neither.
  const isCustomLabel = label != null && typeof label !== "boolean"
  const showIcon = !isCustomLabel && label !== false && label !== null
  // Icon shares the note's text color (matches Vercel). Match its box to the line height.
  const labelHeight = size === "sm" ? "h-4" : "h-5"

  return (
    <div
      data-geist-note=""
      data-version="v1"
      className={cn(
        "flex items-center justify-between border w-full max-w-full font-normal break-words box-border text-left select-none",
        sizeStyles,
        colorStyles,
        disabled &&
          "bg-transparent text-[var(--ds-gray-700)] border-[var(--ds-gray-alpha-200)] pointer-events-none",
        className
      )}
      {...props}
    >
      {isCustomLabel ? (
        <div className="flex flex-col items-start gap-1 flex-1 min-w-0 sm:flex-row sm:items-center">
          <span className="shrink-0 whitespace-nowrap font-semibold">{label}</span>
          <span className="min-w-0">{children}</span>
        </div>
      ) : (
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {showIcon && (
            <span className={cn("flex items-center shrink-0 text-current [&_svg]:size-4", labelHeight)}>
              {ICONS[type]}
            </span>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      )}
      {action && <div className="shrink-0 ml-3">{action}</div>}
    </div>
  )
}
