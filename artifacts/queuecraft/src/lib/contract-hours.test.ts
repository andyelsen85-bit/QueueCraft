import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneAllocationHours, milestoneWorkingDays, weeklyAllocationHours, milestoneHoursLabel } from "./contract-hours";

test("BAU hours depend on the real contract, including fractional hours and zero allocations", () => {
  assert.equal(weeklyAllocationHours(40, 25), 10);
  assert.equal(weeklyAllocationHours(37.5, 20), 7.5);
  assert.equal(weeklyAllocationHours(20, 0), 0);
  assert.equal(weeklyAllocationHours(null, 25), null);
  assert.equal(weeklyAllocationHours(undefined, 0), null);
});

test("Milestones count inclusive weekdays, not weekends, with no timezone or DST drift", () => {
  assert.equal(milestoneWorkingDays("2026-10-05", "2026-10-16"), 10);
  assert.equal(milestoneAllocationHours(40, 25, "2026-10-05", "2026-10-16"), 20);
  assert.equal(milestoneAllocationHours(37.5, 20, "2026-10-05", "2026-10-16"), 15);
  assert.equal(milestoneWorkingDays("2026-10-09", "2026-10-12"), 2);
  assert.equal(milestoneWorkingDays("2026-10-10", "2026-10-11"), 0);
  assert.equal(milestoneWorkingDays("2026-10-07", "2026-10-07"), 1);
  assert.equal(milestoneWorkingDays("2026-10-23T00:00:00.000Z", "2026-10-26T00:00:00.000Z"), 2);
  assert.equal(milestoneWorkingDays("05/10/2026", "16/10/2026"), 10);
  assert.equal(milestoneWorkingDays("2026-10-05", "2026-10-05"), 1);
});

test("Missing contracts or dates do not produce an assumed estimate", () => {
  assert.equal(milestoneAllocationHours(null, 25, "2026-10-05", "2026-10-16"), null);
  assert.equal(milestoneWorkingDays(null, "2026-10-16"), null);
  assert.equal(milestoneWorkingDays("2026-10-16", "2026-10-05"), null);
  assert.equal(milestoneWorkingDays("2026-02-30", "2026-03-05"), null);
  assert.equal(milestoneAllocationHours(40, 25, null, "2026-10-16"), null);
  assert.match(milestoneHoursLabel(null, 25, null, null), /Set weekly contract hours/);
  assert.match(milestoneHoursLabel(40, 25, null, null), /Enter valid milestone dates/);
});
