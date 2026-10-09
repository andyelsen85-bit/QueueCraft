import { test } from "node:test";
import assert from "node:assert/strict";
import { currentDateAssignments, isScheduledOnDate, localTodayIso } from "./my-work-running";

test("Running work includes today's start and finish boundaries", () => {
  for (const today of ["2026-10-05", "2026-10-09", "2026-10-16"]) {
    assert.equal(isScheduledOnDate("2026-10-05", "2026-10-16", today), true);
  }
  assert.equal(isScheduledOnDate("2026-10-09", "2026-10-09", "2026-10-09"), true);
});

test("Future and expired assignments do not appear", () => {
  assert.equal(isScheduledOnDate("2026-10-12", "2026-10-16", "2026-10-09"), false);
  assert.equal(isScheduledOnDate("2026-10-01", "2026-10-08", "2026-10-09"), false);
});

test("Date-only and timestamp responses use the same calendar period", () => {
  assert.equal(isScheduledOnDate("2026-10-09T00:00:00.000Z", "2026-10-09T00:00:00.000Z", "2026-10-09"), true);
});

test("Missing, invalid and reversed schedules are excluded", () => {
  for (const [start, finish] of [[null, null], [null, "2026-10-16"], ["2026-10-05", null], ["2026-02-30", "2026-10-16"], ["2026-10-16", "2026-10-05"], ["05/10/2026", "16/10/2026"]]) {
    assert.equal(isScheduledOnDate(start, finish, "2026-10-09"), false);
  }
});

test("Today is derived from the local calendar day", () => {
  assert.equal(localTodayIso(new Date(2026, 9, 9, 0, 1)), "2026-10-09");
  assert.equal(localTodayIso(new Date(2026, 9, 9, 23, 59)), "2026-10-09");
});

test("Current assignments include every status and work planned to start today", () => {
  const statuses = ["open", "not_started", "pending_validation", "in_progress", "completed", "closed", "returned", "blocked", "rejected", "pipeline", "not_pursued"];
  const assigned = statuses.map(status => ({
    id: status, title: status, status,
    estimatedStartDate: "2026-10-09", estimatedFinishDate: "2026-10-16",
  }));
  const milestones = statuses.map(status => ({
    title: status, status, beginDate: "2026-10-09", targetDate: "2026-10-16",
  }));
  const result = currentDateAssignments({ assigned, collaborations: [assigned[0]], milestones }, "2026-10-09");
  assert.equal(result.topics.length, statuses.length);
  assert.equal(result.milestones.length, statuses.length);
  assert.ok(result.topics.some(t => t.status === "open"));
  assert.ok(result.milestones.some(m => m.status === "not_started"));
  assert.ok(result.milestones.some(m => m.status === "completed"));
  assert.equal(assigned[0].id, "open", "Sorting must not mutate the original assignments");
  assert.equal(currentDateAssignments({ assigned, collaborations: [], milestones }, "2026-10-08").topics.length, 0);
  assert.equal(currentDateAssignments({ assigned, collaborations: [], milestones }, "2026-10-08").milestones.length, 0);
});
