import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { BotCommand } from "./command.js";
import { type BirthdayRepository, formatBirthdayDate, parseBirthdayDate } from "../birthdays/birthday.js";
import { canManageBirthdays, parseRoleList, type RoleInfo } from "../birthdays/permissions.js";
import { isMongoConnected } from "../infra/db/mongo.js";
import { createLogger } from "../infra/logger.js";
import { createBirthdayRepository } from "../repositories/birthday-repository.js";

const logger = createLogger("birthday");

const UNAVAILABLE = "Birthdays cannot be saved right now. Try again later.";

export interface BirthdayDependencies {
  repository: BirthdayRepository;
  /** Lowercased role names and role IDs allowed to set birthdays, from BIRTHDAY_MANAGER_ROLES. */
  managerRoles: string[];
  isDatabaseReady: () => boolean;
  today?: Date;
}

let defaultRepository: BirthdayRepository | undefined;

function defaultDependencies(): BirthdayDependencies {
  defaultRepository ??= createBirthdayRepository();
  return {
    repository: defaultRepository,
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

  if (dependencies.managerRoles.length === 0) {
    await interaction.reply({
      content: "Birthdays are not set up on this bot yet. Ask whoever runs it to set BIRTHDAY_MANAGER_ROLES.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageBirthdays(memberRoles(interaction), dependencies.managerRoles)) {
    await interaction.reply({ content: "You don't have a role that can set birthdays.", flags: MessageFlags.Ephemeral });
    return;
  }

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
    ),
  execute: (interaction) => executeBirthday(interaction),
};
