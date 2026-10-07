import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { buildMemberBauCsv, buildMemberBauPdf, type BauExportMember } from "./member-bau-export";

const sample: BauExportMember[] = [
  {
    id: "z", name: "Zoë Müller", title: "Operations specialist", email: "zoe@example.invalid",
    dailyBusinessPercent: 45,
    dailyBusinessTasks: [
      { name: 'Service support, including "priority" requests', percent: 25 },
      { name: "Documentation\nand reporting", percent: 20 },
    ],
  },
  { id: "a", name: "Élodie André", email: "elodie@example.invalid", dailyBusinessPercent: 15, dailyBusinessTasks: [] },
  { id: "b", name: "Ben Example", email: "ben@example.invalid", dailyBusinessPercent: 0, dailyBusinessTasks: [] },
];

test("CSV includes every member, task allocation, legacy BAU, and Unicode with correct quoting", () => {
  const csv = buildMemberBauCsv(sample);
  assert.ok(csv.startsWith("\uFEFFMember,Title,Email,Total BAU (%),BAU task,Task BAU (%)\r\n"));
  assert.ok(csv.indexOf('"Ben Example"') < csv.indexOf('"Élodie André"'));
  assert.ok(csv.indexOf('"Élodie André"') < csv.indexOf('"Zoë Müller"'));
  assert.ok(csv.includes('"Standard Operations",15'));
  assert.ok(csv.includes('"ben@example.invalid",0,"",'));
  assert.ok(csv.includes('"Service support, including ""priority"" requests",25'));
  assert.ok(csv.includes('"Documentation\nand reporting",20'));
});

test("CSV neutralizes formulas in user-controlled member and task text", () => {
  const csv = buildMemberBauCsv([{
    ...sample[0], name: "=HYPERLINK(\"unsafe\")", title: "+1", email: "@unsafe",
    dailyBusinessTasks: [{ name: "  =1+1", percent: 10 }, { name: "\tunsafe", percent: 2 }],
  }]);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"unsafe\"\")\""));
  assert.ok(csv.includes("\"'+1\""));
  assert.ok(csv.includes("\"'@unsafe\""));
  assert.ok(csv.includes("\"'  =1+1\""));
  assert.ok(csv.includes("\"'\tunsafe\""));
});

test("PDF paginates many tasks and a task longer than a full page", () => {
  // Resolve public assets relative to this source file, not the test runner's cwd.
  const regular = readFileSync(new URL("../../public/fonts/DejaVuSans.ttf", import.meta.url)).toString("base64");
  const bold = readFileSync(new URL("../../public/fonts/DejaVuSans-Bold.ttf", import.meta.url)).toString("base64");
  const manyTasks = Array.from({ length: 65 }, (_, index) => ({
    name: `BAU task ${index + 1}: application deployment, monitoring, incident response and service documentation across multiple systems`,
    percent: 1,
  }));
  const pdf = buildMemberBauPdf([
    ...sample,
    {
      ...sample[0], id: "long", name: "Long-list Example", dailyBusinessPercent: 65,
      dailyBusinessTasks: [...manyTasks, { name: `${"Long task description. ".repeat(200)}FINAL TASK MARKER`, percent: 0 }],
    },
  ], { regular, bold }, new Date("2026-10-07T12:00:00Z"));
  assert.ok(pdf.getNumberOfPages() >= 4);
  assert.ok(pdf.output().startsWith("%PDF-"));
  if (process.env.BAU_EXPORT_TEST_OUTPUT) {
    writeFileSync(process.env.BAU_EXPORT_TEST_OUTPUT, Buffer.from(pdf.output("arraybuffer")));
  }
});
