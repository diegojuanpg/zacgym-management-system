"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type NamedSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl"

export interface SpinnerProps extends React.ComponentPropsWithoutRef<"span"> {
  size?: number | NamedSize | string
}

const SIZE_MAP: Record<NamedSize, number> = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 56,
}

export function Spinner({ className, size = "md", style, ...props }: SpinnerProps) {
  const px =
    typeof size === "number"
      ? size
      : size in SIZE_MAP
        ? SIZE_MAP[size as NamedSize]
        : parseFloat(size) || 16

  // More bars as the spinner grows, matching Geist.
  const barCount = px <= 12 ? 9 : px <= 16 ? 11 : px <= 24 ? 13 : px <= 40 ? 16 : 19
  const angle = 360 / barCount
  // Bigger spinners rotate slightly slower, matching Vercel.
  const durationS = barCount <= 11 ? 1 : barCount <= 16 ? 1.2 : 1.3
  // Bar thickness grows sub-linearly (Vercel keeps the bars thin on big spinners).
  const barHpx = px <= 16 ? 1.5 : px <= 20 ? 2 : px <= 32 ? 2.5 : px <= 40 ? 3 : 3.5

  const finalSize = typeof size === "number" ? `${size}px` : size in SIZE_MAP ? `${px}px` : size

  return (
    <span
        data-testid="geistcn/spinner"
        data-slot="spinner"
        role="status"
        aria-label="Loading"
        className={cn("relative inline-block aspect-square transform-gpu text-[var(--ds-gray-700)]", className)}
        style={{ width: finalSize, height: finalSize, ...style }}
        {...props}
      >
        {Array.from({ length: barCount }).map((_, index) => {
          // Delay pattern matching Vercel: step = duration / (barCount - 1), last two bars at 0.
          const stepMs = (durationS * 1000) / (barCount - 1)
          const delay = Math.min(0, -stepMs * (barCount - 2 - index))
          return (
            <span
              key={index}
              className="absolute top-1/2 left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 rounded-full bg-current text-current will-change-transform"
              style={{
                width: "25%",
                height: `${barHpx}px`,
                transform: `rotate(${index * angle}deg) translate(146%)`,
                animation: `spinner-opacity ${durationS}s linear infinite`,
                animationDelay: `${delay}ms`,
              }}
            />
          )
        })}
      </span>
  )
}
