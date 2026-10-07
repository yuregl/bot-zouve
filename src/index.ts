import { Client, Events, GatewayIntentBits } from "discord.js";
import { startBirthdayAnnouncer } from "./birthdays/birthday-announcer.js";
import { registerCommands } from "./commands/index.js";
import { readAnnounceTime, readTimeouts } from "./infra/config.js";
import { createLogger } from "./infra/logger.js";
import { connectMongo, isMongoConnected } from "./infra/db/mongo.js";
import { checkYouTubeVideo } from "./infra/youtube.js";
import { MusicManager } from "./music/music-manager.js";
import { findMusicChannel } from "./music/music-channel.js";
import { watchVoicePresence } from "./music/voice-presence.js";
import { createBirthdayContentRepository } from "./repositories/birthday-content-repository.js";
import { createBirthdayRepository } from "./repositories/birthday-repository.js";

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

// Fail at startup when a time variable is invalid, instead of misbehaving later.
const musicManager = new MusicManager(undefined, readTimeouts());
const announceTime = readAnnounceTime();

registerCommands(client, musicManager);
watchVoicePresence(client, musicManager);

client.on(Events.Error, (error) => logger.error("Discord client error", undefined, error));
client.on(Events.Warn, (message) => logger.warn(message));

client.once(Events.ClientReady, async (readyClient) => {
  logger.info("Bot connected", { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size });

  startBirthdayAnnouncer(
    () => readyClient.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name, channel: findMusicChannel(guild) })),
    {
      birthdays: createBirthdayRepository(),
      content: createBirthdayContentRepository(),
      checkVideo: (videoUrl) => checkYouTubeVideo(videoUrl),
      isDatabaseReady: isMongoConnected,
      announceTime,
    },
  );
});

// Runs in the background: the music commands work while the database is unavailable.
void connectMongo();

await client.login(token);
