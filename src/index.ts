import { Client, Events, GatewayIntentBits } from "discord.js";
import { registerCommands } from "./commands/index.js";
import { readTimeouts } from "./infra/config.js";
import { createLogger } from "./infra/logger.js";
import { MusicManager } from "./music/music-manager.js";
import { watchVoicePresence } from "./music/voice-presence.js";

const logger = createLogger("bot");

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", undefined, reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception; exiting", undefined, error);
  process.exit(1);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("The DISCORD_TOKEN environment variable is not set.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Fails at startup when a timeout variable is invalid, instead of misbehaving later.
const musicManager = new MusicManager(undefined, readTimeouts());

registerCommands(client, musicManager);
watchVoicePresence(client, musicManager);

client.on(Events.Error, (error) => logger.error("Discord client error", undefined, error));
client.on(Events.Warn, (message) => logger.warn(message));

client.once(Events.ClientReady, async (readyClient) => {
  logger.info("Bot connected", { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size });
});

await client.login(token);
