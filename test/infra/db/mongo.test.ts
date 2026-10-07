import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
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

test("connectMongo creates the models' indexes after connecting", async () => {
  const steps: string[] = [];

  await connectMongo(
    URI,
    async () => {
      steps.push("connect");
    },
    async () => {
      steps.push("indexes");
    },
  );

  assert.deepEqual(steps, ["connect", "indexes"]);
});

test("connectMongo keeps the connection when the indexes cannot be created", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let connections = 0;

  await connectMongo(
    URI,
    async () => {
      connections++;
    },
    async () => {
      throw new Error("E11000 duplicate key");
    },
  );
  t.mock.timers.tick(RETRY_DELAY_MS);

  assert.equal(connections, 1);
});

test("connectMongo does not create indexes when the connection fails", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let indexes = 0;

  await connectMongo(
    URI,
    async () => {
      throw new Error("connect ECONNREFUSED");
    },
    async () => {
      indexes++;
    },
  );

  assert.equal(indexes, 0);
});

test("connectMongo creates the indexes of every registered model by default", async () => {
  const model = mongoose.model("MongoTestItem", new mongoose.Schema({ code: { type: String, unique: true } }));
  const createIndexes = model.createIndexes;
  let called = 0;
  model.createIndexes = async () => {
    called++;
  };

  try {
    await connectMongo(URI, async () => {});
  } finally {
    model.createIndexes = createIndexes;
    mongoose.deleteModel("MongoTestItem");
  }

  assert.equal(called, 1);
});
