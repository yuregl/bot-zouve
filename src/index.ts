import { Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("A variável DISCORD_TOKEN não foi definida.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  console.info(`Bot conectado como ${readyClient.user.tag}.`);
});

await client.login(token);
