import { jsPDF } from "jspdf";
import { formatDate, formatDateTime } from "./dates";
import { addDays, differenceInCalendarDays, format, startOfMonth, addMonths } from "date-fns";
import type { CalendarTopic } from "@workspace/api-client-react";
import { loadBauPdfFonts } from "./member-bau-export";

export type CalendarExportTopic = CalendarTopic & { contextOnly: boolean };
export const UNASSIGNED_DEPARTMENT = "__unassigned__";

export function matchesCalendarDepartment(topic: Pick<CalendarTopic, "departmentId">, departmentId?: string) {
  return !departmentId || (departmentId === UNASSIGNED_DEPARTMENT
    ? topic.departmentId === null : topic.departmentId === departmentId);
}
export type CalendarExportOptions = {
  title?: string;
  roleNames?: Record<string, string>;
  memberNames?: Record<string, string>;
  period?: { start: Date; end: Date };
  filterLabel?: string;
};
const dateOnly = (value?: string | null) => value?.slice(0, 10) ?? "";
const parseDay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

function overlaps(begin: string | null, end: string | null, period?: CalendarExportOptions["period"]) {
  if (!period) return true;
  const first = dateOnly(begin || end);
  const last = dateOnly(end || begin);
  if (!first || !last) return false;
  return [first, last].sort()[0] <= format(period.end, "yyyy-MM-dd")
    && [first, last].sort()[1] >= format(period.start, "yyyy-MM-dd");
}

/** Filter assignments independently, retaining a parent as context for matching milestones. */
export function selectCalendarExport(
  topics: readonly CalendarTopic[],
  options: { departmentId?: string; roleId: string; memberId: string; period?: CalendarExportOptions["period"] },
): CalendarExportTopic[] {
  return topics.flatMap(topic => {
    if (!matchesCalendarDepartment(topic, options.departmentId)) return [];
    if (options.roleId && topic.roleId !== options.roleId) return [];
    const topicMatches = (!options.memberId || topic.assignedMemberIds.includes(options.memberId))
      && overlaps(topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate, options.period);
    const milestones = topic.milestones.filter(milestone =>
      (!options.memberId || milestone.assignedMemberIds.includes(options.memberId))
      && overlaps(milestone.beginDate, milestone.targetDate, options.period))
      .sort((a, b) => dateOnly(a.beginDate).localeCompare(dateOnly(b.beginDate)) || a.title.localeCompare(b.title));
    return topicMatches || milestones.length ? [{ ...topic, contextOnly: !topicMatches, milestones }] : [];
  }).sort((a, b) => dateOnly(a.estimatedStartDate).localeCompare(dateOnly(b.estimatedStartDate))
    || a.title.localeCompare(b.title));
}

function csvCell(value: string) {
  // Prevent spreadsheet formula execution without changing date or ID semantics.
  const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCalendarCsv(topics: readonly CalendarExportTopic[], options: CalendarExportOptions = {}) {
  const rows = [[
    "record_type", "id", "parent_topic_id", "topic_title", "title", "department", "role_id", "role_name",
    "topic_priority", "status", "planned_start", "planned_end", "committed_finish", "prerequisite_id",
    "assigned_member_ids", "assigned_members", "context_only",
  ].join(",")];
  const assignedNames = (ids: string[]) => ids.map(id => options.memberNames?.[id] ?? id).join("; ");
  for (const topic of topics) {
    const shared = [topic.departmentName, topic.roleId ?? "", options.roleNames?.[topic.roleId ?? ""] ?? "", topic.priority];
    rows.push([
      "topic", topic.id, "", topic.title, topic.title, ...shared, topic.status,
      dateOnly(topic.estimatedStartDate), dateOnly(topic.estimatedFinishDate), dateOnly(topic.targetDate),
      topic.dependsOnTopicId ?? "", topic.assignedMemberIds.join("; "), assignedNames(topic.assignedMemberIds),
      String(topic.contextOnly),
    ].map(csvCell).join(","));
    for (const milestone of topic.milestones) {
      rows.push([
        "milestone", milestone.id, topic.id, topic.title, milestone.title, ...shared, milestone.status,
        dateOnly(milestone.beginDate), dateOnly(milestone.targetDate), "", milestone.dependsOnMilestoneId ?? "",
        milestone.assignedMemberIds.join("; "), assignedNames(milestone.assignedMemberIds), "false",
      ].map(csvCell).join(","));
    }
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

export function downloadCalendarCsv(topics: readonly CalendarExportTopic[], options: CalendarExportOptions = {}) {
  const url = URL.createObjectURL(new Blob([buildCalendarCsv(topics, options)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `queuecraft-calendar-${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const statusColors: Record<string, [number, number, number]> = {
  open: [59, 130, 246], not_started: [14, 165, 233], in_progress: [249, 115, 22],
  completed: [16, 185, 129], pending_validation: [234, 179, 8], returned: [217, 119, 6],
  blocked: [220, 38, 38], rejected: [220, 38, 38], closed: [100, 116, 139],
};

/** Vector A0 landscape calendar with selectable Unicode text and repeated headers on overflow pages. */
export function buildCalendarPdf(
  topics: readonly CalendarExportTopic[],
  fonts: Awaited<ReturnType<typeof loadBauPdfFonts>>,
  options: CalendarExportOptions = {},
  generated = new Date(),
) {
  const pdf = new jsPDF({ unit: "pt", format: "a0", orientation: "landscape", compress: true });
  pdf.addFileToVFS("Calendar-Regular.ttf", fonts.regular);
  pdf.addFont("Calendar-Regular.ttf", "Calendar", "normal");
  pdf.addFileToVFS("Calendar-Bold.ttf", fonts.bold);
  pdf.addFont("Calendar-Bold.ttf", "Calendar", "bold");
  pdf.setFont("Calendar");
  pdf.setProperties({ title: options.title ?? "QueueCraft — Planning calendar", creator: "QueueCraft",
    subject: "Topics only — planned dates, committed finishes and status colors" });
  const allDates = topics.flatMap(topic => [
    ...(topic.contextOnly ? [] : [topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate]),
  ]).filter((date): date is string => Boolean(date)).map(dateOnly).sort();
  const start = options.period?.start ?? (allDates.length ? parseDay(allDates[0]) : startOfMonth(generated));
  const end = options.period?.end ?? (allDates.length ? parseDay(allDates.at(-1)!) : addMonths(start, 1));
  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 42, labelWidth = 650, gridLeft = margin + labelWidth, gridWidth = width - gridLeft - margin;
  const dayWidth = gridWidth / totalDays;
  const headerY = 172, bodyY = 222, bottom = height - 62;
  let y = bodyY;
  const pageHeader = () => {
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("Calendar", "bold"); pdf.setFontSize(28);
    pdf.text(options.title ?? "QueueCraft — Planning calendar", margin, 66);
    pdf.setFont("Calendar", "normal"); pdf.setFontSize(13);
    pdf.text(`${formatDate(start)} to ${formatDate(end)}  |  A0 landscape  |  Generated ${formatDateTime(generated)}`, margin, 94);
    const filterLines = pdf.splitTextToSize(options.filterLabel ?? "All departments · All roles · All members", width - 2 * margin);
    pdf.text(filterLines.slice(0, 2), margin, 115);
    pdf.setFontSize(11);
    let legendX = margin;
    for (const [status, color] of Object.entries(statusColors)) {
      pdf.setFillColor(...color); pdf.circle(legendX + 4, 151, 4, "F");
      const label = status.replaceAll("_", " ");
      pdf.text(label, legendX + 14, 155);
      legendX += pdf.getTextWidth(label) + 44;
    }
    pdf.setFillColor(241, 245, 249); pdf.rect(margin, headerY, width - 2 * margin, bodyY - headerY, "F");
    pdf.setFont("Calendar", "bold"); pdf.setFontSize(13);
    pdf.text("Topic · department · planned dates", margin + 12, headerY + 23);
    pdf.setFont("Calendar", "normal"); pdf.setFontSize(10);
    for (let month = startOfMonth(start); month <= end; month = addMonths(month, 1)) {
      const offset = Math.max(0, differenceInCalendarDays(month, start));
      const next = Math.min(totalDays, differenceInCalendarDays(addMonths(month, 1), start));
      const x = gridLeft + offset * dayWidth;
      pdf.setDrawColor(203, 213, 225); pdf.line(x, headerY, x, bodyY);
      if ((next - offset) * dayWidth > 60) pdf.text(format(month, "MMM yyyy"), x + 5, headerY + 17);
    }
    if (dayWidth >= 6) {
      pdf.setFontSize(Math.min(9, dayWidth - 1));
      for (let i = 0; i < totalDays; i++) {
        pdf.text(format(addDays(start, i), "d"), gridLeft + (i + 0.5) * dayWidth, bodyY - 9, { align: "center" });
      }
    } else {
      pdf.setFontSize(10);
      pdf.text("Bars show complete ranges; dates are also listed at left.", gridLeft + 8, bodyY - 9);
    }
    y = bodyY;
  };
  pageHeader();
  for (const topic of topics) {
    const rows = [{
      title: topic.title, status: topic.status, begin: topic.estimatedStartDate,
      finish: topic.estimatedFinishDate ?? topic.targetDate, milestone: false,
      detail: `${topic.departmentName} · ${options.roleNames?.[topic.roleId ?? ""] ?? topic.roleId ?? "Unassigned role"} · ${topic.priority}${topic.contextOnly ? " · Parent context" : ""}`,
      committed: topic.targetDate, showBar: !topic.contextOnly,
    }];
    for (const row of rows) {
      const indent = row.milestone ? 30 : 12;
      pdf.setFont("Calendar", row.milestone ? "normal" : "bold"); pdf.setFontSize(13);
      const titleLines: string[] = pdf.splitTextToSize(row.title, labelWidth - indent - 20);
      pdf.setFont("Calendar", "normal"); pdf.setFontSize(10);
      const detailLines: string[] = pdf.splitTextToSize(row.detail, labelWidth - indent - 20);
      const linesPerPage = Math.floor((bottom - bodyY - 35) / 16);
      // Split unusually long names rather than dropping text from a report.
      const chunks = [];
      for (let i = 0; i < titleLines.length; i += linesPerPage) chunks.push(titleLines.slice(i, i + linesPerPage));
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const titles = chunks[chunkIndex];
        const details = chunkIndex === chunks.length - 1 ? detailLines : ["(continued on next page)"];
        const rowHeight = Math.max(58, titles.length * 16 + details.length * 12 + 25);
        if (y + rowHeight > bottom && y !== bodyY) { pdf.addPage("a0", "landscape"); pageHeader(); }
        const actualHeight = Math.min(rowHeight, bottom - bodyY);
        const background: [number, number, number] = row.milestone ? [248, 250, 252] : [255, 255, 255];
        pdf.setFillColor(...background);
        pdf.rect(margin, y, width - 2 * margin, actualHeight, "F");
        pdf.setDrawColor(226, 232, 240); pdf.line(margin, y + actualHeight, width - margin, y + actualHeight);
        pdf.setTextColor(15, 23, 42); pdf.setFont("Calendar", row.milestone ? "normal" : "bold"); pdf.setFontSize(13);
        pdf.text(titles, margin + indent, y + 18, { lineHeightFactor: 16 / 13 });
        pdf.setFont("Calendar", "normal"); pdf.setFontSize(10); pdf.setTextColor(71, 85, 105);
        const detailY = y + 18 + titles.length * 16;
        pdf.text(details, margin + indent, detailY, { lineHeightFactor: 1.2 });
        pdf.text(`${dateOnly(row.begin) || "No start"} → ${dateOnly(row.finish) || "No finish"}${row.committed ? ` · Committed: ${dateOnly(row.committed)}` : ""}`,
          margin + indent, Math.min(y + actualHeight - 8, detailY + details.length * 12 + 3));
        const begin = dateOnly(row.begin || row.finish), finish = dateOnly(row.finish || row.begin);
        if (row.showBar && begin && finish && overlaps(begin, finish, { start, end })) {
          const first = Math.max(0, differenceInCalendarDays(parseDay(begin), start));
          const last = Math.min(totalDays - 1, differenceInCalendarDays(parseDay(finish), start));
          pdf.setFillColor(...(statusColors[row.status] ?? statusColors.closed));
          const barX = gridLeft + first * dayWidth, barWidth = Math.max(1, (last - first + 1) * dayWidth);
          pdf.roundedRect(barX, y + 15, barWidth, row.milestone ? 12 : 20, Math.min(3, barWidth / 2), 3, "F");
        }
        y += actualHeight;
      }
    }
  }
  if (!topics.length) { pdf.setFontSize(14); pdf.text("No topics match these filters.", margin + 12, bodyY + 30); }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); pdf.setFont("Calendar", "normal"); pdf.setFontSize(10); pdf.setTextColor(71, 85, 105);
    pdf.text("Topics only. Bars use estimates (committed finish if estimate unset). Parent-context rows have no bar. Print at actual size on A0 landscape.",
      margin, height - 28);
    pdf.text(`Page ${page} of ${pdf.getNumberOfPages()}`, width - margin, height - 28, { align: "right" });
  }
  return pdf;
}

export async function downloadCalendarPdf(topics: readonly CalendarExportTopic[], options: CalendarExportOptions = {}) {
  const fonts = await loadBauPdfFonts();
  buildCalendarPdf(topics, fonts, options).save(`queuecraft-calendar-A0-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
