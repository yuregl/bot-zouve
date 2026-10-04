import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext, error?: unknown): void;
  error(message: string, context?: LogContext, error?: unknown): void;
}

const minLevel = parseLevel(process.env.LOG_LEVEL);
const logFile = openLogFile(process.env.LOG_FILE ?? "logs/bot.log");

export function createLogger(scope: string): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext, error?: unknown) => {
    if (LEVELS[level] < LEVELS[minLevel]) {
      return;
    }

    const line = formatLogLine(new Date(), level, scope, message, context, error);
    (level === "error" || level === "warn" ? console.error : console.log)(line);
    logFile?.write(`${line}\n`);
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context, error) => log("warn", message, context, error),
    error: (message, context, error) => log("error", message, context, error),
  };
}

export function formatLogLine(
  date: Date,
  level: LogLevel,
  scope: string,
  message: string,
  context?: LogContext,
  error?: unknown,
): string {
  let line = `${date.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    line += ` ${JSON.stringify(context)}`;
  }

  if (error !== undefined) {
    line += `\n${formatError(error)}`;
  }

  return line;
}

export function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `  ${inspect(error)}`;
  }

  const parts = [indent(error.stack ?? `${error.name}: ${error.message}`)];

  // Child process errors (yt-dlp) carry the tool's own explanation in stderr.
  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === "string" && stderr.trim()) {
    parts.push(`  stderr:\n${indent(stderr.trim(), 4)}`);
  }

  if (error.cause !== undefined) {
    parts.push(`  caused by:\n${indent(formatError(error.cause), 2)}`);
  }

  return parts.join("\n");
}

function indent(text: string, spaces = 2): string {
  const padding = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => padding + line)
    .join("\n");
}

function parseLevel(value: string | undefined): LogLevel {
  const level = value?.toLowerCase();
  return level && level in LEVELS ? (level as LogLevel) : "info";
}

function openLogFile(path: string): WriteStream | undefined {
  if (!path) {
    return undefined;
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    const stream = createWriteStream(path, { flags: "a" });
    stream.on("error", (error) => {
      console.error(`Log file ${path} is not writable; logging to the console only.`, error);
    });
    return stream;
  } catch (error) {
    console.error(`Could not open log file ${path}; logging to the console only.`, error);
    return undefined;
  }
}
