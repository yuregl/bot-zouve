export const MAX_MESSAGE_LENGTH = 500;

export type NewBirthdayContent =
  | { guildId: string; addedBy: string; type: "message"; text: string }
  | { guildId: string; addedBy: string; type: "video"; videoId: string; videoUrl: string };

export type BirthdayContent = NewBirthdayContent & { id: string; createdAt: Date };

export type AddContentResult = "added" | "duplicate";

/** Stores each server's birthday messages and videos; the commands depend on this instead of on the database. */
export interface BirthdayContentRepository {
  /** Adds an item; a video already in the server's collection is not added again. */
  add(content: NewBirthdayContent): Promise<AddContentResult>;
  /** The server's items, oldest first. */
  list(guildId: string): Promise<BirthdayContent[]>;
  /** Removes an item of the server; returns false when it no longer exists. */
  remove(guildId: string, id: string): Promise<boolean>;
}

export type ParsedMessage = { text: string } | { error: string };

/** Trims a birthday message and checks its length. */
export function parseBirthdayMessage(raw: string): ParsedMessage {
  const text = raw.trim();

  if (!text) {
    return { error: "Write a message to add." };
  }

  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `Messages can have up to ${MAX_MESSAGE_LENGTH} characters; this one has ${text.length}.` };
  }

  return { text };
}

/** Describes an item for lists and replies; long messages are shortened. */
export function describeContent(content: NewBirthdayContent, maxLength = 80): string {
  if (content.type === "video") {
    return `🎬 ${content.videoUrl}`;
  }

  const text = content.text.replace(/\s+/g, " ");
  return `💬 ${text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text}`;
}
