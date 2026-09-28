export type ScheduledAllocation = {
  memberId: string;
  milestoneId: string;
  topicId: string;
  title: string;
  beginDate: string;
  targetDate: string;
  allocationPercent: number;
};

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;

export function calculateOccupancy(
  dailyBusinessPercent: number,
  allocations: ScheduledAllocation[],
  startDate: string,
  endDate: string,
) {
  const rangeDays = dayNumber(endDate) - dayNumber(startDate) + 1;
  const milestones = allocations.flatMap((allocation) => {
    const from = allocation.beginDate > startDate ? allocation.beginDate : startDate;
    const to = allocation.targetDate < endDate ? allocation.targetDate : endDate;
    const overlapDays = Math.max(0, dayNumber(to) - dayNumber(from) + 1);
    return overlapDays > 0
      ? [{
          ...allocation,
          weightedPercent: allocation.allocationPercent * overlapDays / rangeDays,
        }]
      : [];
  });
  const milestonePercent = milestones.reduce((sum, row) => sum + row.weightedPercent, 0);
  const totalOccupancyPercent = Math.round(dailyBusinessPercent + milestonePercent);
  return {
    dailyBusinessPercent,
    milestoneAllocationPercent: Math.round(milestonePercent),
    totalOccupancyPercent,
    availablePercent: 100 - totalOccupancyPercent,
    overAllocated: totalOccupancyPercent > 100,
    milestones,
  };
}