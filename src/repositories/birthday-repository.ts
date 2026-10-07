import type { Birthday, BirthdayRepository } from "../birthdays/birthday.js";
import { BirthdayModel } from "../infra/db/models/birthday-model.js";

/** The part of the Mongoose model the repository uses; tests replace it. */
export interface BirthdayStore {
  findOneAndUpdate(
    filter: object,
    update: object,
    options: object,
  ): PromiseLike<{ lastErrorObject?: { updatedExisting?: boolean } } | null>;
}

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

/** Saves birthdays with Mongoose, replacing the member's existing birthday in the server. */
export function createBirthdayRepository(store: BirthdayStore = BirthdayModel): BirthdayRepository {
  return {
    async save(birthday) {
      const result = await store.findOneAndUpdate({ guildId: birthday.guildId, userId: birthday.userId }, toDocumentUpdate(birthday), {
        upsert: true,
        runValidators: true,
        includeResultMetadata: true,
      });

      return result?.lastErrorObject?.updatedExisting ? "updated" : "created";
    },
  };
}
