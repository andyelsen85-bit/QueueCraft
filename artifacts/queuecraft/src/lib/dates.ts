const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isoDateToDisplay(value?: string | null) {
  if (!value) return "";
  const match = value.match(ISO_DATE_PATTERN);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function displayDateToIso(value: string) {
  const match = value.match(DISPLAY_DATE_PATTERN);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string") {
    const displayDate = isoDateToDisplay(value);
    if (displayDate) return displayDate;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}