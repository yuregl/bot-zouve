import type { BirthdayContent, BirthdayContentRepository } from "../birthdays/birthday-content.js";
import { BirthdayContentModel } from "../infra/db/models/birthday-content-model.js";

/** A stored item as MongoDB returns it. */
export interface StoredContent {
  _id: { toString(): string };
  guildId: string;
  type: string;
  text?: string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  addedBy: string;
  createdAt: Date;
}

/** The database operations the repository uses; tests replace them. */
export interface BirthdayContentStore {
  create(document: object): Promise<unknown>;
  /** The server's items, oldest first. */
  findByGuild(guildId: string): Promise<StoredContent[]>;
  deleteOne(filter: object): Promise<{ deletedCount: number }>;
}

/** The store backed by the Mongoose model. */
export const mongooseContentStore: BirthdayContentStore = {
  create: (document) => BirthdayContentModel.create(document),
  findByGuild: (guildId) => BirthdayContentModel.find({ guildId }).sort({ createdAt: 1, _id: 1 }).lean<StoredContent[]>().exec(),
  deleteOne: (filter) => BirthdayContentModel.deleteOne(filter).exec(),
};

// MongoDB's error code for a value that breaks a unique index.
const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === DUPLICATE_KEY;
}

/** Turns a stored item into a domain item; returns undefined for documents missing their text or video. */
export function toBirthdayContent(stored: StoredContent): BirthdayContent | undefined {
  const base = { id: stored._id.toString(), guildId: stored.guildId, addedBy: stored.addedBy, createdAt: stored.createdAt };

  if (stored.type === "message" && stored.text) {
    return { ...base, type: "message", text: stored.text };
  }

  if (stored.type === "video" && stored.videoId && stored.videoUrl) {
    return { ...base, type: "video", videoId: stored.videoId, videoUrl: stored.videoUrl };
  }

  return undefined;
}

/** Stores birthday messages and videos with Mongoose. */
export function createBirthdayContentRepository(store: BirthdayContentStore = mongooseContentStore): BirthdayContentRepository {
  return {
    async add(content) {
      try {
        await store.create(content);
        return "added";
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return "duplicate";
        }
        throw error;
      }
    },

    async list(guildId) {
      const stored = await store.findByGuild(guildId);
      return stored.map(toBirthdayContent).filter((item) => item !== undefined);
    },

    async remove(guildId, id) {
      const result = await store.deleteOne({ _id: id, guildId });
      return result.deletedCount > 0;
    },
  };
}
