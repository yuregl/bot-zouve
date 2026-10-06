import assert from "node:assert/strict";
import { test } from "node:test";
import { Events, MessageFlags, type Client, type InteractionReplyOptions } from "discord.js";
import { commands, registerCommands } from "../../src/commands/index.js";
import type { MusicManager } from "../../src/music/music-manager.js";

/** A Discord client that keeps the handlers the bot registers so the test can call them. */
function fakeClient() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
  const client = {
    once: (event: string, handler: (...args: unknown[]) => Promise<void>) => handlers.set(event, handler),
    on: (event: string, handler: (...args: unknown[]) => Promise<void>) => handlers.set(event, handler),
  } as unknown as Client;
  return { client, handlers };
}

test("registerCommands registers every slash command with Discord when the bot is ready", async () => {
  const { client, handlers } = fakeClient();
  let registered: { name: string }[] = [];

  registerCommands(client, {} as MusicManager);
  await handlers.get(Events.ClientReady)?.({
    application: {
      commands: {
        set: async (list: { name: string }[]) => {
          registered = list;
        },
      },
    },
  });

  assert.deepEqual(
    new Set(registered.map((command) => command.name)),
    new Set(["help", "leave", "p", "pause", "play", "queue", "remove", "resume", "seek", "setup", "skip", "stop"]),
  );
});

function fakeInteraction(commandName: string, options: { failFirstReply?: boolean } = {}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  let attempts = 0;
  const interaction = {
    commandName,
    isChatInputCommand: () => true,
    options: { data: [] },
    user: { tag: "user#0001" },
    guild: { name: "Test guild" },
    channel: null,
    channelId: "channel",
    replied: false,
    deferred: false,
    reply: async (response: string | InteractionReplyOptions) => {
      attempts++;
      if (options.failFirstReply && attempts === 1) {
        throw new Error("Unknown interaction");
      }
      replies.push(response);
    },
  };
  return { interaction, replies };
}

test("registerCommands runs the command that matches the interaction", async () => {
  const { client, handlers } = fakeClient();
  const { interaction, replies } = fakeInteraction("help");

  registerCommands(client, {} as MusicManager);
  await handlers.get(Events.InteractionCreate)?.(interaction);

  assert.equal(replies.length, 1);
  assert.ok(typeof replies[0] === "object" && replies[0].embeds?.length === 1);
});

test("registerCommands tells the user when a command fails", async () => {
  const { client, handlers } = fakeClient();
  const { interaction, replies } = fakeInteraction("help", { failFirstReply: true });

  registerCommands(client, {} as MusicManager);
  await handlers.get(Events.InteractionCreate)?.(interaction);

  assert.deepEqual(replies, [
    { content: "This command could not be run. Please try again.", flags: MessageFlags.Ephemeral },
  ]);
});

test("registerCommands ignores unknown commands and other interactions", async () => {
  const { client, handlers } = fakeClient();
  const unknown = fakeInteraction("unknown");
  const button = { ...fakeInteraction("help").interaction, isChatInputCommand: () => false };

  registerCommands(client, {} as MusicManager);
  await handlers.get(Events.InteractionCreate)?.(unknown.interaction);
  await handlers.get(Events.InteractionCreate)?.(button);

  assert.deepEqual(unknown.replies, []);
  assert.equal(commands.has("unknown"), false);
});

test("every command except /help refuses to run outside a server", async () => {
  for (const [name, command] of commands) {
    if (name === "help") {
      continue;
    }
    const replies: InteractionReplyOptions[] = [];
    const interaction = {
      guild: null,
      guildId: null,
      inGuild: () => false,
      reply: async (response: InteractionReplyOptions) => {
        replies.push(response);
      },
    };

    await command.execute(interaction as never, {} as MusicManager);

    assert.deepEqual(
      replies,
      [{ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral }],
      `/${name}`,
    );
  }
});
