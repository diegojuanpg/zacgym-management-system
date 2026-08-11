"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-lg border-0 text-sm text-[var(--ds-gray-1000)] transition-all duration-150 ease-in-out select-none",
  {
    variants: {
      type: {
        default: "bg-[var(--ds-background-100)]",
        secondary: "bg-[var(--ds-background-200)]",
      },
      hoverable: {
        true: "hover:shadow-[var(--ds-shadow-border),0_6px_14px_rgba(0,0,0,0.08)] dark:hover:shadow-[var(--ds-shadow-border),0_6px_14px_rgba(0,0,0,0.3)] cursor-pointer",
        false: "",
      },
      shadow: {
        true: "shadow-[var(--ds-shadow-border),0_4px_6px_rgba(0,0,0,0.04)] dark:shadow-[var(--ds-shadow-border),0_4px_6px_rgba(0,0,0,0.2)]",
        false: "shadow-[var(--ds-shadow-border)]",
      },
      padded: {
        true: "p-4",
        false: "p-0",
      },
    },
    defaultVariants: { type: "default", hoverable: false, shadow: false, padded: true },
  }
)

export interface CardProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof cardVariants> {}

export function Card({ className, type, hoverable, shadow, padded, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ type, hoverable, shadow, padded }), className)}
      {...props}
    />
  )
}
