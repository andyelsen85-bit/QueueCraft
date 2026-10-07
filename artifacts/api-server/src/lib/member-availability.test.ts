import assert from "node:assert/strict";
import { test } from "node:test";
import { memberAvailability } from "./member-availability";
import type { ScheduledAllocation } from "./occupancy";

function allocation(id: string, percent: number, beginDate = "2026-10-05", targetDate = "2026-10-09"): ScheduledAllocation {
  return { memberId: "person", milestoneId: id, topicId: id, title: id, beginDate, targetDate, allocationPercent: percent };
}

test("signed capacity combines BAU with concurrent work from every topic", () => {
  const result = memberAvailability(40, 40, [allocation("a", 30), allocation("b", 40)], "2026-10-05", "2026-10-09");
  assert.equal(result.minimumAvailablePercent, -10);
  assert.equal(result.availableHours, -4);
  assert.equal(result.workingDays, 5);
  assert.equal(result.segments[0].milestoneAllocationPercent, 70);
});

test("short overload is visible even when average period capacity is positive", () => {
  const result = memberAvailability(20, 40, [
    allocation("a", 100, "2026-10-07", "2026-10-07"),
  ], "2026-10-05", "2026-10-09");
  assert.equal(result.minimumAvailablePercent, -20);
  assert.ok(Math.abs(result.availableHours! - 24) < 0.00001);
  assert.deepEqual(result.segments.map(s => [s.startDate, s.endDate, s.availablePercent]), [
    ["2026-10-05", "2026-10-06", 80],
    ["2026-10-07", "2026-10-07", -20],
    ["2026-10-08", "2026-10-09", 80],
  ]);
});

test("editing excludes only the edited milestone, preventing double counting", () => {
  const result = memberAvailability(40, 40, [allocation("edited", 40), allocation("other", 30)],
    "2026-10-05", "2026-10-09", "edited");
  assert.equal(result.minimumAvailablePercent, 30);
  assert.equal(result.availableHours, 12);
});

test("inclusive boundaries and disjoint allocations are not summed as concurrent", () => {
  const result = memberAvailability(0, 35, [
    allocation("a", 60, "2026-10-05", "2026-10-06"),
    allocation("b", 70, "2026-10-07", "2026-10-09"),
    allocation("outside", 100, "2026-10-12", "2026-10-16"),
  ], "2026-10-05", "2026-10-09");
  assert.equal(result.minimumAvailablePercent, 30);
  assert.ok(Math.abs(result.availableHours! - 11.9) < 0.00001);
});

test("weekends do not create overload, including weekend-only ranges", () => {
  const result = memberAvailability(20, 40, [
    allocation("weekend", 100, "2026-10-10", "2026-10-11"),
  ], "2026-10-09", "2026-10-12");
  assert.equal(result.minimumAvailablePercent, 80);
  assert.equal(result.workingDays, 2);
  const weekend = memberAvailability(20, 40, [], "2026-10-10", "2026-10-11");
  assert.equal(weekend.minimumAvailablePercent, null);
  assert.equal(weekend.availableHours, null);
  assert.equal(weekend.workingDays, 0);
});

test("missing contracts retain percentages without invented hours", () => {
  const result = memberAvailability(15, null, [], "2026-10-05", "2026-10-09");
  assert.equal(result.minimumAvailablePercent, 85);
  assert.equal(result.availableHours, null);
});

test("public holidays count and date arithmetic is independent of DST", () => {
  assert.equal(memberAvailability(0, 40, [], "2026-10-23", "2026-10-26").workingDays, 2);
  assert.equal(memberAvailability(0, 40, [], "2026-12-25", "2026-12-25").availableHours, 8);
});

test("invalid ranges fail explicitly", () => {
  assert.throws(() => memberAvailability(0, 40, [], "invalid", "2026-10-09"));
  assert.throws(() => memberAvailability(0, 40, [], "2026-10-09", "2026-10-05"));
});
