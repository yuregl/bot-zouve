import assert from "node:assert/strict";
import { test } from "node:test";
import { connectMongo, isMongoConnected, RETRY_DELAY_MS } from "../../../src/infra/db/mongo.js";

const URI = "mongodb://bot:secret@localhost:27017/zouve?authSource=admin";

test("connectMongo connects to the given URI", async () => {
  const uris: string[] = [];

  await connectMongo(URI, async (uri) => {
    uris.push(uri);
  });

  assert.deepEqual(uris, [URI]);
});

test("connectMongo does nothing without a URI", async () => {
  let attempts = 0;

  await connectMongo("", async () => {
    attempts++;
  });

  assert.equal(attempts, 0);
});

test("connectMongo retries in the background after a failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const connect = async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error("connect ECONNREFUSED 127.0.0.1:27017");
    }
  };

  await connectMongo(URI, connect);
  assert.equal(attempts, 1);

  t.mock.timers.tick(RETRY_DELAY_MS);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
});

test("isMongoConnected is false until a connection is open", () => {
  assert.equal(isMongoConnected(), false);
});

test("connectMongo uses Mongoose by default and keeps the bot running when the URI is invalid", async (t) => {
  // An invalid URI fails before any network access; the retry timer is mocked.
  t.mock.timers.enable({ apis: ["setTimeout"] });

  await connectMongo("not-a-mongodb-uri");

  assert.equal(isMongoConnected(), false);
});
