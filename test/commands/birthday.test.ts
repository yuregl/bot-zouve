import assert from "node:assert/strict";
import { test } from "node:test";
import { Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { birthdayCommand, executeBirthday } from "../../src/commands/birthday.js";
import type { Birthday, BirthdayEntry, SaveResult } from "../../src/birthdays/birthday.js";
import type { NewBirthdayContent } from "../../src/birthdays/birthday-content.js";

type Reply = string | InteractionReplyOptions;

interface Options {
  date?: string;
  target?: { id: string; bot: boolean; username?: string };
  /** The member's roles; a plain array imitates a member Discord sent without the cache. */
  roles?: { id: string; name: string }[] | string[];
  inGuild?: boolean;
  managerRoles?: string[];
  databaseReady?: boolean;
  save?: SaveResult | Error;
  /** The subcommand group and subcommand, like ["message", "add"]; /birthday set by default. */
  subcommand?: [string | null, string];
  /** String options by name, for the content subcommands. */
  strings?: Record<string, string>;
  /** The server's saved birthdays, for /birthday list; an Error makes listing fail. */
  birthdays?: BirthdayEntry[] | Error;
}

function setup(options: Options = {}) {
  const replies: Reply[] = [];
  const saved: Birthday[] = [];
  const collection: NewBirthdayContent[] = [];
  const [group, subcommand] = options.subcommand ?? [null, "set"];
  const roles = options.roles ?? [{ id: "role-admin", name: "Admin" }];

  const interaction = {
    guildId: options.inGuild === false ? null : "guild",
    guild: { roles: { cache: new Collection([["role-admin", { id: "role-admin", name: "Admin" }]]) } },
    inGuild: () => options.inGuild !== false,
    user: { id: "admin-user" },
    member: {
      roles: roles.every((role) => typeof role === "string")
        ? roles
        : { cache: new Collection((roles as { id: string; name: string }[]).map((role) => [role.id, role])) },
    },
    options: {
      getUser: () => options.target ?? { id: "ana", bot: false, username: "ana.silva" },
      getString: (name: string) => options.strings?.[name] ?? options.date ?? "15/03",
      getInteger: () => 1,
      getSubcommandGroup: () => group,
      getSubcommand: () => subcommand,
    },
    reply: async (response: Reply) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const dependencies = {
    repository: {
      save: async (birthday: Birthday) => {
        if (options.save instanceof Error) {
          throw options.save;
        }
        saved.push(birthday);
        return options.save ?? "created";
      },
      list: async () => {
        if (options.birthdays instanceof Error) {
          throw options.birthdays;
        }
        return options.birthdays ?? [];
      },
    },
    contentRepository: {
      add: async (item: NewBirthdayContent) => {
        collection.push(item);
        return "added" as const;
      },
      list: async () => collection.map((item, index) => ({ ...item, id: String(index), createdAt: new Date() })),
      remove: async (_guildId: string, id: string) => collection.splice(Number(id), 1).length > 0,
    },
    managerRoles: options.managerRoles ?? ["admin"],
    isDatabaseReady: () => options.databaseReady ?? true,
    today: new Date(2026, 9, 7),
  };

  return { run: () => executeBirthday(interaction, dependencies), replies, saved, collection };
}

function isEphemeral(response: Reply | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

function content(response: Reply | undefined): string {
  return typeof response === "string" ? response : String(response?.content);
}

test("/birthday set saves the member's birthday without pinging them", async () => {
  const { run, replies, saved } = setup();

  await run();

  assert.deepEqual(saved, [
    { guildId: "guild", userId: "ana", username: "ana.silva", setBy: "admin-user", day: 15, month: 3 },
  ]);
  assert.deepEqual(replies, [{ content: "Saved <@ana>'s birthday: 15/03.", allowedMentions: { parse: [] } }]);
});

test("/birthday set says when it replaced a birthday", async () => {
  const { run, replies, saved } = setup({ date: "15/03/1998", save: "updated" });

  await run();

  assert.equal(saved[0]?.year, 1998);
  assert.equal(content(replies[0]), "Updated <@ana>'s birthday: 15/03/1998.");
});

test("/birthday set accepts a role listed by ID when Discord sends only role IDs", async () => {
  const { run, saved } = setup({ roles: ["role-admin"], managerRoles: ["role-admin"] });

  await run();

  assert.equal(saved.length, 1);
});

test("/birthday set matches role names from Discord's cache when it sends only role IDs", async () => {
  const byName = setup({ roles: ["role-admin"], managerRoles: ["admin"] });
  const unknown = setup({ roles: ["role-unknown"], managerRoles: ["admin"] });

  await byName.run();
  await unknown.run();

  assert.equal(byName.saved.length, 1);
  assert.equal(unknown.saved.length, 0);
});

test("/birthday set refuses members without an allowed role", async () => {
  const { run, replies, saved } = setup({ roles: [{ id: "role-member", name: "Member" }] });

  await run();

  assert.deepEqual(saved, []);
  assert.ok(isEphemeral(replies[0]));
  assert.match(content(replies[0]), /don't have a role/);
});

test("/birthday set refuses everyone when no roles are configured", async () => {
  const { run, replies, saved } = setup({ managerRoles: [] });

  await run();

  assert.deepEqual(saved, []);
  assert.match(content(replies[0]), /BIRTHDAY_MANAGER_ROLES/);
});

test("/birthday set refuses bots and invalid dates", async () => {
  for (const options of [{ target: { id: "bot", bot: true } }, { date: "31/04" }, { date: "15/03/2030" }]) {
    const { run, replies, saved } = setup(options);

    await run();

    assert.deepEqual(saved, []);
    assert.ok(isEphemeral(replies[0]));
  }
});

test("/birthday set says birthdays cannot be saved when the database is unavailable", async () => {
  for (const options of [{ databaseReady: false }, { save: new Error("connection closed") }]) {
    const { run, replies } = setup(options);

    await run();

    assert.ok(isEphemeral(replies[0]));
    assert.match(content(replies[0]), /cannot be saved right now/);
  }
});

test("/birthday set refuses outside a server", async () => {
  const { run, replies, saved } = setup({ inGuild: false });

  await run();

  assert.deepEqual(saved, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/birthday set has a required member and date", () => {
  const json = birthdayCommand.data.toJSON();
  const set = json.options?.[0] as { name: string; options: { name: string; required: boolean }[] };

  assert.equal(json.name, "birthday");
  assert.equal(set.name, "set");
  assert.deepEqual(set.options.map((option) => [option.name, option.required]), [["user", true], ["date", true]]);
});

test("/birthday reads the allowed roles from BIRTHDAY_MANAGER_ROLES", async (t) => {
  const previous = process.env.BIRTHDAY_MANAGER_ROLES;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BIRTHDAY_MANAGER_ROLES;
    } else {
      process.env.BIRTHDAY_MANAGER_ROLES = previous;
    }
  });
  process.env.BIRTHDAY_MANAGER_ROLES = "Moderador";
  const replies: Reply[] = [];
  const interaction = {
    guildId: "guild",
    inGuild: () => true,
    member: { roles: { cache: new Collection([["role-admin", { id: "role-admin", name: "Admin" }]]) } },
    options: { getSubcommandGroup: () => null, getSubcommand: () => "set" },
    reply: async (response: Reply) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  await birthdayCommand.execute(interaction, {} as never);

  assert.match(content(replies[0]), /don't have a role/);
});

test("/birthday routes the content subcommands to the collection", async () => {
  const message = setup({ subcommand: ["message", "add"], strings: { text: "С днём рождения!" } });
  await message.run();
  assert.deepEqual(message.collection, [{ guildId: "guild", addedBy: "admin-user", type: "message", text: "С днём рождения!" }]);

  const video = setup({ subcommand: ["video", "add"], strings: { link: "https://youtu.be/dQw4w9WgXcQ" } });
  await video.run();
  assert.equal(video.collection[0]?.type, "video");

  const list = setup({ subcommand: ["content", "list"] });
  await list.run();
  assert.match(content(list.replies[0]), /collection is empty/);

  const remove = setup({ subcommand: ["content", "remove"] });
  await remove.run();
  assert.match(content(remove.replies[0]), /no item 1/);
});

test("/birthday content subcommands require an allowed role", async () => {
  for (const subcommand of [["message", "add"], ["video", "add"], ["content", "list"], ["content", "remove"]] as [string | null, string][]) {
    const { run, replies, collection: added } = setup({ subcommand, roles: [{ id: "role-member", name: "Member" }], strings: { text: "Oi" } });

    await run();

    assert.deepEqual(added, []);
    assert.match(content(replies[0]), /don't have a role/);
  }
});

const SAVED_BIRTHDAYS: BirthdayEntry[] = [
  { userId: "zoe", username: "zoe", day: 6, month: 10 },
  { userId: "bia", username: "bia", day: 8, month: 10 },
  { userId: "caio", username: "caio", day: 7, month: 10 },
  { userId: "ana", username: "ana", day: 25, month: 12 },
];

function embedDescription(response: Reply | undefined): string {
  const embed = typeof response === "object" ? (response.embeds?.[0] as { data: { description?: string } } | undefined) : undefined;
  return embed?.data.description ?? "";
}

test("/birthday list shows everyone the next birthdays first, without years or pings", async () => {
  // Any member can list, even without an allowed role.
  const { run, replies } = setup({ subcommand: [null, "list"], roles: [{ id: "role-member", name: "Member" }], birthdays: SAVED_BIRTHDAYS });

  await run();

  const reply = replies[0] as InteractionReplyOptions;
  assert.equal(reply.flags, undefined);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.deepEqual(embedDescription(reply).split("\n"), [
    "🎂 **07/10** — <@caio> · today!",
    "🎈 **08/10** — <@bia> · tomorrow",
    "🎈 **25/12** — <@ana> · in 79 days",
    "🎈 **06/10** — <@zoe> · in 364 days",
  ]);
});

test("/birthday list says when no birthdays are saved", async () => {
  const { run, replies } = setup({ subcommand: [null, "list"] });

  await run();

  assert.match(content(replies[0]), /No birthdays saved yet/);
});

test("/birthday list shortens a list that does not fit", async () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ userId: `${100_000_000_000_000_000n + BigInt(i)}`, username: `user${i}`, day: 1 + (i % 28), month: 1 + (i % 12) }));
  const { run, replies } = setup({ subcommand: [null, "list"], birthdays: many });

  await run();

  const description = embedDescription(replies[0]);
  assert.ok(description.length <= 4096);
  assert.match(description.split("\n").at(-1) ?? "", /^…and \d+ more\.$/);
});

test("/birthday list says birthdays cannot be read when the database is unavailable", async () => {
  for (const options of [{ databaseReady: false }, { birthdays: new Error("connection closed") }]) {
    const { run, replies } = setup({ subcommand: [null, "list"], ...options });

    await run();

    assert.ok(isEphemeral(replies[0]));
    assert.match(content(replies[0]), /cannot be read right now/);
  }
});
