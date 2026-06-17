'use strict';

/**
 * Shared utilities for both Chrome and Firefox Playwright e2e tests.
 * Browser-specific helpers (launch, configure, CDP) live in each spec file.
 */

const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');

/** Remove all files from the download directory. */
function cleanupDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.rmSync(path.join(DOWNLOAD_DIR, file), { recursive: true, force: true });
  }
}

/**
 * Poll `condition` until it returns truthy or the timeout elapses.
 * Use this to wait for async side-effects (e.g. mock server receiving a call).
 */
async function waitFor(condition, timeoutMs = 20_000, intervalMs = 200, description = '') {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `waitFor${description ? `(${description})` : ''} timed out after ${timeoutMs} ms` +
      (lastErr ? `: ${lastErr.message}` : '')
  );
}

module.exports = { DOWNLOAD_DIR, cleanupDownloads, waitFor };
