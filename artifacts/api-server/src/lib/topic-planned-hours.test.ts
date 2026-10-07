import assert from "node:assert/strict";
import { test } from "node:test";
import { topicPlannedHours } from "./topic-planned-hours";

const members = [{ id: "a", weeklyHours: 40 }, { id: "b", weeklyHours: 20 }];
const first = { id: "m1", topicId: "t1", beginDate: "2030-01-07", targetDate: "2030-01-11" };
const second = { id: "m2", topicId: "t1", beginDate: "2030-01-14", targetDate: "2030-01-15" };

test("sums every member across every milestone, keeping topic totals separate", () => {
  const result = topicPlannedHours([first, second, { ...first, id: "m3", topicId: "t2" }], [
    { milestoneId: "m1", memberId: "a", allocationPercent: 50 },
    { milestoneId: "m1", memberId: "b", allocationPercent: 25 },
    { milestoneId: "m2", memberId: "a", allocationPercent: 25 },
    { milestoneId: "m2", memberId: "b", allocationPercent: 50 },
    { milestoneId: "m3", memberId: "a", allocationPercent: 100 },
  ], members);
  assert.deepEqual(result.get("t1"), { plannedMilestoneHours: 33, unestimatedMilestoneAllocationCount: 0 });
  assert.equal(result.get("t2")?.plannedMilestoneHours, 40);
});

test("retains overlapping and overbooked work instead of capping or averaging hours", () => {
  const result = topicPlannedHours([first, { ...first, id: "m2" }], [
    { milestoneId: "m1", memberId: "a", allocationPercent: 150 },
    { milestoneId: "m2", memberId: "a", allocationPercent: 100 },
  ], members);
  assert.equal(result.get("t1")?.plannedMilestoneHours, 100);
});

test("missing contracts and dates mark a partial sum rather than inventing hours", () => {
  const result = topicPlannedHours([first, { ...second, beginDate: null }], [
    { milestoneId: "m1", memberId: "a", allocationPercent: 50 },
    { milestoneId: "m1", memberId: "b", allocationPercent: 50 },
    { milestoneId: "m2", memberId: "a", allocationPercent: 25 },
  ], [{ id: "a", weeklyHours: 40 }, { id: "b", weeklyHours: null }]);
  assert.deepEqual(result.get("t1"), { plannedMilestoneHours: 20, unestimatedMilestoneAllocationCount: 2 });
});

test("inclusive weekdays accept API datetime prefixes, exclude weekends, and count holidays", () => {
  const result = topicPlannedHours([
    { ...first, beginDate: "2030-12-25T00:00:00.000Z", targetDate: "2030-12-25T00:00:00.000Z" },
    { ...second, beginDate: "2030-01-12", targetDate: "2030-01-13" },
  ], [{ milestoneId: "m1", memberId: "a", allocationPercent: 50 },
    { milestoneId: "m2", memberId: "a", allocationPercent: 100 }], members);
  assert.equal(result.get("t1")?.plannedMilestoneHours, 4);
});

test("empty or zero-percent plans are zero; invalid dates remain unknown", () => {
  assert.equal(topicPlannedHours([], [], members).size, 0);
  assert.deepEqual(topicPlannedHours([first], [], members).get("t1"),
    { plannedMilestoneHours: 0, unestimatedMilestoneAllocationCount: 0 });
  assert.equal(topicPlannedHours([{ ...first, beginDate: null }], [
    { milestoneId: "m1", memberId: "missing", allocationPercent: 0 },
  ], []).get("t1")?.unestimatedMilestoneAllocationCount, 0);
  for (const dates of [
    { beginDate: "2030-02-30", targetDate: "2030-03-03" },
    { beginDate: "2030-01-11", targetDate: "2030-01-07" },
  ]) {
    assert.equal(topicPlannedHours([{ ...first, ...dates }], [
      { milestoneId: "m1", memberId: "a", allocationPercent: 100 },
    ], members).get("t1")?.unestimatedMilestoneAllocationCount, 1);
  }
});

test("fractional contracts and allocations are rounded only after summing", () => {
  const result = topicPlannedHours([first, { ...first, id: "m2" }], [
    { milestoneId: "m1", memberId: "a", allocationPercent: 1 },
    { milestoneId: "m2", memberId: "a", allocationPercent: 1 },
  ], [{ id: "a", weeklyHours: 22.25 }]);
  assert.equal(result.get("t1")?.plannedMilestoneHours, 0.45);
});
