"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

export interface DescriptionProps extends Omit<React.ComponentPropsWithoutRef<"dl">, "title" | "content"> {
  title: React.ReactNode
  content: React.ReactNode
  align?: "left" | "right"
  ellipsis?: boolean
  tooltip?: React.ReactNode
}

const InfoIcon = () => (
  <svg viewBox="0 0 16 16" height="14" width="14" className="text-[var(--ds-gray-700)]">
    <path fill="currentColor" fillOpacity=".08" d="M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0"></path>
    <path fill="currentColor" fillRule="evenodd" d="M8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2M7 7h-.75v1.5h1v2.75h1.5V8a1 1 0 0 0-1-1z" clipRule="evenodd"></path>
  </svg>
)

export function Description({ title, content, align = "left", ellipsis, tooltip, className, ...props }: DescriptionProps) {
  return (
    <dl
      className={cn("m-0 flex flex-col gap-0.5", align === "right" && "items-end text-right", className)}
      {...props}
    >
      <dt className="text-sm leading-[14px] min-h-[14px] text-[var(--ds-gray-900)] mb-2 flex items-center gap-1 font-normal select-none">
        {title}
        {tooltip && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block align-middle cursor-help">
                  <InfoIcon />
                </span>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </dt>
      <dd className={cn("m-0 text-sm text-[var(--ds-gray-1000)] font-medium leading-normal", ellipsis && "max-w-full truncate")}>
        {content}
      </dd>
    </dl>
  )
}
