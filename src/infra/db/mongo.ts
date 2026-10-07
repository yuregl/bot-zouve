import mongoose from "mongoose";
import { createLogger } from "../logger.js";

const logger = createLogger("mongo");

// How long to wait for the database on each attempt, and between failed attempts at startup.
const SERVER_SELECTION_TIMEOUT_MS = 5000;
export const RETRY_DELAY_MS = 30_000;

// Fail at once while disconnected instead of queueing operations, so /birthday can say the
// database is unavailable right away.
mongoose.set("bufferCommands", false);
// Models are registered before the connection exists, and without the queue Mongoose's
// automatic index creation fails silently; connectMongo creates the indexes instead.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

type Connect = (uri: string) => Promise<unknown>;
type CreateIndexes = () => Promise<unknown>;

const connectWithMongoose: Connect = (uri) => mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });

/** Creates the indexes of every registered model, such as the unique ones, and their collections. */
const createModelIndexes: CreateIndexes = () =>
  Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));

/**
 * Connects to MongoDB at `MONGODB_URI`, retrying in the background until it works, and then
 * creates the models' indexes. The bot keeps running without the database; only birthdays
 * are unavailable. The connection string is never logged, since it holds the password.
 */
export async function connectMongo(
  uri = process.env.MONGODB_URI,
  connect: Connect = connectWithMongoose,
  createIndexes: CreateIndexes = createModelIndexes,
): Promise<void> {
  if (!uri) {
    logger.warn("MONGODB_URI is not set; birthdays are disabled");
    return;
  }

  try {
    await connect(uri);
  } catch (error) {
    logger.error(`Could not connect to MongoDB; retrying in ${RETRY_DELAY_MS / 1000}s`, undefined, error);
    setTimeout(() => void connectMongo(uri, connect, createIndexes), RETRY_DELAY_MS);
    return;
  }

  logger.info("Connected to MongoDB");

  try {
    await createIndexes();
  } catch (error) {
    // The connection stays open; without the indexes, duplicates are not refused.
    logger.error("Could not create the database indexes", undefined, error);
  }
}

/** Whether the database can be used now. */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
