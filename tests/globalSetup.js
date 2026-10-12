const { MongoMemoryReplSet } = require('mongodb-memory-server');

// A replica set, not a standalone server: the booking path uses transactions,
// which a bare mongod rejects. Started once for the whole run.
module.exports = async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  process.env.MONGO_URI = replSet.getUri('booking-api-test');

  // Kept here so globalTeardown can stop the same instance.
  globalThis.__MONGO_REPLSET__ = replSet;
};
