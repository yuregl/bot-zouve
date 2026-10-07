import { type ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { BotCommand } from "./command.js";
import {
  BIRTHDAY_TIME_ZONE,
  type BirthdayRepository,
  type CalendarDay,
  calendarDayIn,
  formatBirthdayDate,
  parseBirthdayDate,
  sortByNextBirthday,
} from "../birthdays/birthday.js";
import { type BirthdayContentRepository, MAX_MESSAGE_LENGTH } from "../birthdays/birthday-content.js";
import { canManageBirthdays, parseRoleList, type RoleInfo } from "../birthdays/permissions.js";
import { isMongoConnected } from "../infra/db/mongo.js";
import { createLogger } from "../infra/logger.js";
import { createBirthdayContentRepository } from "../repositories/birthday-content-repository.js";
import { createBirthdayRepository } from "../repositories/birthday-repository.js";
import { addMessage, addVideo, type ContentContext, listContent, removeContent } from "./birthday-content.js";

const logger = createLogger("birthday");

const UNAVAILABLE = "Birthdays cannot be saved right now. Try again later.";

// Keeps the list within an embed's 4096-character description.
const MAX_LIST_LENGTH = 3900;

export interface BirthdayDependencies {
  repository: BirthdayRepository;
  contentRepository: BirthdayContentRepository;
  /** Lowercased role names and role IDs allowed to set birthdays, from BIRTHDAY_MANAGER_ROLES. */
  managerRoles: string[];
  isDatabaseReady: () => boolean;
  today?: Date;
}

let defaultRepository: BirthdayRepository | undefined;
let defaultContentRepository: BirthdayContentRepository | undefined;

function defaultDependencies(): BirthdayDependencies {
  defaultRepository ??= createBirthdayRepository();
  defaultContentRepository ??= createBirthdayContentRepository();
  return {
    repository: defaultRepository,
    contentRepository: defaultContentRepository,
    managerRoles: parseRoleList(process.env.BIRTHDAY_MANAGER_ROLES),
    isDatabaseReady: isMongoConnected,
  };
}

/** The roles of the member who used the command, by ID and name. */
function memberRoles(interaction: ChatInputCommandInteraction): RoleInfo[] {
  const roles = interaction.member?.roles;

  if (!roles) {
    return [];
  }

  // Without a cached member, Discord sends only the role IDs.
  if (Array.isArray(roles)) {
    return roles.map((id) => ({ id, name: interaction.guild?.roles.cache.get(id)?.name ?? "" }));
  }

  return roles.cache.map((role) => ({ id: role.id, name: role.name }));
}

/** Runs /birthday; tests pass their own dependencies to avoid the database. */
export async function executeBirthday(
  interaction: ChatInputCommandInteraction,
  dependencies: BirthdayDependencies = defaultDependencies(),
): Promise<void> {
  const guildId = interaction.guildId;

  if (!interaction.inGuild() || !guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  // Anyone can see the server's birthdays; every other subcommand changes data.
  if (!group && subcommand === "list") {
    return listBirthdays(interaction, guildId, dependencies);
  }

  if (dependencies.managerRoles.length === 0) {
    await interaction.reply({
      content: "Birthdays are not set up on this bot yet. Ask whoever runs it to set BIRTHDAY_MANAGER_ROLES.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageBirthdays(memberRoles(interaction), dependencies.managerRoles)) {
    await interaction.reply({ content: "You don't have a role that can manage birthdays.", flags: MessageFlags.Ephemeral });
    return;
  }

  const content: ContentContext = {
    interaction,
    guildId,
    repository: dependencies.contentRepository,
    isDatabaseReady: dependencies.isDatabaseReady,
  };

  switch (group) {
    case "message":
      return addMessage(content);
    case "video":
      return addVideo(content);
    case "content":
      return subcommand === "remove" ? removeContent(content) : listContent(content);
    default:
      return setBirthday(interaction, guildId, dependencies);
  }
}

/** /birthday list: the server's birthdays, the next ones first, visible to everyone. */
async function listBirthdays(interaction: ChatInputCommandInteraction, guildId: string, dependencies: BirthdayDependencies): Promise<void> {
  if (!dependencies.isDatabaseReady()) {
    await interaction.reply({ content: "Birthdays cannot be read right now. Try again later.", flags: MessageFlags.Ephemeral });
    return;
  }

  let birthdays;
  try {
    birthdays = await dependencies.repository.list(guildId);
  } catch (error) {
    logger.error("Could not list birthdays", { guild: guildId }, error);
    await interaction.reply({ content: "Birthdays cannot be read right now. Try again later.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (birthdays.length === 0) {
    await interaction.reply("No birthdays saved yet. Someone with an allowed role can add them with `/birthday set`.");
    return;
  }

  const today = dependencies.today ? calendarDayOf(dependencies.today) : calendarDayIn(BIRTHDAY_TIME_ZONE);
  const lines: string[] = [];
  let length = 0;
  const sorted = sortByNextBirthday(birthdays, today);

  for (const [index, birthday] of sorted.entries()) {
    const line = `${birthday.daysUntil === 0 ? "🎂" : "🎈"} **${formatBirthdayDate(birthday)}** — ${userMention(birthday.userId)} · ${describeDaysUntil(birthday.daysUntil)}`;
    if (length + line.length + 1 > MAX_LIST_LENGTH) {
      lines.push(`…and ${sorted.length - index} more.`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle("🎉 Birthdays")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${birthdays.length} ${birthdays.length === 1 ? "birthday" : "birthdays"} · next ones first` });

  // Members are shown without being notified.
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

function describeDaysUntil(days: number): string {
  if (days === 0) {
    return "today!";
  }
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** The calendar day of a local date, for tests that fix "today". */
function calendarDayOf(date: Date): CalendarDay {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** /birthday set */
async function setBirthday(interaction: ChatInputCommandInteraction, guildId: string, dependencies: BirthdayDependencies): Promise<void> {
  const user = interaction.options.getUser("user", true);

  if (user.bot) {
    await interaction.reply({ content: "Bots don't have birthdays.", flags: MessageFlags.Ephemeral });
    return;
  }

  const parsed = parseBirthdayDate(interaction.options.getString("date", true), dependencies.today);

  if ("error" in parsed) {
    await interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });
    return;
  }

  if (!dependencies.isDatabaseReady()) {
    logger.warn("Birthday not saved because the database is not connected", { guild: guildId });
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }

  let result;
  try {
    result = await dependencies.repository.save({
      guildId,
      userId: user.id,
      username: user.username,
      setBy: interaction.user.id,
      ...parsed.date,
    });
  } catch (error) {
    logger.error("Could not save the birthday", { guild: guildId, user: user.id }, error);
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }

  logger.info("Birthday saved", { guild: guildId, user: user.id, setBy: interaction.user.id, result });
  await interaction.reply({
    content: `${result === "created" ? "Saved" : "Updated"} ${userMention(user.id)}'s birthday: ${formatBirthdayDate(parsed.date)}.`,
    // Show the member without notifying them.
    allowedMentions: { parse: [] },
  });
}

export const birthdayCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Manages members' birthdays.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Saves a member's birthday (requires an allowed role).")
        .addUserOption((option) => option.setName("user").setDescription("The member whose birthday it is.").setRequired(true))
        .addStringOption((option) =>
          option.setName("date").setDescription("DD/MM or DD/MM/YYYY, like 15/03 or 15/03/1998.").setRequired(true).setMaxLength(10),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("message")
        .setDescription("Birthday messages for the server's collection.")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Adds a birthday message to the collection (requires an allowed role).")
            .addStringOption((option) =>
              option.setName("text").setDescription("The message, like С днём рождения! 🎉").setRequired(true).setMaxLength(MAX_MESSAGE_LENGTH),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("video")
        .setDescription("Birthday videos for the server's collection.")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Adds a YouTube video to the collection (requires an allowed role).")
            .addStringOption((option) =>
              option.setName("link").setDescription("A link to a single YouTube video.").setRequired(true).setMaxLength(200),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("content")
        .setDescription("The server's collection of birthday messages and videos.")
        .addSubcommand((subcommand) =>
          subcommand.setName("list").setDescription("Shows the birthday messages and videos (requires an allowed role)."),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Removes a message or video by its number in /birthday content list.")
            .addIntegerOption((option) =>
              option.setName("number").setDescription("The item's number in /birthday content list.").setRequired(true).setMinValue(1),
            ),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("Shows the server's birthdays, the next ones first.")),
  execute: (interaction) => executeBirthday(interaction),
};
