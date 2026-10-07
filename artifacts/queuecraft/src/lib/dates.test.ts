import assert from "node:assert/strict";
import { test } from "node:test";
import { displayDateToIso, formatDate, formatDateTime, isoDateToDisplay } from "./dates";

test("human-readable dates always use DD/MM/YYYY including ISO API datetime responses", () => {
  assert.equal(formatDate("2030-03-09"), "09/03/2030");
  assert.equal(formatDate("2030-03-09T00:00:00.000Z"), "09/03/2030");
  assert.equal(formatDate(new Date(2030, 2, 9)), "09/03/2030");
  assert.equal(formatDateTime(new Date(2030, 2, 9, 14, 5)), "09/03/2030 14:05");
  assert.equal(isoDateToDisplay("2030-03-09"), "09/03/2030");
});

test("day-first input retains ISO storage and rejects impossible or US-only dates", () => {
  assert.equal(displayDateToIso("09/03/2030"), "2030-03-09");
  assert.equal(displayDateToIso("03/09/2030"), "2030-09-03");
  assert.equal(displayDateToIso("03/31/2030"), null);
  assert.equal(displayDateToIso("31/02/2030"), null);
  assert.equal(displayDateToIso("29/02/2032"), "2032-02-29");
  assert.equal(displayDateToIso("29/02/2030"), null);
});
