'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');

/**
 * Mock Aria2 JSON-RPC WebSocket server.
 *
 * Mimics the wire protocol used by the `aria2` npm package so the extension's
 * Aria2Service can connect and call addUri / tellStatus against it in tests.
 *
 * Protocol:
 *   Request : { jsonrpc: "2.0", id, method: "aria2.<name>", params: ["token:SECRET", ...args] }
 *   Response: { jsonrpc: "2.0", id, result: VALUE }
 *   Event   : { jsonrpc: "2.0", method: "aria2.onDownload*", params: [{ gid }] }
 */
class MockAria2Server {
  #wss = null;
  #port;
  #calls = new Map(); // methodName (without "aria2." prefix) → call[]
  #downloads = new Map(); // gid → status object
  #clients = new Set();
  #rejectConnections = false;

  constructor(port = 16800) {
    this.#port = port;
  }

  /** Start listening. Resolves when the port is bound. */
  async start() {
    this.#wss = new WebSocketServer({ port: this.#port });

    this.#wss.on('connection', (ws, req) => {
      if (req.url !== '/jsonrpc' || this.#rejectConnections) {
        ws.close(1003, 'Unavailable');
        return;
      }
      this.#clients.add(ws);
      ws.on('message', (data) => this.#handleMessage(ws, String(data)));
      ws.on('close', () => this.#clients.delete(ws));
      ws.on('error', () => this.#clients.delete(ws));
    });

    await new Promise((resolve, reject) => {
      this.#wss.once('listening', resolve);
      this.#wss.once('error', reject);
    });
  }

  /** Stop the server and close all connections. */
  async stop() {
    for (const ws of this.#clients) {
      ws.terminate();
    }
    await new Promise((resolve) => this.#wss.close(resolve));
  }

  /**
   * Drop all tracked calls and simulated downloads.
   * Call between tests to isolate assertions.
   */
  reset() {
    this.#calls.clear();
    this.#downloads.clear();
  }

  /**
   * Return recorded invocations for a given method name (without "aria2." prefix).
   * e.g. getCalls('addUri')
   */
  getCalls(method) {
    return this.#calls.get(method) ?? [];
  }

  /**
   * Return a snapshot of the server's internal state for debugging.
   */
  getState() {
    return {
      calls: Object.fromEntries(this.#calls),
      downloads: Object.fromEntries(this.#downloads),
      rejectingConnections: this.#rejectConnections,
    };
  }

  /**
   * When true, new WebSocket connections are immediately rejected.
   * Useful for simulating Aria2 being unreachable.
   */
  setRejectConnections(reject) {
    this.#rejectConnections = reject;
    if (reject) {
      // Close existing connections so the service detects the failure
      for (const ws of this.#clients) {
        ws.terminate();
      }
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #handleMessage(ws, rawData) {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch {
      return;
    }

    const { id, method, params = [] } = msg;

    // Strip "aria2." prefix for recording
    const name = method?.replace(/^aria2\./, '') ?? method;

    if (!this.#calls.has(name)) this.#calls.set(name, []);
    this.#calls.get(name).push({ id, method, params });

    switch (method) {
      case 'aria2.addUri':
        return this.#onAddUri(ws, id, params);
      case 'aria2.tellStatus':
        return this.#onTellStatus(ws, id, params);
      case 'aria2.getVersion':
        return this.#respond(ws, id, { version: '1.36.0', enabledFeatures: [] });
      default:
        // Acknowledge unknown calls so the client doesn't hang
        this.#respond(ws, id, 'OK');
    }
  }

  #onAddUri(ws, id, params) {
    // params[0] may be "token:SECRET"; params[1] is the URL array; params[2] is options
    const hasToken =
      typeof params[0] === 'string' && params[0].startsWith('token:');
    const urls = hasToken ? params[1] : params[0];
    const options = hasToken ? params[2] : params[1];

    const gid = randomUUID().replace(/-/g, '').slice(0, 16);
    const totalLength = String(15 * 1024 * 1024); // 15 MB

    this.#downloads.set(gid, {
      gid,
      status: 'active',
      urls,
      options,
      totalLength,
      completedLength: '0',
      downloadSpeed: String(5 * 1024 * 1024),
    });

    this.#respond(ws, id, gid);

    // Emit onDownloadStart shortly after
    setTimeout(() => {
      this.#broadcast({ jsonrpc: '2.0', method: 'aria2.onDownloadStart', params: [{ gid }] });
    }, 150);

    // Simulate completion
    setTimeout(() => {
      const dl = this.#downloads.get(gid);
      if (dl) {
        dl.status = 'complete';
        dl.completedLength = dl.totalLength;
      }
      this.#broadcast({ jsonrpc: '2.0', method: 'aria2.onDownloadComplete', params: [{ gid }] });
    }, 2500);
  }

  #onTellStatus(ws, id, params) {
    // params[0] may be "token:SECRET"; params[1] is the GID
    const hasToken =
      typeof params[0] === 'string' && params[0].startsWith('token:');
    const gid = hasToken ? params[1] : params[0];

    const dl = this.#downloads.get(gid);

    if (!dl) {
      this.#respond(ws, id, undefined, {
        code: 1,
        message: `Download not found: ${gid}`,
      });
      return;
    }

    this.#respond(ws, id, {
      gid: dl.gid,
      status: dl.status,
      totalLength: dl.totalLength,
      completedLength: dl.completedLength,
      downloadSpeed: dl.downloadSpeed,
      connections: '1',
      files: [
        {
          path: `/tmp/${dl.options?.out ?? 'file'}`,
          length: dl.totalLength,
          completedLength: dl.completedLength,
          selected: 'true',
          uris: (dl.urls ?? []).map((uri) => ({ status: 'used', uri })),
        },
      ],
    });
  }

  #respond(ws, id, result, error) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const msg = { jsonrpc: '2.0', id };
    if (error) msg.error = error;
    else msg.result = result;
    ws.send(JSON.stringify(msg));
  }

  #broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.#clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }
}

module.exports = MockAria2Server;
