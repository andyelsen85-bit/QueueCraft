import type { PipelineViewStatus } from "./topic-page-visibility";

export function readPipelineFilters(search: string) {
  const params = new URLSearchParams(search);
  const status: PipelineViewStatus =
    params.get("status") === "not_pursued" ? "not_pursued" : "pipeline";
  const departmentId = params.get("departmentId") || "";
  const priority = params.get("priority") || "";
  return {
    status,
    departmentId,
    roleId: departmentId ? params.get("roleId") || "" : "",
    priority: ["P1", "P2", "P3", "P4"].includes(priority) ? priority : "",
  };
}

export function updatePipelineFilterSearch(
  search: string,
  next: Partial<Record<"status" | "departmentId" | "roleId" | "priority", string>>,
) {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  if ("departmentId" in next && !("roleId" in next)) params.delete("roleId");
  return params.toString();
}
