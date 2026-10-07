import assert from "node:assert/strict";
import { test } from "node:test";
import { proposedCapacity } from "./milestone-capacity";
import type { MemberAvailability } from "@workspace/api-client-react";

const availability: MemberAvailability = {
  memberId: "person", weeklyHours: 40, dailyBusinessPercent: 40,
  workingDays: 5, minimumAvailablePercent: 30, availableHours: 12,
  segments: [{
    startDate: "2026-10-05", endDate: "2026-10-09", workingDays: 5,
    milestoneAllocationPercent: 30, availablePercent: 30,
  }],
};

test("live proposal shows signed percent and hours without clamping or altering BAU", () => {
  const result = proposedCapacity(availability, 40);
  assert.equal(result.minimumAvailablePercent, -10);
  assert.equal(result.availableHours, -4);
  assert.equal(result.overbookedPeriods[0].availablePercent, -10);
  assert.equal(availability.dailyBusinessPercent, 40);
  assert.equal(availability.minimumAvailablePercent, 30);
});

test("changing proposal clears overload at exactly 100 percent", () => {
  assert.equal(proposedCapacity(availability, 30).minimumAvailablePercent, 0);
  assert.equal(proposedCapacity(availability, 30).overbookedPeriods.length, 0);
  assert.equal(proposedCapacity(availability, 10).availableHours, 8);
});

test("unknown contracts and weekend-only dates remain unknown, not zero estimates", () => {
  const missing = proposedCapacity({ ...availability, weeklyHours: null, availableHours: null }, 40);
  assert.equal(missing.minimumAvailablePercent, -10);
  assert.equal(missing.availableHours, null);
  const weekend = proposedCapacity({ ...availability, minimumAvailablePercent: null, availableHours: null, workingDays: 0, segments: [] }, 40);
  assert.equal(weekend.minimumAvailablePercent, null);
  assert.equal(weekend.overbookedPeriods.length, 0);
});
