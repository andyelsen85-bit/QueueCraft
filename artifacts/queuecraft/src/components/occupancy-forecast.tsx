import { addMonths, format, parseISO } from "date-fns";
import type {
  OccupancyForecastMemberWeek,
  OccupancyForecastWeek,
} from "@workspace/api-client-react";
import { occupancyStyle } from "@/lib/occupancy";

export const calendarDate = (value: string) => parseISO(value.slice(0, 10));
export const weekKey = (value: string) => value.slice(0, 10);
export const percent = (value: number) =>
  `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

export function forecastRange(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return {
    startDate: format(monday, "yyyy-MM-dd"),
    endDate: format(addMonths(now, 6), "yyyy-MM-dd"),
  };
}

export function weekLabel(week: OccupancyForecastWeek) {
  return `${format(calendarDate(week.startDate), "d MMM yyyy")} – ${format(calendarDate(week.endDate), "d MMM yyyy")}`;
}

export const FORECAST_CELL_WIDTH = 68;

export function ForecastHeader({ weeks }: { weeks: OccupancyForecastWeek[] }) {
  const groups = weeks.reduce<{ key: string; label: string; count: number }[]>(
    (result, week) => {
      const start = calendarDate(week.startDate);
      const key = format(start, "yyyy-MM");
      const last = result[result.length - 1];
      if (last?.key === key) last.count += 1;
      else result.push({ key, label: format(start, "MMMM yyyy"), count: 1 });
      return result;
    },
    [],
  );

  return (
    <div>
      <div className="flex border-b bg-muted/50">
        {groups.map((group) => (
          <div
            key={group.key}
           className="shrink-0 truncate border-r px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ width: group.count * FORECAST_CELL_WIDTH }}
           title={group.label}
          >
           {group.count < 3 ? format(calendarDate(`${group.key}-01`), "MMM yy") : group.label}
          </div>
        ))}
      </div>
      <div className="flex border-b bg-muted/20">
        {weeks.map((week) => (
          <div
            key={weekKey(week.startDate)}
            className="shrink-0 border-r px-1 py-2 text-center font-mono text-[11px] text-muted-foreground"
            style={{ width: FORECAST_CELL_WIDTH }}
            title={weekLabel(week)}
          >
            {format(calendarDate(week.startDate), "d MMM")}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForecastCell({
  week,
  label,
  memberId,
}: {
  week?: OccupancyForecastMemberWeek;
  label: string;
  memberId: string;
}) {
  if (!week) {
    return (
      <div
        className="flex h-11 shrink-0 items-center justify-center border-r bg-muted/20 text-xs text-muted-foreground"
        style={{ width: FORECAST_CELL_WIDTH }}
        title={`${label}: no forecast returned for this week`}
      >
        —
      </div>
    );
  }
  const detail = `${label} · ${weekLabel(week)}\nDaily business: ${percent(week.dailyBusinessPercent)}\nMilestones: ${percent(week.milestoneAllocationPercent)}\nTotal occupied: ${percent(week.totalOccupancyPercent)}\nAvailable: ${percent(week.availablePercent)}${week.overAllocated ? "\nOverallocated" : ""}`;
  return (
    <div
      className="flex h-11 shrink-0 items-center justify-center border-r text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      style={{ width: FORECAST_CELL_WIDTH, ...occupancyStyle(week.totalOccupancyPercent) }}
      title={detail}
      aria-label={detail.replaceAll("\n", ". ")}
      tabIndex={0}
      data-testid={`forecast-cell-${memberId}-${weekKey(week.startDate)}`}
    >
      {percent(week.totalOccupancyPercent)}
    </div>
  );
}

export function MemberForecast({
  name,
  memberId,
  weeks,
  memberWeeks,
}: {
  name: string;
  memberId: string;
  weeks: OccupancyForecastWeek[];
  memberWeeks: OccupancyForecastMemberWeek[];
}) {
  const byStart = new Map(memberWeeks.map((week) => [weekKey(week.startDate), week]));
  return (
    <section className="border-t bg-background px-4 py-4" aria-label={`${name} six-month forecast`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Six-month weekly forecast</h3>
          <p className="text-xs text-muted-foreground">
            Total commitments across every role · hover or focus a week for its breakdown
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {weeks.length} weeks
        </span>
      </div>
      {weeks.length ? (
        <div className="max-w-full overflow-x-auto rounded-sm border" tabIndex={0} role="region" aria-label={`Scrollable weekly occupancy for ${name}`}>
          <div style={{ width: weeks.length * FORECAST_CELL_WIDTH }}>
            <ForecastHeader weeks={weeks} />
            <div className="flex">
              {weeks.map((week) => (
                <ForecastCell
                  key={weekKey(week.startDate)}
                  label={name}
                  memberId={memberId}
                  week={byStart.get(weekKey(week.startDate))}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-sm border border-dashed p-4 text-sm text-muted-foreground">No forecast weeks returned for this period.</p>
      )}
    </section>
  );
}