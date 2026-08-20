"use client"

import * as React from "react"
import { DayPicker, type DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { useDismissable } from "@/hooks/use-dismissable"
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "@/components/icons"

export type { DateRange }

/* ------------------------------- month grid ------------------------------ */

type CalendarGridProps = React.ComponentProps<typeof DayPicker>

export function CalendarGrid({ className, classNames, showOutsideDays = true, ...props }: CalendarGridProps) {
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        month_caption: "flex h-8 items-center justify-center relative",
        caption_label: "text-sm font-semibold text-[var(--ds-gray-1000)]",
        nav: "absolute inset-x-1 top-0 z-10 flex items-center justify-between pointer-events-none",
        button_previous:
          "text-[var(--ds-gray-900)] hover:text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-200)] flex size-8 items-center justify-center rounded-md transition-colors pointer-events-auto",
        button_next:
          "text-[var(--ds-gray-900)] hover:text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-200)] flex size-8 items-center justify-center rounded-md transition-colors pointer-events-auto",
        month_grid: "w-full border-collapse",
        weekdays: "flex mb-1",
        weekday:
          "text-[var(--ds-gray-700)] w-9 text-center text-[10px] font-medium tracking-wider uppercase",
        week: "mt-1 flex w-full",
        day: "group/day relative size-9 p-0 text-center",
        day_button:
          "cal-btn text-xs hover:bg-[var(--ds-gray-alpha-200)] flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors text-[var(--ds-gray-900)]",
        selected:
          "[&_.cal-btn]:bg-[var(--ds-gray-1000)] [&_.cal-btn]:text-[var(--ds-background-100)] [&_.cal-btn]:hover:bg-[var(--ds-gray-1000)] [&_.cal-btn]:font-medium",
        range_start:
          "[&_.cal-btn]:bg-[var(--ds-gray-1000)] [&_.cal-btn]:text-[var(--ds-background-100)] [&_.cal-btn]:rounded-r-none [&_.cal-btn]:font-medium",
        range_middle:
          "[&_.cal-btn]:bg-[var(--ds-gray-alpha-200)] [&_.cal-btn]:text-[var(--ds-gray-1000)] [&_.cal-btn]:rounded-none",
        range_end:
          "[&_.cal-btn]:bg-[var(--ds-gray-1000)] [&_.cal-btn]:text-[var(--ds-background-100)] [&_.cal-btn]:rounded-l-none [&_.cal-btn]:font-medium",
        // Anillo y no borde: el borde gris se perdia contra el fondo, y el
        // anillo se ve igual de bien cuando hoy ademas es el dia elegido y el
        // boton esta pintado de negro.
        today:
          "[&_.cal-btn]:ring-2 [&_.cal-btn]:ring-inset [&_.cal-btn]:ring-[var(--ds-blue-900)] [&_.cal-btn]:font-semibold",
        outside: "text-[var(--ds-gray-700)] opacity-40",
        disabled: "opacity-40 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className={cn("size-4", chevronClassName)} />
          ) : (
            <ChevronRightIcon className={cn("size-4", chevronClassName)} />
          ),
      }}
      {...props}
    />
  )
}

/* ------------------------------ range picker ----------------------------- */

export interface CalendarPreset {
  label: string
  /** Range the preset resolves to, computed at selection time. */
  range: () => DateRange
}

export interface CalendarProps {
  size?: "small" | "medium"
  presets?: CalendarPreset[]
  /** Label of the preset selected by default. */
  defaultPreset?: string
  defaultValue?: DateRange
  min?: Date
  max?: Date
  /** Single trigger with a chevron instead of the date-range trigger. */
  compact?: boolean
  /** Stack the preset trigger above the date trigger. */
  stacked?: boolean
  /** Align popover content (calendar and fields) horizontally. */
  horizontalLayout?: boolean
  /** Lock the calendar to a timezone, shown as read-only text instead of a select. */
  pinnedTimezone?: string
  onChange?: (range: DateRange | undefined) => void
  className?: string
}

const fmtDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const fmtDayYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })

function rangeLabel(range: DateRange | undefined): string | null {
  if (!range?.from) return null
  if (!range.to || range.from.toDateString() === range.to.toDateString()) {
    return fmtDayYear.format(range.from)
  }
  return `${fmtDay.format(range.from)} – ${fmtDayYear.format(range.to)}`
}

export function Calendar({
  size = "medium",
  presets,
  defaultPreset,
  defaultValue,
  min,
  max,
  compact,
  stacked,
  horizontalLayout,
  pinnedTimezone,
  onChange,
  className,
}: CalendarProps) {
  const initial =
    defaultValue ??
    (defaultPreset ? presets?.find((p) => p.label === defaultPreset)?.range() : undefined)

  const [applied, setApplied] = React.useState<DateRange | undefined>(initial)
  const [draft, setDraft] = React.useState<DateRange | undefined>(initial)
  const [preset, setPreset] = React.useState<string | null>(defaultPreset ?? null)
  const [open, setOpen] = React.useState(false)
  const [presetsOpen, setPresetsOpen] = React.useState(false)
  const [timezone, setTimezone] = React.useState<"utc" | "local">("local")

  const ref = React.useRef<HTMLDivElement>(null)
  const closeAll = React.useCallback(() => {
    setOpen(false)
    setPresetsOpen(false)
  }, [])
  useDismissable(ref, open || presetsOpen, closeAll)

  const commit = (range: DateRange | undefined) => {
    setApplied(range)
    onChange?.(range)
  }

  const buttonSize = size === "small" ? "sm" : "md"
  const label = rangeLabel(applied)
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const presetTrigger = presets && (
    <div className="relative">
      <Button
        variant="secondary"
        size={buttonSize}
        prefix={<ClockIcon className="size-4 text-[var(--ds-gray-700)]" />}
        suffix={<ChevronDownIcon className="size-4 text-[var(--ds-gray-700)]" />}
        aria-haspopup="menu"
        aria-expanded={presetsOpen}
        onClick={() => {
          setPresetsOpen((v) => !v)
          setOpen(false)
        }}
        className={cn(!preset && "text-[var(--ds-gray-900)]")}
      >
        {preset ?? "Select Period"}
      </Button>
      {presetsOpen && (
        <div role="menu" className="absolute top-full left-0 z-50 mt-1 w-max min-w-full material-menu p-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setPreset(p.label)
                const r = p.range()
                setDraft(r)
                commit(r)
                setPresetsOpen(false)
              }}
              className={cn(
                "flex h-9 w-full cursor-pointer items-center rounded-md px-2.5 text-sm text-[var(--ds-gray-1000)] transition-colors hover:bg-[var(--ds-gray-alpha-100)]",
                preset === p.label && "bg-[var(--ds-gray-alpha-100)]"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div ref={ref} className={cn("relative inline-flex", stacked ? "flex-col gap-2" : "items-center gap-2", className)}>
      {presetTrigger}
      <div className={cn("relative", stacked && "w-full")}>
        <Button
          variant="secondary"
          size={buttonSize}
          prefix={<CalendarIcon className="size-4 text-[var(--ds-gray-700)]" />}
          suffix={compact ? <ChevronDownIcon className="size-4 text-[var(--ds-gray-700)]" /> : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v)
            setPresetsOpen(false)
          }}
          className={cn(!label && "text-[var(--ds-gray-900)]", stacked && "w-full")}
        >
          {label ?? "Select Date Range"}
        </Button>

        {open && (
          <div
            role="dialog"
            aria-label="Select date range"
            className="absolute top-full left-0 z-50 mt-1 material-menu p-3"
          >
            <div className={cn("flex gap-4", horizontalLayout ? "flex-row items-start" : "flex-col")}>
              <CalendarGrid
                mode="range"
                selected={draft}
                onSelect={(r) => {
                  setDraft(r)
                  setPreset(null)
                }}
                disabled={min || max ? { before: min as Date, after: max as Date } : undefined}
                defaultMonth={draft?.from}
              />
              <div className="flex w-full min-w-56 flex-col gap-2">
                {(["Start", "End"] as const).map((edge) => {
                  const d = edge === "Start" ? draft?.from : draft?.to
                  return (
                    <div key={edge} className="flex flex-col gap-1">
                      <span className="text-[13px] text-[var(--ds-gray-900)]">{edge}</span>
                      <div className="flex gap-2">
                        <span className="flex h-8 flex-1 items-center rounded-md px-2.5 text-sm text-[var(--ds-gray-1000)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]">
                          {d ? fmtDayYear.format(d) : "—"}
                        </span>
                        <span className="flex h-8 items-center rounded-md px-2.5 text-sm text-[var(--ds-gray-1000)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]">
                          {edge === "Start" ? "12:00 AM" : "11:59 PM"}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <Button
                  size="sm"
                  disabled={!draft?.from}
                  onClick={() => {
                    commit(draft)
                    setOpen(false)
                  }}
                  className="mt-1 w-full"
                >
                  Apply
                </Button>
                {pinnedTimezone ? (
                  <span className="mt-1 text-[13px] text-[var(--ds-gray-900)]">{pinnedTimezone}</span>
                ) : (
                  <div className="mt-1 flex overflow-hidden rounded-md shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]" role="radiogroup" aria-label="Timezone">
                    {(["utc", "local"] as const).map((tz) => (
                      <button
                        key={tz}
                        type="button"
                        role="radio"
                        aria-checked={timezone === tz}
                        onClick={() => setTimezone(tz)}
                        className={cn(
                          "h-8 flex-1 cursor-pointer truncate px-2 text-[13px] transition-colors",
                          timezone === tz
                            ? "bg-[var(--ds-gray-100)] text-[var(--ds-gray-1000)]"
                            : "text-[var(--ds-gray-900)] hover:bg-[var(--ds-gray-alpha-100)]"
                        )}
                      >
                        {tz === "utc" ? "UTC" : `Local (${localTz})`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
