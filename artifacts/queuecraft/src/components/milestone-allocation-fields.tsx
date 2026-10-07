import { Input } from "@/components/ui/input";
import { milestoneHoursLabel, milestoneWorkingDays, formatHours } from "@/lib/contract-hours";
import { useGetOccupancyAvailability, getGetOccupancyAvailabilityQueryKey, type MemberAvailability } from "@workspace/api-client-react";
import { displayDateToIso, formatDate } from "@/lib/dates";
import { proposedCapacity } from "@/lib/milestone-capacity";

type Participant = { id: string; name: string; weeklyHours?: number | null };

function CapacityDetails({ availability, percent }: { availability: MemberAvailability; percent: number }) {
  const proposed = proposedCapacity(availability, percent);
  if (availability.minimumAvailablePercent == null) {
    return <p className="text-xs text-muted-foreground">No working days in the selected period.</p>;
  }
  const overbooked = (proposed.minimumAvailablePercent ?? 0) < 0;
  const hours = (value: number) => availability.weeklyHours == null ? ""
    : ` (${formatHours(availability.weeklyHours * value / 100)} h/week)`;
  return (
    <div className="mt-2 space-y-1 text-xs" aria-live="polite">
      <p className="text-muted-foreground">
        BAU: {availability.dailyBusinessPercent}% · Existing milestones at busiest point:{" "}
        {formatHours(100 - availability.dailyBusinessPercent - availability.minimumAvailablePercent)}%
      </p>
      <p className={availability.minimumAvailablePercent < 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>
        Free before: {formatHours(availability.minimumAvailablePercent)}%{hours(availability.minimumAvailablePercent)}
      </p>
      <p className={overbooked ? "font-semibold text-red-600 dark:text-red-400" : "font-medium"}>
        Free after: {formatHours(proposed.minimumAvailablePercent!)}%{hours(proposed.minimumAvailablePercent!)}
      </p>
      {proposed.availableHours != null
        ? <p className={proposed.availableHours < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
            Free hours over the whole period: {formatHours(availability.availableHours!)} h before →{" "}
            {formatHours(proposed.availableHours)} h after.
          </p>
        : <p className="text-muted-foreground">Weekly contract unset — availability shown in percentages only.</p>}
      {overbooked && (
        <details className="rounded-sm border border-red-200 bg-red-50 p-2 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <summary className="cursor-pointer font-medium">
            Overbooked on {proposed.overbookedPeriods.reduce((sum, period) => sum + period.workingDays, 0)} working days — saving allowed; view dates
          </summary>
          <ul className="mt-1 space-y-1">
            {proposed.overbookedPeriods.map((period) => (
              <li key={period.startDate}>
                {formatDate(period.startDate)} – {formatDate(period.endDate)}:{" "}
                {formatHours(period.availablePercent)}% free{hours(period.availablePercent)}
              </li>
            ))}
          </ul>
          <p className="mt-2">Saving is allowed. Projects take priority; BAU may not be fully covered. BAU allocations will not be changed.</p>
        </details>
      )}
    </div>
  );
}

export function MilestoneAllocationFields({
  participants,
  values,
  onChange,
  deferredUntilValidation = false,
  beginDate,
  targetDate,
  excludeMilestoneId,
}: {
  participants: Participant[];
  values: Record<string, number>;
  onChange: (memberId: string, value: number) => void;
  deferredUntilValidation?: boolean;
  beginDate?: string | null;
  targetDate?: string | null;
  excludeMilestoneId?: string;
}) {
  const normalize = (value?: string | null) => value
    ? (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : displayDateToIso(value)) : null;
  const startDate = normalize(beginDate);
  const endDate = normalize(targetDate);
  const validDates = !!startDate && !!endDate && milestoneWorkingDays(startDate, endDate) != null;
  const params = { startDate: startDate ?? "", endDate: endDate ?? "", excludeMilestoneId };
  const availability = useGetOccupancyAvailability(
    params,
    { query: { queryKey: getGetOccupancyAvailabilityQueryKey(params),
      enabled: validDates && participants.length > 0, staleTime: 0, refetchInterval: 30000 } },
  );
  const byMember = new Map(availability.data?.map((row) => [row.memberId, row]));
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Occupancy by person</div>
      <p className="text-xs text-muted-foreground">
        {deferredUntilValidation
          ? "These percentages are planned. They will count during this milestone’s dates only after the topic is validated."
          : "Each percentage applies during this milestone’s dates."} Leave 0 for anyone not working on it.
      </p>
      <p className="text-xs text-muted-foreground">
        Estimated hours use Monday–Friday, including both dates; public holidays are not excluded.
        {milestoneWorkingDays(beginDate, targetDate) !== null && ` ${milestoneWorkingDays(beginDate, targetDate)} working days.`}
      </p>
      <p className="text-xs text-muted-foreground">
        Free percentages show the busiest point, not an average. Whole-period hours account for changing overlaps.
        Existing load follows occupancy rules: topics awaiting validation or a prerequisite are not counted.
      </p>
      {!validDates && <p className="text-xs text-muted-foreground">Enter valid start and end dates to see live availability.</p>}
      {validDates && availability.isFetching && !availability.data && (
        <p role="status" className="text-xs text-muted-foreground">Loading member availability…</p>
      )}
      {validDates && availability.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not refresh availability. Capacity is unknown; saving is still allowed.{" "}
          <button type="button" className="underline" onClick={() => availability.refetch()}>Retry</button>
        </p>
      )}
      {participants.length === 0 ? (
        <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
          Add a primary assignee or topic collaborator to allocate occupancy.
        </p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {participants.map((member) => {
            const contract = byMember.has(member.id) ? byMember.get(member.id)!.weeklyHours : member.weeklyHours;
            return (
            <div key={member.id} className="flex items-start justify-between gap-3 rounded-sm border p-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={`milestone-allocation-${member.id}`} className="block break-words text-sm">
                  {member.name}
                  {contract != null && <span className="ml-1 text-xs text-muted-foreground">({formatHours(contract)} h/week contract)</span>}
                </label>
                <p className="text-xs text-muted-foreground" aria-live="polite" data-testid={`milestone-hours-${member.id}`}>
                  {milestoneHoursLabel(contract, values[member.id] ?? 0, beginDate, targetDate)}
                </p>
                {validDates && !availability.isError && byMember.get(member.id) && (
                  <div data-testid={`milestone-capacity-${member.id}`}>
                    <CapacityDetails availability={byMember.get(member.id)!} percent={values[member.id] ?? 0} />
                  </div>
                )}
                {validDates && !availability.isError && availability.data && !byMember.has(member.id) && (
                  <p className="text-xs text-muted-foreground">Availability unavailable for this member.</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Input
                  id={`milestone-allocation-${member.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="w-20"
                  value={values[member.id] ?? 0}
                  onChange={(event) => onChange(member.id, Number(event.target.value))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}