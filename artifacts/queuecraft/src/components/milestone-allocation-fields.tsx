import { Input } from "@/components/ui/input";
import { milestoneHoursLabel, milestoneWorkingDays, formatHours } from "@/lib/contract-hours";

type Participant = { id: string; name: string; weeklyHours?: number | null };

export function MilestoneAllocationFields({
  participants,
  values,
  onChange,
  deferredUntilValidation = false,
  beginDate,
  targetDate,
}: {
  participants: Participant[];
  values: Record<string, number>;
  onChange: (memberId: string, value: number) => void;
  deferredUntilValidation?: boolean;
  beginDate?: string | null;
  targetDate?: string | null;
}) {
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
      {participants.length === 0 ? (
        <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
          Add a primary assignee or topic collaborator to allocate occupancy.
        </p>
      ) : (
        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {participants.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 rounded-sm border p-2">
              <div className="min-w-0">
                <label htmlFor={`milestone-allocation-${member.id}`} className="block break-words text-sm">
                  {member.name}
                  {member.weeklyHours != null && <span className="ml-1 text-xs text-muted-foreground">({formatHours(member.weeklyHours)} h/week contract)</span>}
                </label>
                <p className="text-xs text-muted-foreground" aria-live="polite" data-testid={`milestone-hours-${member.id}`}>
                  {milestoneHoursLabel(member.weeklyHours, values[member.id] ?? 0, beginDate, targetDate)}
                </p>
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
          ))}
        </div>
      )}
    </div>
  );
}