import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunningOnDate, localTodayIso } from "./my-work-running";

test("Running work includes today's start and finish boundaries", () => {
  for (const today of ["2026-10-05", "2026-10-09", "2026-10-16"]) {
    assert.equal(isRunningOnDate("in_progress", "2026-10-05", "2026-10-16", today), true);
  }
  assert.equal(isRunningOnDate("in_progress", "2026-10-09", "2026-10-09", "2026-10-09"), true);
});

test("Future, expired and non-running assignments do not appear", () => {
  assert.equal(isRunningOnDate("in_progress", "2026-10-12", "2026-10-16", "2026-10-09"), false);
  assert.equal(isRunningOnDate("in_progress", "2026-10-01", "2026-10-08", "2026-10-09"), false);
  for (const status of ["open", "not_started", "pending_validation", "completed", "closed", "returned", "blocked", "rejected", "pipeline", "not_pursued"]) {
    assert.equal(isRunningOnDate(status, "2026-10-05", "2026-10-16", "2026-10-09"), false);
  }
});

test("Date-only and timestamp responses use the same calendar period", () => {
  assert.equal(isRunningOnDate("in_progress", "2026-10-09T00:00:00.000Z", "2026-10-09T00:00:00.000Z", "2026-10-09"), true);
});

test("Missing, invalid and reversed schedules are excluded", () => {
  for (const [start, finish] of [[null, null], [null, "2026-10-16"], ["2026-10-05", null], ["2026-02-30", "2026-10-16"], ["2026-10-16", "2026-10-05"], ["05/10/2026", "16/10/2026"]]) {
    assert.equal(isRunningOnDate("in_progress", start, finish, "2026-10-09"), false);
  }
});

test("Today is derived from the local calendar day", () => {
  assert.equal(localTodayIso(new Date(2026, 9, 9, 0, 1)), "2026-10-09");
  assert.equal(localTodayIso(new Date(2026, 9, 9, 23, 59)), "2026-10-09");
});
