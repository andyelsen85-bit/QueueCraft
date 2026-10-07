import * as React from "react"
import { addDays, differenceInCalendarDays, format, isAfter, isBefore } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useUpdateMilestone, useUpdateTopic, usePreviewScheduleImpact, type ScheduleImpact } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

const DAY_WIDTH = 28
type Handle = "start" | "end"
type Range = { start: Date; end: Date }
export const isoDay = (d: Date) => format(d, "yyyy-MM-dd")

export function DateHandles({
  range, rangeStart, rangeEnd, label, onCommit, startUnset = false, endUnset = false,
}: {
  range: Range; rangeStart: Date; rangeEnd: Date; label: string
  startUnset?: boolean; endUnset?: boolean
  onCommit: (start: Date, end: Date, handle: Handle) => void
}) {
  const [preview, setPreview] = React.useState<Range | null>(null)
  const previewRef = React.useRef<Range | null>(null)
  const drag = React.useRef<{
    handle: Handle; x0: number; id: number; scroll: HTMLElement | null;
    scrollLeft: number; lastX: number; inset: number;
  } | null>(null)
  const frame = React.useRef<number | null>(null)
  const keyDelta = React.useRef(0)
  const keyHandle = React.useRef<Handle | null>(null)
  const rangeRef = React.useRef(range)
  rangeRef.current = range

  const compute = (handle: Handle, delta: number): Range => {
    const r = rangeRef.current
    if (handle === "start") {
      const s = addDays(r.start, delta)
      if (endUnset) return { start: s, end: s }
      return { start: isAfter(s, r.end) ? r.end : s, end: r.end }
    }
    const e = addDays(r.end, delta)
    if (startUnset) return { start: e, end: e }
    return { start: r.start, end: isBefore(e, r.start) ? r.start : e }
  }
  const show = (p: Range | null) => { previewRef.current = p; setPreview(p) }
  const cancel = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    drag.current = null; keyDelta.current = 0; keyHandle.current = null; previewRef.current = null; setPreview(null)
  }, [])
  React.useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  React.useEffect(() => {
    window.addEventListener("blur", cancel)
    return () => window.removeEventListener("blur", cancel)
  }, [cancel])
  const commit = () => {
    const p = previewRef.current
    const r = rangeRef.current
    const handle = drag.current?.handle ?? keyHandle.current
    cancel()
    if (p && (differenceInCalendarDays(p.start, r.start) !== 0 || differenceInCalendarDays(p.end, r.end) !== 0)) {
      if (handle) onCommit(p.start, p.end, handle)
    }
  }
  React.useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, cancel]);

  const startVisible = !isBefore(range.start, rangeStart)
  const endVisible = !isAfter(range.end, rangeEnd)
  const clampStart = isBefore(range.start, rangeStart) ? rangeStart : range.start
  const clampEnd = isAfter(range.end, rangeEnd) ? rangeEnd : range.end
  const startIdx = differenceInCalendarDays(clampStart, rangeStart)
  const endIdx = differenceInCalendarDays(clampEnd, rangeStart)
  const oneDay = differenceInCalendarDays(range.end, range.start) === 0

  const renderHandle = (handle: Handle) => {
    const name = handle === "start" ? "start" : "end"
    const left = handle === "start"
      ? startIdx * DAY_WIDTH - 7
      : (endIdx + 1) * DAY_WIDTH - 7
    return (
      <button
        key={handle} type="button" data-testid={`handle-${name}`}
        aria-label={`Change ${name} date of ${label}. Use left and right arrows, Enter to review, Escape to cancel.`}
        title={`Drag to change ${name} date`}
        className="absolute z-[12] top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-sm hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-ew-resize"
        style={{ left }}
        onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          const scroll = event.currentTarget.closest<HTMLElement>("[data-calendar-scroll]")
          const inset = (event.currentTarget.parentElement?.previousElementSibling as HTMLElement | null)?.clientWidth ?? 0
          drag.current = { handle, x0: event.clientX, id: event.pointerId, scroll,
            scrollLeft: scroll?.scrollLeft ?? 0, lastX: event.clientX, inset }
          show({ ...rangeRef.current })
          const tick = () => {
            const d = drag.current
            if (!d) return
            if (d.scroll) {
              const rect = d.scroll.getBoundingClientRect()
              const direction = d.lastX > rect.right - 30 ? 1 : d.lastX < rect.left + d.inset + 20 ? -1 : 0
              if (direction) d.scroll.scrollLeft += direction * 12
              show(compute(d.handle, Math.round((d.lastX - d.x0 + d.scroll.scrollLeft - d.scrollLeft) / DAY_WIDTH)))
            }
            frame.current = requestAnimationFrame(tick)
          }
          frame.current = requestAnimationFrame(tick)
        }}
        onPointerMove={(event) => {
          const d = drag.current
          if (!d || d.id !== event.pointerId) return;
          d.lastX = event.clientX
          show(compute(d.handle, Math.round((event.clientX - d.x0 + (d.scroll?.scrollLeft ?? 0) - d.scrollLeft) / DAY_WIDTH)))
        }}
        onPointerUp={(event) => {
          const d = drag.current
          if (!d || d.id !== event.pointerId) return;
          event.stopPropagation()
          commit()
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => { if (drag.current) cancel() }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); event.stopPropagation()
            keyDelta.current += event.key === "ArrowLeft" ? -1 : 1
            keyHandle.current = handle
            show(compute(handle, keyDelta.current))
          } else if (event.key === "Enter" || event.key === " ") {
            if (previewRef.current) { event.preventDefault(); commit() }
          } else if (event.key === "Escape") {
            if (previewRef.current) { event.preventDefault(); event.stopPropagation(); cancel() }
          }
        }}
        onBlur={() => { if (!drag.current) cancel() }}
      >
        {oneDay && (handle === "start" ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
      </button>
    )
  }

  const pStartIdx = preview ? differenceInCalendarDays(isBefore(preview.start, rangeStart) ? rangeStart : preview.start, rangeStart) : 0
  const pEndIdx = preview ? differenceInCalendarDays(isAfter(preview.end, rangeEnd) ? rangeEnd : preview.end, rangeStart) : 0

  return (
    <>
      {startVisible && renderHandle("start")}
      {endVisible && renderHandle("end")}
      {preview && (
        <div className="pointer-events-none absolute top-1 bottom-1 z-[15] rounded-md border-2 border-dashed border-primary bg-primary/15"
          style={{ left: pStartIdx * DAY_WIDTH, width: (pEndIdx - pStartIdx + 1) * DAY_WIDTH }}>
          <span className="absolute -top-1 left-0 -translate-y-full whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] font-semibold text-popover-foreground shadow"
            role="status">
            {format(preview.start, "MMM d, yyyy")} - {format(preview.end, "MMM d, yyyy")}
          </span>
        </div>
      )}
    </>
  )
}

export type EditRequest = {
  kind: "topic" | "milestone"
  id: string
  topicId: string
  title: string
  rawStart: string | null
  rawFinish: string | null
  start: string
  finish: string
  latestMilestoneTarget: string | null
  committedFinish: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function errInfo(error: unknown): { status?: number; data?: Record<string, unknown>; message: string } {
  const e = error as { status?: number; data?: unknown; message?: string } | null
  const data = e && typeof e.data === "object" && e.data ? e.data as Record<string, unknown> : undefined
  const message = (data && typeof data.error === "string" && data.error) || e?.message || "Could not save the new dates."
  return { status: e?.status, data, message }
}

function EditForm({ edit, onClose, onSaving }: { edit: EditRequest; onClose: () => void; onSaving: (saving: boolean) => void }) {
  const queryClient = useQueryClient()
  const updateTopic = useUpdateTopic()
  const updateMilestone = useUpdateMilestone()
  const previewSchedule = usePreviewScheduleImpact()
  const [impact, setImpact] = React.useState<ScheduleImpact | null>(null)
  const [reviewedOptions, setReviewedOptions] = React.useState<{ extend?: boolean; finishValue?: string; skipTopicCheck?: boolean }>({})
  const [start, setStart] = React.useState(edit.start)
  const [finish, setFinish] = React.useState(edit.finish)
  const [error, setError] = React.useState<string | null>(null)
  const [decision, setDecision] = React.useState<
    { kind: "milestone"; suggested: string } | { kind: "topic"; latest: string } | null>(null)
  const [pending, setPending] = React.useState(false)
  const busy = React.useRef(false)

  const submit = async (opts: { extend?: boolean; finishValue?: string; skipTopicCheck?: boolean } = {}, save = false) => {
    if (busy.current) return;
    const s = start.trim()
    const f = (opts.finishValue ?? finish).trim()
    if ((edit.rawStart && !s) || (edit.rawFinish && !f)) {
      setError("Existing dates cannot be removed here. Choose a date, or use the topic details to clear it."); return
    }
    if ((s && !DATE_RE.test(s)) || (f && !DATE_RE.test(f))) { setError("Enter dates as valid calendar dates."); return }
    if (s && f && s > f) { setError("The start date must be on or before the finish date."); return }
    const body: { startVal?: string; finishVal?: string } = {}
    if (s && s !== (edit.rawStart?.slice(0, 10) ?? "")) body.startVal = s
    if (f && f !== (edit.rawFinish?.slice(0, 10) ?? "")) body.finishVal = f
    if (body.startVal === undefined && body.finishVal === undefined) {
      if (opts.finishValue !== undefined) { onClose(); return }
      setError("No date has changed."); return
    }
    if (edit.kind === "topic" && !opts.skipTopicCheck && body.finishVal && edit.latestMilestoneTarget &&
      edit.latestMilestoneTarget > body.finishVal) {
      setError(null); setDecision({ kind: "topic", latest: edit.latestMilestoneTarget }); return
    }
    busy.current = true; setPending(true); onSaving(true); setError(null)
    try {
      if (!save) {
        setImpact(null)
        const result = await previewSchedule.mutateAsync({ data: {
          kind: edit.kind, id: edit.id,
          ...(body.startVal !== undefined ? { startDate: body.startVal } : {}),
          ...(body.finishVal !== undefined ? { finishDate: body.finishVal } : {}),
          ...(opts.extend !== undefined ? { extendTopicEstimatedFinish: opts.extend } : {}),
        } })
        if (result.requiresFinishDecision && result.suggestedFinishDate) {
          setDecision({ kind: "milestone", suggested: result.suggestedFinishDate })
        } else {
          setDecision(null); setReviewedOptions(opts); setImpact(result)
        }
        return
      }
      if (edit.kind === "topic") {
        await updateTopic.mutateAsync({ topicId: edit.id, data: {
          ...(body.startVal !== undefined ? { estimatedStartDate: body.startVal } : {}),
          ...(body.finishVal !== undefined ? { estimatedFinishDate: body.finishVal } : {}),
        } })
      } else {
        await updateMilestone.mutateAsync({ milestoneId: edit.id, data: {
          ...(body.startVal !== undefined ? { beginDate: body.startVal } : {}),
          ...(body.finishVal !== undefined ? { targetDate: body.finishVal } : {}),
          ...(opts.extend !== undefined ? { extendTopicEstimatedFinish: opts.extend } : {}),
        } })
      }
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[0] ?? "")
          return key.startsWith("/api/calendar") || key.startsWith("/api/topics") ||
            key.startsWith("/api/occupancy") || key.startsWith("/api/dashboard") || key.startsWith("/api/my-work") ||
            key.startsWith("/api/directory")
        },
      })
      onClose()
    } catch (err) {
      setImpact(null)
      const info = errInfo(err)
      if (edit.kind === "milestone" && info.status === 409 && info.data?.requiresFinishDecision === true &&
        typeof info.data.suggestedFinishDate === "string") {
        setDecision({ kind: "milestone", suggested: info.data.suggestedFinishDate })
      } else {
        setError(info.message)
      }
    } finally {
      busy.current = false; setPending(false); onSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{edit.kind === "topic" ? "Change planned dates" : "Change milestone dates"}</DialogTitle>
        <DialogDescription>
          {edit.title}.{" "}
          {edit.kind === "topic"
            ? `Only the planned estimate dates change.${edit.committedFinish ? ` The committed finish date (${edit.committedFinish}) stays unchanged.` : " The committed finish date stays unchanged."}`
            : "Review the dates before saving."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {edit.kind === "topic" ? "Estimated start" : "Begin date"}
          <Input type="date" value={start} disabled={pending || !!decision} onChange={(e) => { setStart(e.target.value); setImpact(null) }} data-testid="input-edit-start" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {edit.kind === "topic" ? "Estimated finish" : "Target date"}
          <Input type="date" value={finish} disabled={pending || !!decision} onChange={(e) => { setFinish(e.target.value); setImpact(null) }} data-testid="input-edit-finish" />
        </label>
      </div>
      {decision?.kind === "topic" && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" role="alert">
          <p>This finish is before the latest milestone target ({decision.latest}). Choose how to proceed.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void submit({ skipTopicCheck: true })}>Keep shortened estimate</Button>
            <Button size="sm" disabled={pending} onClick={() => { setFinish(decision.latest); setDecision(null); void submit({ finishValue: decision.latest, skipTopicCheck: true }) }}>
              Use latest target ({decision.latest})
            </Button>
          </div>
        </div>
      )}
      {decision?.kind === "milestone" && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" role="alert">
          <p>This target is after the topic's estimated finish. The suggested topic finish is {decision.suggested}.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => void submit({ extend: true })}>Extend topic to {decision.suggested}</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void submit({ extend: false })}>Keep estimate</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert" data-testid="text-edit-error">{error}</p>}
      {impact && (
        <section className="space-y-2" aria-label="Schedule impact" data-testid="schedule-impact-preview">
          <h3 className="text-sm font-semibold">Schedule impact · {impact.changes.length} changed item{impact.changes.length === 1 ? "" : "s"}</h3>
          <p className="text-xs text-muted-foreground">Nothing has been saved. Dependencies and permissions will be checked again when saving.</p>
          {reviewedOptions.extend !== undefined && <p className="text-xs font-medium">
            {reviewedOptions.extend ? "Extend topic estimate" : "Keep topic estimate unchanged"}
          </p>}
          {impact.changes.length === 0 ? <p className="text-sm">No scheduled dates will move.</p> : (
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-2">Item</th><th className="p-2">Original dates</th><th className="p-2">Projected dates</th>
                </tr></thead>
                <tbody>{impact.changes.map((change) => (
                  <tr key={`${change.kind}-${change.id}`} className="border-t">
                    <td className="p-2"><span className="font-medium">{change.title}</span>
                      <div className="text-muted-foreground">{change.kind === "topic" ? "Topic" : `Milestone · ${change.topicTitle}`}</div>
                    </td>
                    <td className="p-2">{change.originalStart?.slice(0, 10) ?? "Not set"}<br />{change.originalFinish?.slice(0, 10) ?? "Not set"}</td>
                    <td className="p-2">{change.projectedStart?.slice(0, 10) ?? "Not set"}<br />{change.projectedFinish?.slice(0, 10) ?? "Not set"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Dates show start / finish (begin / target for milestones). Unchanged items are omitted.</p>
        </section>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        {impact && <Button variant="outline" disabled={pending} onClick={() => { setImpact(null); setDecision(null) }}>Back to dates</Button>}
        <Button onClick={() => void submit(impact ? reviewedOptions : {}, !!impact)} disabled={pending || !!decision} data-testid="button-save-dates">
          {pending ? (impact ? "Saving..." : "Checking...") : impact ? "Save dates" : "Review impact"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function DateEditDialog({ edit, onClose }: { edit: EditRequest | null; onClose: () => void }) {
  const [saving, setSaving] = React.useState(false)
  return (
    <Dialog open={!!edit} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}
        onInteractOutside={(event) => { if (saving) event.preventDefault() }}>
        {edit && <EditForm key={`${edit.kind}-${edit.id}-${edit.start}-${edit.finish}`} edit={edit} onClose={onClose} onSaving={setSaving} />}
      </DialogContent>
    </Dialog>
  )
}
