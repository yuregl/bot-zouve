import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import type { MusicManager } from "../music/music-manager.js";

export interface BotCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(
    interaction: ChatInputCommandInteraction,
    musicManager: MusicManager,
  ): Promise<void>;
}
