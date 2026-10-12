// Registers every model in one place. Importing this guarantees all schemas
// (and so all index definitions) are known to mongoose before anything tries
// to build or sync indexes.
module.exports = {
  User: require('./User'),
  Resource: require('./Resource'),
  Booking: require('./Booking'),
  BookingSlot: require('./BookingSlot'),
  WebhookEvent: require('./WebhookEvent'),
};
