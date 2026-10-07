import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageFlags, type ChatInputCommandInteraction, type EmbedBuilder, type InteractionReplyOptions } from "discord.js";
import { addMessage, addVideo, listContent, removeContent } from "../../src/commands/birthday-content.js";
import type { BirthdayContent, NewBirthdayContent } from "../../src/birthdays/birthday-content.js";

type Reply = InteractionReplyOptions;

/** An in-memory collection that behaves like the repository. */
function fakeRepository(options: { fail?: boolean; removeFails?: boolean } = {}) {
  const items: BirthdayContent[] = [];
  let nextId = 1;
  const check = () => {
    if (options.fail) {
      throw new Error("connection closed");
    }
  };
  const repository = {
    add: async (content: NewBirthdayContent) => {
      check();
      if (content.type === "video" && items.some((item) => item.type === "video" && item.videoId === content.videoId)) {
        return "duplicate" as const;
      }
      items.push({ ...content, id: String(nextId++), createdAt: new Date() });
      return "added" as const;
    },
    list: async () => {
      check();
      return [...items];
    },
    remove: async (_guildId: string, id: string) => {
      const index = items.findIndex((item) => item.id === id);
      if (options.removeFails || index < 0) {
        return false;
      }
      items.splice(index, 1);
      return true;
    },
    setVideoAvailability: async (_guildId: string, id: string, available: boolean) => {
      const item = items.find((candidate) => candidate.id === id);
      if (item) {
        item.unavailable = !available;
      }
    },
  };
  return { repository, items };
}

function context(
  repository: ReturnType<typeof fakeRepository>["repository"],
  options: { strings?: Record<string, string>; number?: number; databaseReady?: boolean } = {},
) {
  const replies: Reply[] = [];
  const interaction = {
    user: { id: "admin-user" },
    options: {
      getString: (name: string) => options.strings?.[name] ?? "",
      getInteger: () => options.number ?? 1,
    },
    reply: async (response: Reply) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  return {
    replies,
    context: { interaction, guildId: "guild", repository, isDatabaseReady: () => options.databaseReady ?? true },
  };
}

function text(reply: Reply | undefined): string {
  return String(reply?.content);
}

/** The embed of a reply; fails the test when there is none. */
function embedOf(reply: Reply | undefined) {
  const embed = reply?.embeds?.[0] as EmbedBuilder | undefined;
  assert.ok(embed, "expected an embed");
  return embed.data;
}

const PRIVATE_WITHOUT_PREVIEWS = MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds;

test("message add stores the message and replies privately", async () => {
  const { repository, items } = fakeRepository();
  const { context: ctx, replies } = context(repository, { strings: { text: "  С днём рождения! 🎉 " } });

  await addMessage(ctx);

  assert.deepEqual(
    items.map(({ type, guildId, addedBy, ...rest }) => ({ type, guildId, addedBy, text: (rest as { text: string }).text })),
    [{ type: "message", guildId: "guild", addedBy: "admin-user", text: "С днём рождения! 🎉" }],
  );
  assert.deepEqual(replies, [{ content: "Added to the birthday collection: 💬 С днём рождения! 🎉", flags: PRIVATE_WITHOUT_PREVIEWS }]);
});

test("message add refuses empty messages", async () => {
  const { repository, items } = fakeRepository();
  const { context: ctx, replies } = context(repository, { strings: { text: "   " } });

  await addMessage(ctx);

  assert.deepEqual(items, []);
  assert.match(text(replies[0]), /Write a message/);
});

test("video add stores the standard link and refuses duplicates", async () => {
  const { repository, items } = fakeRepository();
  const first = context(repository, { strings: { link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD1" } });
  const again = context(repository, { strings: { link: "https://youtu.be/dQw4w9WgXcQ" } });

  await addVideo(first.context);
  await addVideo(again.context);

  assert.equal(items.length, 1);
  assert.deepEqual(
    items.map((item) => (item.type === "video" ? [item.videoId, item.videoUrl] : [])),
    [["dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]],
  );
  assert.equal(text(first.replies[0]), "Added to the birthday collection: 🎬 https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(text(again.replies[0]), /already in the birthday collection/);
});

test("video add refuses links that are not a single YouTube video", async () => {
  for (const link of ["https://example.com/video", "https://www.youtube.com/playlist?list=PL1", "not a link"]) {
    const { repository, items } = fakeRepository();
    const { context: ctx, replies } = context(repository, { strings: { link } });

    await addVideo(ctx);

    assert.deepEqual(items, [], link);
    assert.match(text(replies[0]), /single YouTube video/);
  }
});

async function collectionWith(contents: NewBirthdayContent[]) {
  const fake = fakeRepository();
  for (const content of contents) {
    await fake.repository.add(content);
  }
  return fake;
}

const base = { guildId: "guild", addedBy: "admin-user" };
const THREE_ITEMS: NewBirthdayContent[] = [
  { ...base, type: "message", text: "С днём рождения!" },
  { ...base, type: "message", text: "जन्मदिन मुबारक हो!" },
  { ...base, type: "video", videoId: "dQw4w9WgXcQ", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
];

test("list numbers the items and remove takes the item with that number", async () => {
  const { repository, items } = await collectionWith(THREE_ITEMS);
  const list = context(repository);

  await listContent(list.context);

  const embed = embedOf(list.replies[0]);
  assert.equal(list.replies[0]?.flags, MessageFlags.Ephemeral);
  assert.deepEqual(list.replies[0]?.allowedMentions, { parse: [] });
  assert.deepEqual(embed.description?.split("\n"), [
    "**1.** 💬 С днём рождения! — <@admin-user>",
    "**2.** 💬 जन्मदिन मुबारक हो! — <@admin-user>",
    "**3.** 🎬 https://www.youtube.com/watch?v=dQw4w9WgXcQ — <@admin-user>",
  ]);
  assert.match(embed.footer?.text ?? "", /^3 items/);

  const remove = context(repository, { number: 2 });
  await removeContent(remove.context);

  assert.equal(text(remove.replies[0]), "Removed from the birthday collection: 💬 जन्मदिन मुबारक हो!");
  assert.deepEqual(
    items.map((item) => item.type),
    ["message", "video"],
  );
});

test("remove refuses numbers that do not exist", async () => {
  const { repository, items } = await collectionWith(THREE_ITEMS.slice(0, 2));
  const { context: ctx, replies } = context(repository, { number: 5 });

  await removeContent(ctx);

  assert.equal(items.length, 2);
  assert.match(text(replies[0]), /no item 5; the collection has 2 items/);
});

test("remove says when the item was removed meanwhile", async () => {
  const { repository } = fakeRepository({ removeFails: true });
  await repository.add(THREE_ITEMS[0] as NewBirthdayContent);
  const { context: ctx, replies } = context(repository, { number: 1 });

  await removeContent(ctx);

  assert.match(text(replies[0]), /already removed/);
});

test("list says when the collection is empty, and shortens a list that is too long", async () => {
  const empty = context(fakeRepository().repository);
  await listContent(empty.context);
  assert.match(text(empty.replies[0]), /collection is empty/);

  const long = await collectionWith(Array.from({ length: 60 }, (_, i) => ({ ...base, type: "message" as const, text: `${i} ${"x".repeat(100)}` })));
  const full = context(long.repository);
  await listContent(full.context);

  const lines = (embedOf(full.replies[0]).description ?? "").split("\n");
  assert.ok(lines.join("\n").length <= 4096);
  assert.match(lines.at(-1) ?? "", /^…and \d+ more\.$/);
});

test("every command says content cannot be changed when the database is unavailable", async () => {
  for (const run of [addMessage, addVideo, listContent, removeContent]) {
    const { context: ctx, replies } = context(fakeRepository().repository, {
      databaseReady: false,
      strings: { text: "Oi", link: "https://youtu.be/dQw4w9WgXcQ" },
    });

    await run(ctx);

    assert.match(text(replies[0]), /cannot be changed right now/, run.name);
  }
});

test("every command says content cannot be changed when the database fails", async () => {
  for (const run of [addMessage, listContent, removeContent]) {
    const { context: ctx, replies } = context(fakeRepository({ fail: true }).repository, { strings: { text: "Oi" } });

    await run(ctx);

    assert.match(text(replies[0]), /cannot be changed right now/, run.name);
  }
});

test("list marks videos that were found unavailable", async () => {
  const { repository, items } = await collectionWith(THREE_ITEMS);
  await repository.setVideoAvailability("guild", items[2]?.id ?? "", false);
  const list = context(repository);

  await listContent(list.context);

  assert.match(embedOf(list.replies[0]).description ?? "", /\*\*3\.\*\* 🎬 https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ ⚠️ unavailable/);
});
