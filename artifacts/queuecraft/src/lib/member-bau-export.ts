import { jsPDF } from "jspdf";
import { formatDate } from "./dates";
import { formatHours, weeklyAllocationHours } from "./contract-hours";

export type BauExportMember = {
  id: string;
  name: string;
  title?: string | null;
  email: string;
  dailyBusinessPercent?: number | null;
  weeklyHours?: number | null;
  dailyBusinessTasks: Array<{ name: string; percent: number }>;
};

type PdfFonts = { regular: string; bold: string };

function tasksFor(member: BauExportMember) {
  return member.dailyBusinessTasks.length
    ? member.dailyBusinessTasks
    : (member.dailyBusinessPercent ?? 0) > 0
      ? [{ name: "Standard Operations", percent: member.dailyBusinessPercent! }]
      : [];
}

function orderedMembers(members: readonly BauExportMember[]) {
  return [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

const percent = (value: number) => `${value}%`;
const fileDate = (date: Date) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"),
].join("-");

/** Quote CSV cells and neutralize spreadsheet formulas in user-controlled text. */
function csvText(value: string) {
  const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildMemberBauCsv(members: readonly BauExportMember[]) {
  const rows = ["Member,Title,Email,Contract hours/week,Total BAU (%),Total BAU (hours/week),BAU task,Task BAU (%),Task BAU (hours/week)"];
  const hours = (member: BauExportMember, percentage: number) => {
    const result = weeklyAllocationHours(member.weeklyHours, percentage);
    return result == null ? "" : Math.round(result * 100) / 100;
  };
  for (const member of orderedMembers(members)) {
    const tasks = tasksFor(member);
    for (const task of tasks.length ? tasks : [null]) {
      rows.push([
        csvText(member.name), csvText(member.title || "Member"), csvText(member.email),
        member.weeklyHours ?? "", member.dailyBusinessPercent ?? 0, hours(member, member.dailyBusinessPercent ?? 0),
        csvText(task?.name ?? ""), task?.percent ?? "", task ? hours(member, task.percent) : "",
      ].join(","));
    }
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

export function downloadMemberBauCsv(members: readonly BauExportMember[]) {
  const url = URL.createObjectURL(new Blob([buildMemberBauCsv(members)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `queuecraft-members-bau-${fileDate(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function loadBauPdfFonts(): Promise<PdfFonts> {
  const base = import.meta.env.BASE_URL;
  const load = async (filename: string) => {
    const response = await fetch(`${base}fonts/${filename}`);
    if (!response.ok) throw new Error("Could not load PDF fonts. Please try again.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  };
  const [regular, bold] = await Promise.all([load("DejaVuSans.ttf"), load("DejaVuSans-Bold.ttf")]);
  return { regular, bold };
}

/** Build a selectable-text PDF, splitting long task rows rather than clipping them. */
export function buildMemberBauPdf(members: readonly BauExportMember[], fonts: PdfFonts, generated = new Date()) {
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  pdf.addFileToVFS("Bau-Regular.ttf", fonts.regular);
  pdf.addFont("Bau-Regular.ttf", "Bau", "normal");
  pdf.addFileToVFS("Bau-Bold.ttf", fonts.bold);
  pdf.addFont("Bau-Bold.ttf", "Bau", "bold");
  pdf.setProperties({ title: "QueueCraft — Members BAU report", subject: "Business-as-usual task allocations", creator: "QueueCraft" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = width - margin * 2;
  const bottom = height - 48;
  let y = 94;
  const date = formatDate(generated);
  const sorted = orderedMembers(members);

  function text(value: string | string[], x: number, top: number, size = 10, bold = false, color = [51, 65, 85]) {
    pdf.setFont("Bau", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(value, x, top);
  }
  function lines(value: string, maxWidth: number, size: number, bold = false): string[] {
    pdf.setFont("Bau", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    return pdf.splitTextToSize(value, maxWidth);
  }
  function header() {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, width, 72, "F");
    pdf.setFillColor(249, 115, 22);
    pdf.rect(margin, 23, 4, 27, "F");
    text("QueueCraft", margin + 14, 35, 17, true, [255, 255, 255]);
    text("MEMBERS / BUSINESS AS USUAL", margin + 14, 53, 8, false, [203, 213, 225]);
    pdf.setFontSize(9);
    text(date, width - margin - pdf.getTextWidth(date), 35, 9, false, [203, 213, 225]);
    y = 94;
  }
  function newPage() {
    pdf.addPage();
    header();
  }
  function memberHeading(member: BauExportMember, continued = false) {
    const name = lines(member.name, contentWidth - 130, 12, true);
    const contract = member.weeklyHours == null ? "Not entered" : `${formatHours(member.weeklyHours)} h/week`;
    const detail = lines(`${member.title || "Member"} · ${member.email}\nContract: ${contract}`, contentWidth - 130, 8);
    const blockHeight = Math.max(78, 31 + name.length * 15 + detail.length * 11 + (continued ? 13 : 0));
    if (y + blockHeight + 45 > bottom) newPage();
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, y, contentWidth, blockHeight, "F");
    let top = y + 19;
    name.forEach((line) => { text(line, margin + 12, top, 12, true, [15, 23, 42]); top += 15; });
    detail.forEach((line) => { text(line, margin + 12, top, 8); top += 11; });
    if (continued) text("Task breakdown continued", margin + 12, top, 8, false, [100, 116, 139]);
    text(percent(member.dailyBusinessPercent ?? 0), width - margin - 82, y + 24, 16, true, [194, 65, 12]);
    text("TOTAL BAU", width - margin - 82, y + 40, 7, true);
    pdf.setFillColor(226, 232, 240);
    pdf.rect(width - margin - 82, y + 48, 68, 4, "F");
    pdf.setFillColor(249, 115, 22);
    pdf.rect(width - margin - 82, y + 48, 68 * Math.min(100, Math.max(0, member.dailyBusinessPercent ?? 0)) / 100, 4, "F");
    const weekly = weeklyAllocationHours(member.weeklyHours, member.dailyBusinessPercent ?? 0);
    text(weekly == null ? "Hours unset" : `${formatHours(weekly)} h/week`, width - margin - 82, y + 67, 8, true);
    y += blockHeight + 10;
    text("BAU TASK", margin + 12, y, 7, true, [100, 116, 139]);
    text("ALLOC. (%)", width - margin - 125, y, 7, true, [100, 116, 139]);
    text("HOURS/WK", width - margin - 68, y, 7, true, [100, 116, 139]);
    y += 12;
  }

  header();
  text("Members BAU report", margin, y + 12, 21, true, [15, 23, 42]);
  text("Business-as-usual allocations by member", margin, y + 32, 10);
  y += 48;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, width - margin, y);
  text(`${sorted.length} members`, margin, y + 20, 10, true);
  text(`${sorted.reduce((sum, member) => sum + tasksFor(member).length, 0)} BAU tasks`, margin + 160, y + 20, 10, true);
  text("Percentages are per member", margin + 300, y + 20, 8);
  y += 42;

  for (const member of sorted) {
    memberHeading(member);
    const tasks = tasksFor(member);
    if (!tasks.length) {
      text("No BAU tasks assigned", margin + 12, y + 12, 9, false, [100, 116, 139]);
      y += 32;
    }
    tasks.forEach((task, index) => {
      const wrapped = lines(task.name, contentWidth - 165, 9);
      let offset = 0;
      do {
        if (bottom - y < 30) {
          newPage();
          memberHeading(member, true);
        }
        const count = Math.max(1, Math.floor((bottom - y - 16) / 13));
        const chunk = wrapped.slice(offset, offset + count);
        const rowHeight = chunk.length * 13 + 16;
        if (index % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, contentWidth, rowHeight, "F");
        }
        chunk.forEach((line, lineIndex) => text(line, margin + 12, y + 16 + lineIndex * 13, 9));
        text(percent(task.percent), width - margin - 120, y + 16, 9, true);
        const hours = weeklyAllocationHours(member.weeklyHours, task.percent);
        text(hours == null ? "—" : formatHours(hours), width - margin - 65, y + 16, 9, true);
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y + rowHeight, width - margin, y + rowHeight);
        y += rowHeight;
        offset += chunk.length;
      } while (offset < wrapped.length);
    });
    y += 20;
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, height - 34, width - margin, height - 34);
    text("QueueCraft · Members BAU", margin, height - 20, 8, false, [100, 116, 139]);
    text(`${page} / ${pages}`, width - margin - 35, height - 20, 8, false, [100, 116, 139]);
  }
  return pdf;
}

export async function downloadMemberBauPdf(members: readonly BauExportMember[]) {
  const generated = new Date();
  const fonts = await loadBauPdfFonts();
  buildMemberBauPdf(members, fonts, generated).save(`queuecraft-members-bau-${fileDate(generated)}.pdf`);
}
