"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: "blank-slate" | "informational"
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "blank-slate",
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6 rounded-lg border border-[var(--ds-gray-alpha-400)] px-6 py-12 text-center bg-[var(--ds-background-100)]",
        variant === "informational" && "border-dashed",
        className
      )}
      {...props}
    >
      {icon && (
        <div>
          <div className="rounded-lg flex shrink-0 items-center justify-center border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] p-2.5 text-[var(--ds-gray-900)] [&_svg]:size-8">
            {icon}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="text-heading-16 font-medium text-[var(--ds-gray-1000)] mx-auto max-w-[340px] text-center text-balance">{title}</div>
        {description && (
          <div className="text-copy-14 text-[var(--ds-gray-900)] mx-auto max-w-[340px] text-center text-balance">
            {description}
          </div>
        )}
      </div>
      {(action || children) && (
        <div className="flex flex-col items-center gap-3 mt-2">
          {action}
          {children}
        </div>
      )}
    </div>
  )
}
