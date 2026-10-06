import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { setupCommand } from "../../src/commands/setup.js";
import type { MusicManager } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";

interface Options {
  channelExists?: boolean;
  memberCanManage?: boolean;
  botCanManage?: boolean;
  createFails?: boolean;
  botCanPost?: boolean;
}

function setup(options: Options = {}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const created: { name: string; type: ChannelType }[] = [];

  const newChannel = {
    id: "new",
    toString: () => "<#new>",
    permissionsFor: () => ({ has: () => options.botCanPost ?? true }),
  };

  const guild = {
    name: "Test guild",
    members: { me: { permissions: { has: () => options.botCanManage ?? true } } },
    channels: {
      cache: new Collection(
        options.channelExists
          ? [["music", { id: "music", name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText, toString: () => "<#music>" }]]
          : [],
      ),
      create: async (channel: { name: string; type: ChannelType }) => {
        if (options.createFails) {
          throw new Error("Missing Permissions");
        }
        created.push({ name: channel.name, type: channel.type });
        return newChannel;
      },
    },
  };

  const interaction = {
    guild,
    user: { tag: "admin#0001" },
    inGuild: () => true,
    memberPermissions: { has: () => options.memberCanManage ?? true },
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  return { run: () => setupCommand.execute(interaction, {} as MusicManager), replies, created };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

test("/setup creates the music text channel", async () => {
  const { run, replies, created } = setup();

  await run();

  assert.deepEqual(created, [{ name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText }]);
  assert.equal(replies[0], "Music channel created: <#new>. Use `/play` there.");
});

test("/setup warns when the bot cannot post in the channel it created", async () => {
  const { run, replies } = setup({ botCanPost: false });

  await run();

  assert.match(String(replies[0]), /can't send messages or embeds there/);
});

test("/setup points to the existing channel instead of creating another", async () => {
  const { run, replies, created } = setup({ channelExists: true });

  await run();

  assert.deepEqual(created, []);
  assert.ok(isEphemeral(replies[0]));
  assert.match(String((replies[0] as InteractionReplyOptions).content), /already exists: <#music>/);
});

test("/setup refuses without Manage Channels and reports a failed creation", async () => {
  for (const options of [{ memberCanManage: false }, { botCanManage: false }, { createFails: true }]) {
    const { run, replies, created } = setup(options);

    await run();

    assert.deepEqual(created, [], JSON.stringify(options));
    assert.ok(isEphemeral(replies[0]), JSON.stringify(options));
  }
});
