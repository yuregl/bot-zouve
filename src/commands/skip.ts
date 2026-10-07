import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  ComponentType,
  type Guild,
  type Message,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import type { MusicManager, SkipResult } from "../music/music-manager.js";
import type { Track } from "../music/track.js";
import { countListeners } from "../music/voice-presence.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("skip");

const VOTE_BUTTON_ID = "skip-vote";

interface SkipVote {
  track: Track;
  voters: Set<string>;
  message: Message;
  stop(reason: string): void;
}

/** Open votes by guild; a guild has at most one at a time. */
const activeVotes = new Map<string, SkipVote>();

/** Votes needed to skip: more than half of the people in the voice channel. */
export function votesNeeded(listeners: number): number {
  return Math.floor(listeners / 2) + 1;
}

function describeSkip(result: SkipResult): string {
  return result.next
    ? `Skipped **${result.skipped.title}**. Up next: **${result.next.title}**.`
    : `Skipped **${result.skipped.title}**. The queue is now empty.`;
}

function voteContent(vote: Pick<SkipVote, "track" | "voters">, needed: number): string {
  return `Vote to skip **${vote.track.title}**: ${vote.voters.size}/${needed}. Press the button to vote.`;
}

function voteButtons() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(VOTE_BUTTON_ID).setLabel("Skip").setStyle(ButtonStyle.Primary),
    ),
  ];
}

/**
 * Adds a member's vote and skips the track once enough people voted. The votes needed are
 * counted again each time, since people may have joined or left the voice channel.
 */
function castVote(
  vote: SkipVote,
  userId: string,
  guild: Guild,
  musicManager: MusicManager,
): { status: "already-voted" | "counted" | "track-changed"; needed: number } | { status: "skipped"; text: string } {
  const botChannelId = musicManager.getVoiceChannelId(guild.id);
  const needed = votesNeeded(botChannelId ? countListeners(guild, botChannelId) : 0);

  if (musicManager.getQueue(guild.id)?.current !== vote.track) {
    return { status: "track-changed", needed };
  }

  if (vote.voters.has(userId)) {
    return { status: "already-voted", needed };
  }

  vote.voters.add(userId);

  if (vote.voters.size < needed) {
    return { status: "counted", needed };
  }

  const result = musicManager.skip(guild.id);
  logger.info("Skip vote passed", { guild: guild.name, track: vote.track.title, votes: vote.voters.size, needed });
  return { status: "skipped", text: result ? `Vote passed. ${describeSkip(result)}` : "Vote passed, but the track already ended." };
}

async function handleVoteClick(click: ButtonInteraction, vote: SkipVote, guild: Guild, musicManager: MusicManager) {
  const botChannelId = musicManager.getVoiceChannelId(guild.id);

  if (!botChannelId || guild.voiceStates.cache.get(click.user.id)?.channelId !== botChannelId) {
    await click.reply({ content: "Join the bot's voice channel to vote.", flags: MessageFlags.Ephemeral });
    return;
  }

  const outcome = castVote(vote, click.user.id, guild, musicManager);

  switch (outcome.status) {
    case "already-voted":
      await click.reply({ content: "You already voted to skip this track.", flags: MessageFlags.Ephemeral });
      return;
    case "counted":
      await click.update({ content: voteContent(vote, outcome.needed) });
      return;
    case "track-changed":
      vote.stop("track-changed");
      await click.update({ content: `The vote to skip **${vote.track.title}** ended because the track is over.`, components: [] });
      return;
    case "skipped":
      vote.stop("passed");
      await click.update({ content: outcome.text, components: [] });
  }
}

async function startVote(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  track: Track,
  musicManager: MusicManager,
): Promise<void> {
  const draft = { track, voters: new Set([interaction.user.id]) };
  const botChannelId = musicManager.getVoiceChannelId(guild.id);
  const needed = votesNeeded(botChannelId ? countListeners(guild, botChannelId) : 0);

  if (draft.voters.size >= needed) {
    const result = musicManager.skip(guild.id);
    await interaction.reply(result ? describeSkip(result) : "There is no music playing right now.");
    return;
  }

  const response = await interaction.reply({ content: voteContent(draft, needed), components: voteButtons(), withResponse: true });
  const message = response.resource?.message;

  if (!message) {
    logger.warn("Could not read the vote message; the vote cannot be counted", { guild: guild.name });
    return;
  }

  const timeoutMs = musicManager.timeouts.skipVoteMs;
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: timeoutMs });
  const vote: SkipVote = { ...draft, message, stop: (reason) => collector.stop(reason) };
  activeVotes.set(guild.id, vote);
  logger.info("Skip vote started", { guild: guild.name, user: interaction.user.tag, track: track.title, needed });

  collector.on("collect", (click: ButtonInteraction) => {
    handleVoteClick(click, vote, guild, musicManager).catch((error) =>
      logger.error("Could not count a skip vote", { guild: guild.name }, error),
    );
  });

  collector.on("end", (_collected, reason: string) => {
    if (activeVotes.get(guild.id) === vote) {
      activeVotes.delete(guild.id);
    }

    if (reason === "time") {
      logger.info("Skip vote expired", { guild: guild.name, track: track.title, votes: vote.voters.size });
      message
        .edit({ content: `The vote to skip **${track.title}** expired with ${vote.voters.size}/${needed} votes.`, components: [] })
        .catch((error) => logger.error("Could not close the skip vote", { guild: guild.name }, error));
    }
  });
}

/** Counts a /skip from a member as a vote in the guild's open vote. */
async function voteWithCommand(
  interaction: ChatInputCommandInteraction,
  vote: SkipVote,
  guild: Guild,
  musicManager: MusicManager,
): Promise<void> {
  const outcome = castVote(vote, interaction.user.id, guild, musicManager);

  if (outcome.status === "already-voted") {
    await interaction.reply({ content: "You already voted to skip this track.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (outcome.status === "skipped") {
    vote.stop("passed");
    await vote.message.edit({ content: outcome.text, components: [] });
    await interaction.reply(outcome.text);
    return;
  }

  if (outcome.status === "track-changed") {
    vote.stop("track-changed");
    await interaction.reply({ content: "That track already ended. Use `/skip` again for the current one.", flags: MessageFlags.Ephemeral });
    return;
  }

  await vote.message.edit({ content: voteContent(vote, outcome.needed) });
  await interaction.reply({ content: `Vote counted: ${vote.voters.size}/${outcome.needed}.`, flags: MessageFlags.Ephemeral });
}

export const skipCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skips the current track, or opens a vote when someone else requested it."),
  async execute(interaction, musicManager) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!interaction.inGuild() || !guild || !guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await requireMusicChannel(interaction, guild))) {
      return;
    }

    const botVoiceChannelId = musicManager.getVoiceChannelId(guildId);

    if (!botVoiceChannelId) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to skip tracks.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = musicManager.getQueue(guildId)?.current;

    if (!current) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (current.requestedBy !== interaction.user.id) {
      const openVote = activeVotes.get(guildId);

      if (openVote?.track === current) {
        await voteWithCommand(interaction, openVote, guild, musicManager);
        return;
      }

      openVote?.stop("track-changed");
      await startVote(interaction, guild, current, musicManager);
      return;
    }

    const result = musicManager.skip(guildId);

    if (!result) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Track skipped", { guild: guild.name, user: interaction.user.tag, track: result.skipped.title });
    await interaction.reply(describeSkip(result));
  },
};
