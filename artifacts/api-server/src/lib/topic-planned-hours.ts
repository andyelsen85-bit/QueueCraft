import { workingDays } from "./member-availability";

type Milestone = { id: string; topicId: string; beginDate: string | null; targetDate: string | null };
type Allocation = { milestoneId: string; memberId: string; allocationPercent: number };
type Member = { id: string; weeklyHours: number | null };
type Summary = { plannedMilestoneHours: number; unestimatedMilestoneAllocationCount: number };

function dayNumber(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const iso = value.slice(0, 10);
  const timestamp = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== iso) return null;
  return timestamp / 86400000;
}

/** All milestone allocations, including completed, future, and overlapping work.
 * No BAU or historical topic-level allocations; never assume a missing contract.
 */
export function topicPlannedHours(milestones: Milestone[], allocations: Allocation[], members: Member[]) {
  const byMilestone = new Map(milestones.map(milestone => [milestone.id, milestone]));
  const byMember = new Map(members.map(member => [member.id, member]));
  const summaries = new Map<string, Summary>();
  for (const milestone of milestones) {
    if (!summaries.has(milestone.topicId)) {
      summaries.set(milestone.topicId, { plannedMilestoneHours: 0, unestimatedMilestoneAllocationCount: 0 });
    }
  }
  for (const allocation of allocations) {
    const milestone = byMilestone.get(allocation.milestoneId);
    if (!milestone || allocation.allocationPercent === 0) continue;
    const summary = summaries.get(milestone.topicId)!;
    const weeklyHours = byMember.get(allocation.memberId)?.weeklyHours;
    const start = dayNumber(milestone.beginDate);
    const end = dayNumber(milestone.targetDate);
    if (weeklyHours == null || !Number.isFinite(weeklyHours) || weeklyHours <= 0 ||
      !Number.isFinite(allocation.allocationPercent) || allocation.allocationPercent < 0 ||
      start == null || end == null || start > end) {
      summary.unestimatedMilestoneAllocationCount++;
      continue;
    }
    summary.plannedMilestoneHours += weeklyHours / 5 * workingDays(start, end) * allocation.allocationPercent / 100;
  }
  for (const summary of summaries.values()) {
    summary.plannedMilestoneHours = Math.round((summary.plannedMilestoneHours + Number.EPSILON) * 100) / 100;
  }
  return summaries;
}
