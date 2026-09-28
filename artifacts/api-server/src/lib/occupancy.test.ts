import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateOccupancy } from "./occupancy";

test("adds overlapping allocations from different topics to the member's weekly BAU", () => {
  const result = calculateOccupancy(20, [
    {
      memberId: "shared-member", milestoneId: "one", topicId: "role-one-topic",
      title: "Role one: Delivery", beginDate: "2041-01-14", targetDate: "2041-01-20",
      allocationPercent: 40,
    },
    {
      memberId: "shared-member", milestoneId: "two", topicId: "role-two-topic",
      title: "Role two: Design", beginDate: "2041-01-14", targetDate: "2041-01-17",
      allocationPercent: 35,
    },
  ], "2041-01-14", "2041-01-20");
  assert.equal(result.milestoneAllocationPercent, 60);
  assert.equal(result.totalOccupancyPercent, 80);
  assert.equal(result.availablePercent, 20);
  assert.equal(result.milestones.length, 2);
});