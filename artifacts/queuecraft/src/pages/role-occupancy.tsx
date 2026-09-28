import * as React from "react";
import {
  getGetOccupancyForecastQueryKey,
  useGetOccupancyForecast,
  useListRoles,
} from "@workspace/api-client-react";
import type {
  OccupancyForecastMember,
  OccupancyForecastMemberWeek,
  OccupancyForecastWeek,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { occupancyStyle } from "@/lib/occupancy";
import {
  FORECAST_CELL_WIDTH,
  ForecastCell,
  ForecastHeader,
  forecastRange,
  percent,
  weekKey,
  weekLabel,
} from "@/components/occupancy-forecast";

type WeekTotals = {
  occupied: number;
  free: number;
  usable: number;
  over: number;
  complete: boolean;
};

const LABEL_WIDTH = 218;

function aggregate(
  members: OccupancyForecastMember[],
  week: OccupancyForecastWeek,
): WeekTotals {
  const key = weekKey(week.startDate);
  const values = members.map((entry) =>
    entry.weeks.find((candidate) => weekKey(candidate.startDate) === key),
  );
  const occupied = values.reduce((sum, value) => sum + (value?.totalOccupancyPercent ?? 0), 0);
  const capacity = members.length * 100;
  return {
    occupied,
    free: capacity - occupied,
    usable: values.reduce((sum, value) => sum + Math.max(0, 100 - (value?.totalOccupancyPercent ?? 100)), 0),
    over: values.reduce((sum, value) => sum + Math.max(0, (value?.totalOccupancyPercent ?? 0) - 100), 0),
    complete: values.every(Boolean),
  };
}

function SummaryCell({
  week,
  totals,
  capacity,
  mode,
}: {
  week: OccupancyForecastWeek;
  totals: WeekTotals;
  capacity: number;
  mode: "occupied" | "free" | "usable";
}) {
  const value = mode === "occupied" ? totals.occupied : mode === "free" ? totals.free : totals.usable;
  const title = `${weekLabel(week)}\nTeam capacity: ${percent(capacity)}\nOccupied (additive): ${percent(totals.occupied)}\nFree (capacity − occupied): ${percent(totals.free)}\nUsable per-person availability: ${percent(totals.usable)}\nIndividual overcommitment: ${percent(totals.over)}${!totals.complete ? "\nIncomplete forecast: at least one member week is missing" : ""}`;
  return (
    <div
      className={`flex h-12 shrink-0 items-center justify-center border-r px-1 text-center font-mono text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${!totals.complete ? "ring-1 ring-inset ring-amber-600" : ""}`}
      style={{
        width: FORECAST_CELL_WIDTH,
        ...(mode === "occupied"
          ? occupancyStyle(capacity ? (totals.occupied / capacity) * 100 : 0)
          : mode === "free" && totals.free < 0
            ? occupancyStyle(110)
            : {}),
      }}
      title={title}
      aria-label={`${mode}: ${title.replaceAll("\n", ". ")}`}
      tabIndex={0}
      data-testid={`text-team-${mode}-${weekKey(week.startDate)}`}
    >
      {totals.complete ? <>{mode === "free" && value > 0 ? "+" : ""}{percent(value)}</> : "—"}
    </div>
  );
}

export function RoleOccupancy() {
  const [roleId, setRoleId] = React.useState("");
  const params = React.useMemo(forecastRange, []);
  const {
    data: roles,
    isLoading: rolesLoading,
    isError: rolesError,
    refetch: retryRoles,
  } = useListRoles();
  const {
    data: forecast,
    isLoading: forecastLoading,
    isError: forecastError,
    refetch: retryForecast,
  } = useGetOccupancyForecast(params, {
    query: { queryKey: getGetOccupancyForecastQueryKey(params) },
  });
  const sortedRoles = React.useMemo(
    () => [...(roles ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
  );
  const selectedRole = sortedRoles.find((role) => role.id === roleId) ?? sortedRoles[0];
  const memberIds = React.useMemo(
    () => new Set(
      selectedRole
        ? [selectedRole.lead.id, selectedRole.deputy?.id, ...(selectedRole.memberIds ?? [])]
            .filter((id): id is string => Boolean(id))
        : [],
    ),
    [selectedRole],
  );
  const members = React.useMemo(
    () => (forecast?.members ?? [])
      .filter((entry) => memberIds.has(entry.member.id) && entry.member.status === "active")
      .sort((a, b) => a.member.name.localeCompare(b.member.name)),
    [forecast, memberIds],
  );
  const weeks = forecast?.weeks ?? [];
  const capacity = members.length * 100;
  const totals = React.useMemo(
    () => weeks.map((week) => aggregate(members, week)),
    [members, weeks],
  );
  const overloadedWeeks = totals.filter((week) => week.occupied > capacity || week.over > 0).length;
  const gridWidth = LABEL_WIDTH + weeks.length * FORECAST_CELL_WIDTH;

  return (
    <div className="min-h-full space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/occupancy" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" data-testid="link-occupancy-overview">
            <ArrowLeft className="h-4 w-4" /> Occupancy overview
          </Link>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Capacity Planning / 06-month outlook</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Role capacity</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See the people behind a role. Each person’s full workload includes commitments from every role—not just this one.
          </p>
        </div>
        <label className="flex min-w-[220px] flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Role to plan
          <select
            className="h-10 rounded-sm border bg-background px-3 text-sm font-medium normal-case tracking-normal text-foreground"
            value={selectedRole?.id ?? ""}
            onChange={(event) => setRoleId(event.target.value)}
            aria-label="Select role"
            data-testid="select-role-occupancy"
          >
            {sortedRoles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </label>
      </header>

      {rolesLoading || forecastLoading ? (
        <div className="space-y-4" aria-label="Loading role capacity">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : rolesError || forecastError ? (
        <div role="alert" className="rounded-sm border border-destructive/40 bg-destructive/5 p-6">
          <h2 className="font-semibold">Capacity could not be loaded</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection, then try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => { if (rolesError) void retryRoles(); if (forecastError) void retryForecast(); }} data-testid="button-retry-role-capacity">Retry</Button>
        </div>
      ) : !sortedRoles.length ? (
        <div className="rounded-sm border border-dashed p-10 text-center">
          <Users className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <h2 className="font-semibold">No roles configured</h2>
          <p className="mt-1 text-sm text-muted-foreground">Roles need a lead and members before capacity can be planned.</p>
        </div>
      ) : !selectedRole ? (
        <div className="rounded-sm border border-dashed bg-muted/20 p-10 text-center">
          <Users className="mx-auto mb-3 h-7 w-7 text-primary" />
          <h2 className="font-semibold">Choose a role to inspect its capacity</h2>
          <p className="mt-1 text-sm text-muted-foreground">The timeline will show all active people in that role, counted once each.</p>
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-sm border border-dashed p-10 text-center">
          <h2 className="font-semibold">No active people returned for {selectedRole.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">The lead, deputy and assigned members are included only when active in the forecast.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-sm border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Selected team</p>
              <h2 className="mt-1 text-xl font-semibold">{selectedRole.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {members.length} active {members.length === 1 ? "person" : "people"} · {percent(capacity)} weekly team capacity · {weeks.length} weeks
              </p>
            </div>
            {overloadedWeeks > 0 && (
              <div className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{overloadedWeeks} {overloadedWeeks === 1 ? "week has" : "weeks have"} individual or team overcommitment</span>
              </div>
            )}
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p><strong className="text-foreground">Occupied</strong> adds every person’s global weekly occupancy. <strong className="text-foreground">Free</strong> is team capacity minus that additive total and can be negative.</p>
            <p><strong className="text-foreground">Usable availability</strong> adds each person’s remaining capacity, floored at zero; it is not interchangeable with free when someone is overallocated. Hover a cell for exact dates and figures.</p>
          </div>

          {weeks.length ? (
            <div className="max-w-full overflow-x-auto rounded-sm border bg-card shadow-sm" tabIndex={0} role="region" aria-label="Scrollable six-month role capacity timeline">
              <div style={{ width: gridWidth }}>
                <div className="flex">
                  <div className="sticky left-0 z-20 flex shrink-0 items-end border-r border-b bg-muted px-4 pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: LABEL_WIDTH }}>
                    Week commencing
                  </div>
                  <div className="min-w-0"><ForecastHeader weeks={weeks} /></div>
                </div>
                {(["occupied", "free", "usable"] as const).map((mode) => (
                  <div key={mode} className="flex border-b">
                    <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r bg-card px-4" style={{ width: LABEL_WIDTH }}>
                      <span className="text-sm font-semibold capitalize">{mode === "usable" ? "Usable availability" : mode}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{mode === "occupied" ? "SUM OF ALL LOADS" : mode === "free" ? "CAPACITY − LOAD" : "PER-PERSON REMAINDER"}</span>
                    </div>
                    {weeks.map((week, index) => (
                      <SummaryCell key={weekKey(week.startDate)} week={week} totals={totals[index]} capacity={capacity} mode={mode} />
                    ))}
                  </div>
                ))}
                <div className="sticky left-0 z-10 border-b bg-muted/50 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Individual load · includes commitments across all roles
                </div>
                {members.map((entry) => {
                  const memberWeeks = new Map<string, OccupancyForecastMemberWeek>(
                    entry.weeks.map((week) => [weekKey(week.startDate), week]),
                  );
                  return (
                    <div className="flex border-b last:border-b-0" key={entry.member.id} data-testid={`row-member-${entry.member.id}`}>
                      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-card px-3 py-2" style={{ width: LABEL_WIDTH }}>
                        <Avatar className="h-7 w-7 border"><AvatarFallback className="text-[10px]">{entry.member.initials}</AvatarFallback></Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium" title={entry.member.name}>{entry.member.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {entry.member.id === selectedRole.lead.id ? "Role lead" : entry.member.id === selectedRole.deputy?.id ? "Deputy" : entry.member.title || "Member"}
                          </div>
                        </div>
                      </div>
                      {weeks.map((week) => (
                        <ForecastCell
                          key={weekKey(week.startDate)}
                          label={entry.member.name}
                           memberId={entry.member.id}
                          week={memberWeeks.get(weekKey(week.startDate))}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-dashed p-8 text-center text-sm text-muted-foreground">No forecast weeks returned for this period.</div>
          )}
          <p className="text-xs text-muted-foreground">Forecast from {params.startDate} through {params.endDate}. Weeks that cross the requested dates are shown in full. Month headings follow each week’s Monday.</p>
        </>
      )}
    </div>
  );
}