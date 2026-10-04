import { Collection, Events, type Client } from "discord.js";
import type { BotCommand } from "./command.js";
import { helpCommand } from "./help.js";

const commands = new Collection<string, BotCommand>([
  [helpCommand.data.name, helpCommand],
]);

export function registerCommands(client: Client): void {
  client.once(Events.ClientReady, async (readyClient) => {
    try {
      await readyClient.application.commands.set(
        commands.map((command) => command.data.toJSON()),
      );
      console.info(`Comandos registrados: ${commands.map((command) => `/${command.data.name}`).join(", ")}`);
    } catch (error) {
      console.error("Falha ao registrar os comandos slash:", error);
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

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Falha ao executar /${interaction.commandName}:`, error);

      const response = {
        content: "Não foi possível executar esse comando. Tente novamente.",
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  });
}
