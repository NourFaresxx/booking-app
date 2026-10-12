const mongoose = require('mongoose');

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Stops accepting connections, lets in-flight requests finish, then closes the
 * database. Without this, a deploy can kill the process mid-booking — after a
 * seat is reserved but before the payment intent is recorded against it.
 *
 * Lives here rather than in server.js so it can be tested without starting the
 * real server. Note that Windows has no POSIX signals: handlers registered
 * here never run there, and the process is terminated outright. This matters
 * only for local development, since deployments run on Linux.
 */
function setupGracefulShutdown(
  server,
  {
    maintenance,
    timeoutMs = SHUTDOWN_TIMEOUT_MS,
    exit = (code) => process.exit(code),
    log = console,
    closeDatabase = () => mongoose.connection.close(),
  } = {}
) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    // A second Ctrl-C shouldn't restart the sequence.
    if (shuttingDown) return;
    shuttingDown = true;
    log.log(`${signal} received, shutting down`);

    maintenance?.stop();

    // Backstop for a connection that never closes, e.g. a hanging keep-alive.
    const forceExit = setTimeout(() => {
      log.error('Shutdown timed out, exiting');
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close(async () => {
      try {
        await closeDatabase();
      } catch {
        // Already closed, or never opened — nothing to salvage here.
      }
      clearTimeout(forceExit);
      exit(0);
    });
  };

  const handlers = {
    SIGTERM: () => shutdown('SIGTERM'),
    SIGINT: () => shutdown('SIGINT'),
  };
  for (const [signal, handler] of Object.entries(handlers)) {
    process.on(signal, handler);
  }

  // A rejection reaching here is a bug, not a recoverable condition. Log it
  // loudly rather than letting the process die with no explanation.
  const onUnhandledRejection = (reason) => log.error('Unhandled promise rejection:', reason);
  process.on('unhandledRejection', onUnhandledRejection);

  /** Detaches the listeners — needed so tests don't leak them between cases. */
  return function teardown() {
    for (const [signal, handler] of Object.entries(handlers)) {
      process.removeListener(signal, handler);
    }
    process.removeListener('unhandledRejection', onUnhandledRejection);
  };
}

module.exports = { setupGracefulShutdown, SHUTDOWN_TIMEOUT_MS };
