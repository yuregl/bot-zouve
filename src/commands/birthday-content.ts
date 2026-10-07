import { type ChatInputCommandInteraction, EmbedBuilder, MessageFlags, userMention } from "discord.js";
import {
  type BirthdayContentRepository,
  describeContent,
  type NewBirthdayContent,
  parseBirthdayMessage,
} from "../birthdays/birthday-content.js";
import { createLogger } from "../infra/logger.js";
import { getYouTubeVideoId } from "../infra/youtube.js";

const logger = createLogger("birthday-content");

const UNAVAILABLE = "Birthday content cannot be changed right now. Try again later.";

// Keeps the list within an embed's 4096-character description.
const MAX_LIST_LENGTH = 3900;

export interface ContentContext {
  interaction: ChatInputCommandInteraction;
  guildId: string;
  repository: BirthdayContentRepository;
  isDatabaseReady: () => boolean;
}

async function replyPrivately(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  // Links are shown as text, without previews.
  await interaction.reply({ content, flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds });
}

/** Replies that the database is unavailable and returns false when it cannot be used. */
async function requireDatabase({ interaction, guildId, isDatabaseReady }: ContentContext): Promise<boolean> {
  if (isDatabaseReady()) {
    return true;
  }

  logger.warn("Birthday content not changed because the database is not connected", { guild: guildId });
  await replyPrivately(interaction, UNAVAILABLE);
  return false;
}

async function add(context: ContentContext, content: NewBirthdayContent): Promise<void> {
  const { interaction, guildId, repository } = context;

  if (!(await requireDatabase(context))) {
    return;
  }

  let result;
  try {
    result = await repository.add(content);
  } catch (error) {
    logger.error("Could not add birthday content", { guild: guildId, type: content.type }, error);
    await replyPrivately(interaction, UNAVAILABLE);
    return;
  }

  if (result === "duplicate") {
    await replyPrivately(interaction, "This video is already in the birthday collection.");
    return;
  }

  logger.info("Birthday content added", { guild: guildId, type: content.type, addedBy: interaction.user.id });
  await replyPrivately(interaction, `Added to the birthday collection: ${describeContent(content, 200)}`);
}

/** /birthday message add */
export async function addMessage(context: ContentContext): Promise<void> {
  const { interaction, guildId } = context;
  const parsed = parseBirthdayMessage(interaction.options.getString("text", true));

  if ("error" in parsed) {
    await replyPrivately(interaction, parsed.error);
    return;
  }

  await add(context, { guildId, addedBy: interaction.user.id, type: "message", text: parsed.text });
}

/** /birthday video add */
export async function addVideo(context: ContentContext): Promise<void> {
  const { interaction, guildId } = context;
  const videoId = getYouTubeVideoId(interaction.options.getString("link", true));

  if (!videoId) {
    await replyPrivately(interaction, "Send a link to a single YouTube video, like https://www.youtube.com/watch?v=dQw4w9WgXcQ.");
    return;
  }

  await add(context, {
    guildId,
    addedBy: interaction.user.id,
    type: "video",
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
  });
}

/** /birthday content list */
export async function listContent(context: ContentContext): Promise<void> {
  const { interaction, guildId, repository } = context;

  if (!(await requireDatabase(context))) {
    return;
  }

  let items;
  try {
    items = await repository.list(guildId);
  } catch (error) {
    logger.error("Could not list birthday content", { guild: guildId }, error);
    await replyPrivately(interaction, UNAVAILABLE);
    return;
  }

  if (items.length === 0) {
    await replyPrivately(interaction, "The birthday collection is empty. Add content with `/birthday message add` or `/birthday video add`.");
    return;
  }

  const lines: string[] = [];
  let length = 0;
  for (const [index, item] of items.entries()) {
    const warning = item.unavailable ? " ⚠️ unavailable" : "";
    const line = `**${index + 1}.** ${describeContent(item)}${warning} — ${userMention(item.addedBy)}`;
    if (length + line.length + 1 > MAX_LIST_LENGTH) {
      lines.push(`…and ${items.length - index} more.`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle("Birthday collection")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${items.length} ${items.length === 1 ? "item" : "items"} · remove one with /birthday content remove` });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

/** /birthday content remove */
export async function removeContent(context: ContentContext): Promise<void> {
  const { interaction, guildId, repository } = context;
  const number = interaction.options.getInteger("number", true);

  if (!(await requireDatabase(context))) {
    return;
  }

  let removed;
  try {
    const items = await repository.list(guildId);
    const item = items[number - 1];

    if (!item) {
      await replyPrivately(
        interaction,
        `There is no item ${number}; the collection has ${items.length} ${items.length === 1 ? "item" : "items"}. Use \`/birthday content list\` to see the numbers.`,
      );
      return;
    }

    removed = (await repository.remove(guildId, item.id)) ? item : undefined;
  } catch (error) {
    logger.error("Could not remove birthday content", { guild: guildId, number }, error);
    await replyPrivately(interaction, UNAVAILABLE);
    return;
  }

  if (!removed) {
    await replyPrivately(interaction, "That item was already removed. Use `/birthday content list` to see the current numbers.");
    return;
  }

  logger.info("Birthday content removed", { guild: guildId, type: removed.type, removedBy: interaction.user.id });
  await replyPrivately(interaction, `Removed from the birthday collection: ${describeContent(removed, 200)}`);
}
