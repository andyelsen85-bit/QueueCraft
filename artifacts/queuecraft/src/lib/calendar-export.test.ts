import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import type { CalendarTopic } from "@workspace/api-client-react";
import { buildCalendarCsv, buildCalendarPdf, selectCalendarExport } from "./calendar-export";

const sample: CalendarTopic = {
  id: "topic-parent", title: 'Élodie, "Infrastructure"', priority: "P2", status: "open",
  departmentName: "Opérations & infrastructure", roleId: "role-infra",
  targetDate: "2027-01-31T00:00:00.000Z", estimatedStartDate: "2027-01-01T00:00:00.000Z",
  estimatedFinishDate: "2027-01-20T00:00:00.000Z", assignedMemberIds: ["member-parent"],
  canEditDates: true, dependsOnTopicId: "topic-prerequisite",
  milestones: [
    { id: "milestone-match", title: 'Install "devices", stage 1', status: "not_started",
      beginDate: "2027-01-05T00:00:00.000Z", targetDate: "2027-01-08T00:00:00.000Z",
      canEditDates: true, dependsOnMilestoneId: "milestone-prerequisite", assignedMemberIds: ["member-child"] },
    { id: "milestone-other", title: "Other assignment", status: "in_progress",
      beginDate: "2027-01-09", targetDate: "2027-01-10",
      canEditDates: true, dependsOnMilestoneId: null, assignedMemberIds: ["member-other"] },
    { id: "milestone-future", title: "Future", status: "not_started",
      beginDate: "2028-01-01", targetDate: "2028-01-03",
      canEditDates: true, dependsOnMilestoneId: null, assignedMemberIds: ["member-child"] },
    { id: "milestone-undated", title: "Unscheduled", status: "not_started",
      beginDate: null, targetDate: null,
      canEditDates: true, dependsOnMilestoneId: null, assignedMemberIds: ["member-child"] },
  ],
};
const period = { start: new Date(2027, 0, 1), end: new Date(2027, 0, 31) };

test("calendar export preserves independent member filtering and parent context", () => {
  const selected = selectCalendarExport([sample], { roleId: "", memberId: "member-child", period });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].contextOnly, true);
  assert.deepEqual(selected[0].milestones.map(row => row.id), ["milestone-match"]);
  const parent = selectCalendarExport([sample], { roleId: "", memberId: "member-parent", period });
  assert.equal(parent[0].contextOnly, false);
  assert.equal(parent[0].milestones.length, 0);
  assert.equal(selectCalendarExport([sample], { roleId: "another-role", memberId: "" }).length, 0);
  assert.equal(selectCalendarExport([sample], { roleId: "", memberId: "nobody" }).length, 0);
});

test("all schedules export includes undated and future milestones, independently of expansion", () => {
  const selected = selectCalendarExport([sample], { roleId: "", memberId: "member-child" });
  assert.equal(selected[0].milestones.length, 3);
  const undated: CalendarTopic = { ...sample, id: "undated-topic", estimatedStartDate: null,
    estimatedFinishDate: null, targetDate: null, milestones: [] };
  assert.equal(selectCalendarExport([undated], { roleId: "", memberId: "" }).length, 1);
  assert.equal(selectCalendarExport([undated], { roleId: "", memberId: "", period }).length, 0);
});

test("CSV keeps hierarchy, IDs, ISO dates, committed finish, names, Unicode and prerequisite links", () => {
  const selected = selectCalendarExport([sample], { roleId: "", memberId: "", period });
  const csv = buildCalendarCsv(selected, { roleNames: { "role-infra": "Infrastructure" },
    memberNames: { "member-child": "Zoë Müller" } });
  assert.ok(csv.startsWith("\uFEFFrecord_type,id,parent_topic_id"));
  assert.equal(csv.split("\r\n").filter(Boolean).length, 4);
  assert.ok(csv.includes('"Élodie, ""Infrastructure"""'));
  assert.ok(csv.includes('"milestone","milestone-match","topic-parent"'));
  assert.ok(csv.includes('"Install ""devices"", stage 1"'));
  assert.ok(csv.includes('"2027-01-01","2027-01-20","2027-01-31","topic-prerequisite"'));
  assert.ok(csv.includes('"2027-01-05","2027-01-08","","milestone-prerequisite"'));
  assert.ok(csv.includes('"Zoë Müller"'));
  assert.ok(!csv.includes("T00:00:00"));
});

test("CSV neutralizes formulas and preserves multiline text safely", () => {
  const selected = selectCalendarExport([{ ...sample, title: '=HYPERLINK("unsafe")',
    departmentName: "  +1", milestones: [{ ...sample.milestones[0], title: "Line one\nLine two" }] }],
  { roleId: "", memberId: "" });
  const csv = buildCalendarCsv(selected);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"unsafe\"\")\""));
  assert.ok(csv.includes("\"'  +1\""));
  assert.ok(csv.includes('"Line one\nLine two"'));
});

test("A0 PDF is landscape, Unicode-capable, includes all rows and paginates", () => {
  const regular = readFileSync(new URL("../../public/fonts/DejaVuSans.ttf", import.meta.url)).toString("base64");
  const bold = readFileSync(new URL("../../public/fonts/DejaVuSans-Bold.ttf", import.meta.url)).toString("base64");
  const many = Array.from({ length: 70 }, (_, i) => ({
    ...sample, id: `topic-${i}`, title: `${sample.title} ${i + 1}`,
    milestones: [{ ...sample.milestones[0], title: i === 69 ? "FINAL MILESTONE MARKER" : `Installation ${i + 1}` }],
  }));
  const pdf = buildCalendarPdf(selectCalendarExport(many, { roleId: "", memberId: "" }),
    { regular, bold }, { period }, new Date("2026-10-07T12:00:00Z"));
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 3370.39) < 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 2383.94) < 1);
  assert.ok(pdf.getNumberOfPages() >= 4);
  assert.ok(pdf.output().startsWith("%PDF-"));
  if (process.env.CALENDAR_EXPORT_TEST_OUTPUT) {
    writeFileSync(process.env.CALENDAR_EXPORT_TEST_OUTPUT, Buffer.from(pdf.output("arraybuffer")));
  }
});
