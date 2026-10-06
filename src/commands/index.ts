import {
  type Client,
  Collection,
  Events,
  type InteractionReplyOptions,
  MessageFlags,
} from "discord.js";
import type { BotCommand } from "./command.js";
import type { MusicManager } from "../music/music-manager.js";
import { helpCommand } from "./help.js";
import { leaveCommand } from "./leave.js";
import { pauseCommand } from "./pause.js";
import { playAliasCommand, playCommand } from "./play.js";
import { queueCommand } from "./queue.js";
import { removeCommand } from "./remove.js";
import { resumeCommand } from "./resume.js";
import { seekCommand } from "./seek.js";
import { setupCommand } from "./setup.js";
import { skipCommand } from "./skip.js";
import { stopCommand } from "./stop.js";
import { createLogger } from "../infra/logger.js";

const logger = createLogger("commands");

export const commands = new Collection<string, BotCommand>([
  [helpCommand.data.name, helpCommand],
  [leaveCommand.data.name, leaveCommand],
  [pauseCommand.data.name, pauseCommand],
  [playCommand.data.name, playCommand],
  [playAliasCommand.data.name, playAliasCommand],
  [queueCommand.data.name, queueCommand],
  [removeCommand.data.name, removeCommand],
  [resumeCommand.data.name, resumeCommand],
  [seekCommand.data.name, seekCommand],
  [setupCommand.data.name, setupCommand],
  [skipCommand.data.name, skipCommand],
  [stopCommand.data.name, stopCommand],
]);

export function registerCommands(client: Client, musicManager: MusicManager): void {
  client.once(Events.ClientReady, async (readyClient) => {
    try {
      await readyClient.application.commands.set(
        commands.map((command) => command.data.toJSON()),
      );
      logger.info("Registered commands", { commands: commands.map((command) => `/${command.data.name}`) });
    } catch (error) {
      logger.error("Failed to register slash commands", undefined, error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    const context = {
      command: `/${interaction.commandName}`,
      options: Object.fromEntries(interaction.options.data.map((option) => [option.name, option.value])),
      user: interaction.user.tag,
      guild: interaction.guild?.name ?? "DM",
      channel: interaction.channel && "name" in interaction.channel ? interaction.channel.name : interaction.channelId,
    };
    logger.info("Command received", context);

    try {
      await command.execute(interaction, musicManager);
    } catch (error) {
      logger.error("Command failed", context, error);

      const response: InteractionReplyOptions = {
        content: "This command could not be run. Please try again.",
        flags: MessageFlags.Ephemeral,
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response);
        } else {
          await interaction.reply(response);
        }
      } catch (replyError) {
        logger.error("Could not send the failure reply", context, replyError);
      }
    }
  });
}
