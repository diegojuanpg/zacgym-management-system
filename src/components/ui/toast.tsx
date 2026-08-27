"use client"

import * as React from "react"
import { Toaster as SonnerToaster, toast } from "sonner"
import { cn } from "@/lib/utils"

export function Toaster({
  className,
  ...props
}: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      className={cn(className)}
      position="bottom-right"
      gap={8}
      closeButton
      icons={{
        close: (
          <svg viewBox="0 0 16 16" height="16" width="16" data-slot="geist-icon">
            <path
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
              d="m12.47 13.53.53.53L14.06 13l-.53-.53L9.06 8l4.47-4.47.53-.53L13 1.94l-.53.53L8 6.94 3.53 2.47 3 1.94 1.94 3l.53.53L6.94 8l-4.47 4.47-.53.53L3 14.06l.53-.53L8 9.06z"
            />
          </svg>
        ),
      }}
      style={{ width: "420px", "--width": "420px" } as React.CSSProperties}
      toastOptions={{
        classNames: {
          // data-[type] selectors have higher specificity than the base !bg, so
          // colored variants win without stylesheet-order luck. pr-10 only when the X is present.
          toast:
            "!bg-[var(--geist-background)] !text-[var(--ds-gray-1000)] !border-none !shadow-[var(--ds-shadow-menu)] !rounded-[12px] !text-sm !min-h-[63px] !items-center [&:has([data-close-button])]:!pr-10 data-[type=success]:!bg-[var(--ds-blue-700)] data-[type=success]:!text-white data-[type=info]:!bg-[var(--ds-blue-700)] data-[type=info]:!text-white data-[type=warning]:!bg-[var(--ds-amber-800)] data-[type=warning]:!text-[var(--ds-gray-1000)] data-[type=error]:!bg-[var(--ds-red-800)] data-[type=error]:!text-white",
          title: "!font-normal !text-inherit",
          description: "!text-inherit opacity-90",
          actionButton:
            "!bg-[var(--ds-gray-1000)] !text-[var(--ds-background-100)] !rounded-md !text-sm !font-medium",
          cancelButton:
            "!bg-transparent !text-[var(--ds-gray-1000)] !rounded-md !text-sm !font-medium",
          closeButton:
            "!left-auto !right-4 !top-0 !bottom-0 !my-auto !transform-none !bg-transparent !border-none !text-current !opacity-100 hover:!bg-transparent hover:!border-none !transition-all !shadow-none [&_svg]:!size-4",
          icon: "!hidden",
        },
      }}
      {...props}
    />
  )
}

export { toast }
