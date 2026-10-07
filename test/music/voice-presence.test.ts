import assert from "node:assert/strict";
import { test } from "node:test";
import { Collection, Events, type Client, type Guild } from "discord.js";
import { countListeners, watchVoicePresence } from "../../src/music/voice-presence.js";

function voiceState(id: string, channelId: string | null, bot = false) {
  return [id, { channelId, member: { user: { bot } } }] as const;
}

function guildWith(states: ReturnType<typeof voiceState>[]): Guild {
  return { id: "guild", voiceStates: { cache: new Collection(states) } } as unknown as Guild;
}

test("countListeners counts the people in the channel, not bots or other channels", () => {
  const guild = guildWith([
    voiceState("bot", "voice-1", true),
    voiceState("ana", "voice-1"),
    voiceState("bia", "voice-1"),
    voiceState("caio", "voice-2"),
    voiceState("other-bot", "voice-1", true),
  ]);

  assert.equal(countListeners(guild, "voice-1"), 2);
  assert.equal(countListeners(guild, "voice-3"), 0);
});

function watch(botChannelId: string | undefined, states: ReturnType<typeof voiceState>[]) {
  let handler: ((oldState: unknown, newState: unknown) => void) | undefined;
  const client = {
    on: (event: string, listener: typeof handler) => {
      assert.equal(event, Events.VoiceStateUpdate);
      handler = listener;
    },
  } as unknown as Client;
  const updates: number[] = [];
  watchVoicePresence(client, {
    getVoiceChannelId: () => botChannelId,
    updateListeners: (_guildId, listeners) => {
      updates.push(listeners);
    },
  });
  const guild = guildWith(states);
  const move = (from: string | null, to: string | null) => handler?.({ channelId: from, guild }, { channelId: to, guild });
  return { move, updates };
}

test("watchVoicePresence reports the people left when someone leaves or joins the bot's channel", () => {
  const { move, updates } = watch("voice-1", [voiceState("bot", "voice-1", true)]);

  move("voice-1", null);
  move(null, "voice-1");

  assert.deepEqual(updates, [0, 0]);
});

test("watchVoicePresence ignores other channels and guilds where the bot is not connected", () => {
  const elsewhere = watch("voice-1", []);
  elsewhere.move("voice-2", "voice-3");

  const disconnected = watch(undefined, []);
  disconnected.move("voice-1", null);

  assert.deepEqual([...elsewhere.updates, ...disconnected.updates], []);
});
