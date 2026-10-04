import { Client, Events, GatewayIntentBits } from "discord.js";
import { registerCommands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("A variável DISCORD_TOKEN não foi definida.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

registerCommands(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.info(`Bot conectado como ${readyClient.user.tag}.`);
});

await client.login(token);
