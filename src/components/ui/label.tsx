"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface LabelProps extends React.ComponentPropsWithoutRef<"label"> {
  /** Render the text exactly as written instead of the default capitalize treatment. */
  bypassCasing?: boolean
  /** The text value of the label. */
  value?: string
  /** Whether the label is paired with an input. */
  withInput?: boolean
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, bypassCasing, value, withInput, htmlFor, id, children, ...props }, ref) => {
    // If id is provided but not htmlFor, map id to htmlFor
    const targetHtmlFor = htmlFor || id

    return (
      <label
        ref={ref}
        data-slot="label"
        data-version="v1"
        htmlFor={targetHtmlFor}
        className="contents"
        {...props}
      >
        <div
          className={cn(
            "block text-[13px] font-medium max-w-full text-[var(--ds-gray-900)] mb-2 cursor-text select-none",
            !bypassCasing && "capitalize",
            className
          )}
        >
          {value || children}
        </div>
      </label>
    )
  }
)

Label.displayName = "Label"
