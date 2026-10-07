import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDayIn,
  daysUntilBirthday,
  formatBirthdayDate,
  parseBirthdayDate,
  sortByNextBirthday,
} from "../../src/birthdays/birthday.js";

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

test("calendarDayIn gives the day in the time zone, not in UTC", () => {
  // 01:30 UTC on 8 October is still 7 October in São Paulo (UTC-3).
  const instant = new Date("2026-10-08T01:30:00Z");

  assert.deepEqual(calendarDayIn("America/Sao_Paulo", instant), { year: 2026, month: 10, day: 7 });
  assert.deepEqual(calendarDayIn("UTC", instant), { year: 2026, month: 10, day: 8 });
});

test("daysUntilBirthday counts to the next occurrence, wrapping to next year", () => {
  const today = { year: 2026, month: 10, day: 7 };

  assert.equal(daysUntilBirthday({ day: 7, month: 10 }, today), 0);
  assert.equal(daysUntilBirthday({ day: 8, month: 10 }, today), 1);
  assert.equal(daysUntilBirthday({ day: 6, month: 10 }, today), 364);
  assert.equal(daysUntilBirthday({ day: 1, month: 1 }, today), 86);
});

test("daysUntilBirthday celebrates 29/02 on 28/02 outside leap years", () => {
  assert.equal(daysUntilBirthday({ day: 29, month: 2 }, { year: 2027, month: 2, day: 28 }), 0);
  assert.equal(daysUntilBirthday({ day: 29, month: 2 }, { year: 2028, month: 2, day: 28 }), 1);
});

test("sortByNextBirthday starts with today's birthdays and ties by username", () => {
  const today = { year: 2026, month: 10, day: 7 };
  const sorted = sortByNextBirthday(
    [
      { userId: "1", username: "zoe", day: 6, month: 10 },
      { userId: "2", username: "bia", day: 25, month: 12 },
      { userId: "3", username: "caio", day: 7, month: 10 },
      { userId: "4", username: "ana", day: 25, month: 12 },
    ],
    today,
  );

  assert.deepEqual(
    sorted.map((birthday) => [birthday.username, birthday.daysUntil]),
    [
      ["caio", 0],
      ["ana", 79],
      ["bia", 79],
      ["zoe", 364],
    ],
  );
});
