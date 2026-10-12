const mongoose = require('mongoose');
const models = require('../src/models');

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Model.init() resolves once that model's indexes exist. The booking and
  // webhook paths rely on unique indexes for correctness, so tests must not
  // start before they are actually built.
  await Promise.all(Object.values(models).map((model) => model.init()));
}, 60_000);

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
}, 15_000);

afterAll(async () => {
  await mongoose.disconnect();
}, 30_000);
