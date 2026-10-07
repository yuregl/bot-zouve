import type { Birthday, BirthdayEntry, BirthdayRepository } from "../birthdays/birthday.js";
import { BirthdayModel } from "../infra/db/models/birthday-model.js";

/** A stored birthday as MongoDB returns it: with `birthDate` or with `day` and `month`. */
export interface StoredBirthday {
  userId: string;
  username: string;
  birthDate?: Date | null;
  day?: number | null;
  month?: number | null;
}

/** The database operations the repository uses; tests replace them. */
export interface BirthdayStore {
  /** Upserts and returns MongoDB's result metadata. */
  upsert(filter: object, update: object): Promise<{ lastErrorObject?: { updatedExisting?: boolean } } | null>;
  findByGuild(guildId: string): Promise<StoredBirthday[]>;
}

/** The store backed by the Mongoose model. */
export const mongooseBirthdayStore: BirthdayStore = {
  upsert: (filter, update) =>
    BirthdayModel.findOneAndUpdate(filter, update, { upsert: true, runValidators: true, includeResultMetadata: true }).exec(),
  findByGuild: (guildId) => BirthdayModel.find({ guildId }).lean<StoredBirthday[]>().exec(),
};

/**
 * Stores a birthday with a year as `birthDate`, at midnight UTC so the day does not shift
 * with time zones, and one without a year as `day` and `month`. Saving replaces the fields
 * of the other form, so a member's document always has one of them.
 */
export function toDocumentUpdate({ username, setBy, day, month, year }: Birthday): object {
  return year === undefined
    ? { $set: { username, setBy, day, month }, $unset: { birthDate: 1 } }
    : { $set: { username, setBy, birthDate: new Date(Date.UTC(year, month - 1, day)) }, $unset: { day: 1, month: 1 } };
}

/** Reads the day and month of a stored birthday; returns undefined for documents without a date. */
export function toBirthdayEntry({ userId, username, birthDate, day, month }: StoredBirthday): BirthdayEntry | undefined {
  if (birthDate) {
    return { userId, username, day: birthDate.getUTCDate(), month: birthDate.getUTCMonth() + 1 };
  }

  return day && month ? { userId, username, day, month } : undefined;
}

/** Saves and lists birthdays with Mongoose. */
export function createBirthdayRepository(store: BirthdayStore = mongooseBirthdayStore): BirthdayRepository {
  return {
    async save(birthday) {
      const result = await store.upsert({ guildId: birthday.guildId, userId: birthday.userId }, toDocumentUpdate(birthday));
      return result?.lastErrorObject?.updatedExisting ? "updated" : "created";
    },

    async list(guildId) {
      const stored = await store.findByGuild(guildId);
      return stored.map(toBirthdayEntry).filter((entry) => entry !== undefined);
    },
  };
}
