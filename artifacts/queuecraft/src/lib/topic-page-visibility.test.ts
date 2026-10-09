import { test } from "node:test";
import assert from "node:assert/strict";
import { isTopicInPage } from "./topic-page-visibility";

test("Topics never includes proposals, declined proposals or pending validation", () => {
  for (const status of ["pending_validation", "pipeline", "not_pursued"]) {
    assert.equal(isTopicInPage(status, "topics"), false);
  }
  for (const status of ["open", "in_progress", "returned", "completed", "closed", "rejected"]) {
    assert.equal(isTopicInPage(status, "topics"), true);
  }
});

test("Pipeline defaults to waiting proposals; the archive filter shows only Not pursued", () => {
  for (const status of ["pending_validation", "pipeline", "not_pursued", "open", "completed"]) {
    assert.equal(isTopicInPage(status, "pipeline"), status === "pipeline");
    assert.equal(isTopicInPage(status, "pipeline", "not_pursued"), status === "not_pursued");
  }
});
