import assert from "node:assert/strict";
import test from "node:test";
import { readPipelineFilters, updatePipelineFilterSearch } from "./pipeline-filters";

test("Pipeline defaults to waiting proposals and ignores invalid filter values", () => {
  assert.deepEqual(readPipelineFilters(""), {
    status: "pipeline", departmentId: "", roleId: "", priority: "",
  });
  assert.deepEqual(readPipelineFilters("status=open&priority=P9&roleId=orphan"), readPipelineFilters(""));
});

test("status changes apply to the next render and survive reload in both directions", () => {
  const declined = updatePipelineFilterSearch("", { status: "not_pursued" });
  assert.equal(readPipelineFilters(declined).status, "not_pursued");
  const reloaded = new URL(`https://example.invalid/pipeline?${declined}`);
  assert.equal(readPipelineFilters(reloaded.search).status, "not_pursued");
  assert.equal(readPipelineFilters(updatePipelineFilterSearch(reloaded.search, {
    status: "pipeline",
  })).status, "pipeline");
});

test("department, role and priority stay synchronized without Topics preferences", () => {
  let search = updatePipelineFilterSearch("", {
    departmentId: "operations", roleId: "support", priority: "P2", status: "not_pursued",
  });
  assert.deepEqual(readPipelineFilters(search), {
    departmentId: "operations", roleId: "support", priority: "P2", status: "not_pursued",
  });
  search = updatePipelineFilterSearch(search, { departmentId: "solutions" });
  assert.equal(readPipelineFilters(search).roleId, "");
  search = updatePipelineFilterSearch(search, { departmentId: "", priority: "" });
  assert.deepEqual(readPipelineFilters(search), {
    departmentId: "", roleId: "", priority: "", status: "not_pursued",
  });
});
