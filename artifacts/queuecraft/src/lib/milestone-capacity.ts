import type { MemberAvailability } from "@workspace/api-client-react";

/** Subtract only the proposed allocation; editing excludes the saved allocation server-side. */
export function proposedCapacity(availability: MemberAvailability, percent: number) {
  const safePercent = Number.isFinite(percent) ? percent : 0;
  return {
    minimumAvailablePercent: availability.minimumAvailablePercent == null
      ? null : availability.minimumAvailablePercent - safePercent,
    availableHours: availability.availableHours == null || availability.weeklyHours == null
      ? null : availability.availableHours -
        availability.weeklyHours / 5 * availability.workingDays * safePercent / 100,
    overbookedPeriods: availability.segments.filter((segment) => segment.availablePercent - safePercent < 0)
      .map((segment) => ({ ...segment, availablePercent: segment.availablePercent - safePercent })),
  };
}
