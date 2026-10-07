export interface BirthdayDate {
  day: number;
  month: number;
  /** Optional, so members do not have to reveal their age. */
  year?: number;
}

export interface Birthday extends BirthdayDate {
  guildId: string;
  userId: string;
  /** The member's Discord username, like `ana.silva`. */
  username: string;
  /** User ID of the member who set the birthday. */
  setBy: string;
}

export type SaveResult = "created" | "updated";

/** A saved birthday as lists show it: without the year, so no one's age is exposed. */
export interface BirthdayEntry {
  userId: string;
  username: string;
  day: number;
  month: number;
}

/** Stores birthdays; the command depends on this instead of on the database. */
export interface BirthdayRepository {
  /** Saves the member's birthday in the guild, replacing an existing one. */
  save(birthday: Birthday): Promise<SaveResult>;
  /** The guild's birthdays, in no particular order. */
  list(guildId: string): Promise<BirthdayEntry[]>;
}

/** The time zone that decides which day is "today" for birthdays. */
export const BIRTHDAY_TIME_ZONE = "America/Sao_Paulo";

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** The calendar day of an instant in a time zone. */
export function calendarDayIn(timeZone: string, now: Date = new Date()): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days from today until the next birthday on that day and month: 0 when it is today. A
 * 29/02 birthday is celebrated on 28/02 in years that are not leap years.
 */
export function daysUntilBirthday(birthday: Pick<BirthdayEntry, "day" | "month">, today: CalendarDay): number {
  const start = Date.UTC(today.year, today.month - 1, today.day);
  const occurrence = (year: number) => {
    const day = Math.min(birthday.day, daysInMonth(birthday.month, year));
    return Date.UTC(year, birthday.month - 1, day);
  };
  const next = occurrence(today.year) >= start ? occurrence(today.year) : occurrence(today.year + 1);
  return Math.round((next - start) / DAY_MS);
}

/** Sorts birthdays by how soon they come, starting today; ties keep the username order. */
export function sortByNextBirthday<T extends BirthdayEntry>(birthdays: readonly T[], today: CalendarDay): (T & { daysUntil: number })[] {
  return birthdays
    .map((birthday) => ({ ...birthday, daysUntil: daysUntilBirthday(birthday, today) }))
    .toSorted((a, b) => a.daysUntil - b.daysUntil || a.username.localeCompare(b.username));
}

export const MIN_BIRTH_YEAR = 1900;

export type ParsedBirthdayDate = { date: BirthdayDate } | { error: string };

const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

/**
 * Parses `DD/MM` or `DD/MM/YYYY` (for example `15/03` or `15/03/1998`). Without a year,
 * 29/02 is accepted; with one, the date must exist and not be in the future.
 */
export function parseBirthdayDate(text: string, today = new Date()): ParsedBirthdayDate {
  const match = text.trim().match(DATE_PATTERN);

  if (!match) {
    return { error: "Write the date as DD/MM or DD/MM/YYYY, like 15/03 or 15/03/1998." };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] === undefined ? undefined : Number(match[3]);

  if (month < 1 || month > 12) {
    return { error: `There is no month ${month}. Write the date as DD/MM or DD/MM/YYYY.` };
  }

  // Without a year, a leap year allows 29/02.
  const checkYear = year ?? 2000;
  if (day < 1 || day > daysInMonth(month, checkYear)) {
    return {
      error: year === undefined ? `${pad(day)}/${pad(month)} is not a valid date.` : `${pad(day)}/${pad(month)}/${year} is not a valid date.`,
    };
  }

  if (year !== undefined) {
    const birth = new Date(year, month - 1, day);
    if (year < MIN_BIRTH_YEAR || birth > today) {
      return { error: `The year must be from ${MIN_BIRTH_YEAR} to today.` };
    }
  }

  return { date: year === undefined ? { day, month } : { day, month, year } };
}

/** Writes a date as `DD/MM` or `DD/MM/YYYY`. */
export function formatBirthdayDate(date: BirthdayDate): string {
  const dayMonth = `${pad(date.day)}/${pad(date.month)}`;
  return date.year === undefined ? dayMonth : `${dayMonth}/${date.year}`;
}

function daysInMonth(month: number, year: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
