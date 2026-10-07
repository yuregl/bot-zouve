import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBirthdayDate, parseBirthdayDate } from "../../src/birthdays/birthday.js";

const TODAY = new Date(2026, 9, 7);

function error(text: string): string | undefined {
  const parsed = parseBirthdayDate(text, TODAY);
  return "error" in parsed ? parsed.error : undefined;
}

test("parseBirthdayDate reads a day and month, with an optional year", () => {
  assert.deepEqual(parseBirthdayDate("15/03", TODAY), { date: { day: 15, month: 3 } });
  assert.deepEqual(parseBirthdayDate(" 5/3/1998 ", TODAY), { date: { day: 5, month: 3, year: 1998 } });
  assert.deepEqual(parseBirthdayDate("07/10/2026", TODAY), { date: { day: 7, month: 10, year: 2026 } });
});

test("parseBirthdayDate accepts 29/02 without a year and in leap years", () => {
  assert.deepEqual(parseBirthdayDate("29/02", TODAY), { date: { day: 29, month: 2 } });
  assert.deepEqual(parseBirthdayDate("29/02/2024", TODAY), { date: { day: 29, month: 2, year: 2024 } });
});

test("parseBirthdayDate refuses other formats", () => {
  for (const text of ["15-03", "15/03/98", "march 15", "", "1503"]) {
    assert.match(error(text) ?? "", /DD\/MM or DD\/MM\/YYYY/, text);
  }
});

test("parseBirthdayDate refuses dates that do not exist", () => {
  assert.match(error("15/13") ?? "", /no month 13/);
  assert.match(error("00/03") ?? "", /00\/03 is not a valid date/);
  assert.match(error("31/04") ?? "", /31\/04 is not a valid date/);
  assert.match(error("29/02/2023") ?? "", /29\/02\/2023 is not a valid date/);
});

test("parseBirthdayDate refuses years before 1900 and dates in the future", () => {
  assert.match(error("15/03/1899") ?? "", /from 1900 to today/);
  assert.match(error("08/10/2026") ?? "", /from 1900 to today/);
  assert.match(error("15/03/2030") ?? "", /from 1900 to today/);
});

test("formatBirthdayDate writes the date with two-digit day and month", () => {
  assert.equal(formatBirthdayDate({ day: 5, month: 3 }), "05/03");
  assert.equal(formatBirthdayDate({ day: 15, month: 11, year: 1998 }), "15/11/1998");
});
