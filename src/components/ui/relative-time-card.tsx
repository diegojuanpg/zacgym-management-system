"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Verbose duration like Vercel's card header: "1 minute, 18 seconds ago".
function verbose(ms: number, now: number) {
  let s = Math.floor((now - ms) / 1000)
  const future = s < 0
  s = Math.abs(s)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const u = (n: number, label: string) => `${n} ${label}${n === 1 ? "" : "s"}`
  let str: string
  if (d > 0) str = `${u(d, "day")}, ${u(h, "hour")}`
  else if (h > 0) str = `${u(h, "hour")}, ${u(m, "minute")}`
  else if (m > 0) str = `${u(m, "minute")}, ${u(sec, "second")}`
  else str = u(sec, "second")
  return future ? `in ${str}` : `${str} ago`
}

const fmtDate = (d: Date, timeZone?: string) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone })
const fmtTime = (d: Date, timeZone?: string) =>
  d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone })

function localOffsetLabel(d: Date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")
  return part?.value ?? "Local"
}

function Row({ badge, date, time }: { badge: string; date: string; time: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <div className="flex h-4 items-center justify-center rounded-[2px] bg-[var(--ds-gray-200)] px-1.5">
          <span className="font-mono text-[12px] text-[var(--ds-gray-900)]">{badge}</span>
        </div>
        <span className="text-[13px] text-[var(--ds-gray-1000)]">{date}</span>
      </div>
      <span className="font-mono text-[12px] tabular-nums text-[var(--ds-gray-900)]">{time}</span>
    </div>
  )
}

export interface RelativeTimeCardProps {
  date: Date | string | number
  side?: "top" | "bottom"
  className?: string
  children: React.ReactNode
}

export function RelativeTimeCard({ date, side = "top", className, children }: RelativeTimeCardProps) {
  const [open, setOpen] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const ms = React.useMemo(() => new Date(date).getTime(), [date])

  // Keep the relative header live while the card is open.
  React.useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  const d = new Date(ms)
  const local = localOffsetLabel(d)

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          className={cn(
            "material-medium absolute left-1/2 z-50 -translate-x-1/2 rounded-[6px] border border-[var(--ds-gray-400)] bg-[var(--ds-background-100)] bg-clip-padding p-3",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          <div className="flex min-w-[300px] flex-col gap-3">
            <span className="text-[13px] tabular-nums text-[var(--ds-gray-900)]">{verbose(ms, now)}</span>
            <div className="flex flex-col gap-2">
              <Row badge="UTC" date={fmtDate(d, "UTC")} time={fmtTime(d, "UTC")} />
              <Row badge={local} date={fmtDate(d)} time={fmtTime(d)} />
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
