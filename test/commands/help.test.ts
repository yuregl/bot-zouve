import assert from "node:assert/strict";
import { test } from "node:test";
import type { APIEmbed, ChatInputCommandInteraction, InteractionReplyOptions } from "discord.js";
import { helpCommand } from "../../src/commands/help.js";
import { commands } from "../../src/commands/index.js";
import type { MusicManager } from "../../src/music/music-manager.js";

async function helpText(): Promise<string> {
  let response: InteractionReplyOptions | undefined;
  const interaction = {
    reply: async (reply: InteractionReplyOptions) => {
      response = reply;
    },
  } as unknown as ChatInputCommandInteraction;

  await helpCommand.execute(interaction, {} as MusicManager);

  const embed = response?.embeds?.[0];
  const data = (embed && "toJSON" in embed ? embed.toJSON() : embed) as APIEmbed | undefined;
  return data?.description ?? "";
}

test("/help describes every registered command", async () => {
  const text = await helpText();

  for (const name of commands.keys()) {
    assert.match(text, new RegExp(`\`/${name}[ \`]`), `/help does not mention /${name}`);
  }
});

test("/help mentions where music commands work", async () => {
  assert.match(await helpText(), /#zouve-music/);
});
