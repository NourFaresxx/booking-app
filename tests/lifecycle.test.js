const http = require('http');
const { setupGracefulShutdown } = require('../src/lifecycle');

// Signals are emitted on `process` directly rather than sent with
// process.kill, so the handler is exercised the same way on every platform.
// Windows has no POSIX signals, so a real SIGTERM there terminates the
// process outright and would never reach this code.
function emitSignal(signal) {
  process.emit(signal);
  // Let the server's close callback and its awaited work settle.
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

function silentLog() {
  return { log: jest.fn(), error: jest.fn() };
}

// The suite shares one mongoose connection with every other suite, so the real
// close is swapped out — otherwise shutting "down" here would disconnect the
// database the rest of the run depends on.
function options(extra = {}) {
  return { exit: jest.fn(), log: silentLog(), closeDatabase: jest.fn(), ...extra };
}

describe('graceful shutdown', () => {
  let teardown;
  let server;

  beforeEach(async () => {
    server = http.createServer((req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(0, resolve));
  });

  afterEach(() => {
    if (teardown) teardown();
    teardown = undefined;
    if (server.listening) server.close();
  });

  it('stops the maintenance timer, closes the server and the database', async () => {
    const opts = options({ maintenance: { stop: jest.fn() } });
    teardown = setupGracefulShutdown(server, opts);

    await emitSignal('SIGTERM');

    expect(opts.maintenance.stop).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
    expect(opts.closeDatabase).toHaveBeenCalledTimes(1);
    expect(opts.exit).toHaveBeenCalledWith(0);
  });

  it('does the same on SIGINT', async () => {
    const opts = options({ maintenance: { stop: jest.fn() } });
    teardown = setupGracefulShutdown(server, opts);

    await emitSignal('SIGINT');

    expect(opts.maintenance.stop).toHaveBeenCalledTimes(1);
    expect(opts.exit).toHaveBeenCalledWith(0);
  });

  it('ignores a second signal instead of restarting the sequence', async () => {
    const opts = options({ maintenance: { stop: jest.fn() } });
    teardown = setupGracefulShutdown(server, opts);

    await emitSignal('SIGTERM');
    await emitSignal('SIGTERM');
    await emitSignal('SIGINT');

    // An impatient second Ctrl-C must not re-run shutdown.
    expect(opts.maintenance.stop).toHaveBeenCalledTimes(1);
    expect(opts.exit).toHaveBeenCalledTimes(1);
  });

  it('still exits cleanly when closing the database throws', async () => {
    const opts = options({ closeDatabase: jest.fn().mockRejectedValue(new Error('already closed')) });
    teardown = setupGracefulShutdown(server, opts);

    await emitSignal('SIGTERM');

    expect(opts.exit).toHaveBeenCalledWith(0);
  });

  it('force-exits non-zero if the server will not close in time', () => {
    jest.useFakeTimers();
    const opts = options({ timeoutMs: 10_000 });
    // A server whose close callback never fires, like a stuck keep-alive.
    const stuck = { close: jest.fn() };

    teardown = setupGracefulShutdown(stuck, opts);
    process.emit('SIGTERM');

    expect(opts.exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);

    expect(opts.exit).toHaveBeenCalledWith(1);
    expect(opts.log.error).toHaveBeenCalledWith('Shutdown timed out, exiting');
    jest.useRealTimers();
  });

  it('works without a maintenance job', async () => {
    const opts = options();
    teardown = setupGracefulShutdown(server, opts);

    await emitSignal('SIGTERM');
    expect(opts.exit).toHaveBeenCalledWith(0);
  });

  it('logs an unhandled rejection rather than staying silent', () => {
    const opts = options();
    teardown = setupGracefulShutdown(server, opts);

    const reason = new Error('something slipped through');
    process.emit('unhandledRejection', reason);

    expect(opts.log.error).toHaveBeenCalledWith('Unhandled promise rejection:', reason);
  });
});
