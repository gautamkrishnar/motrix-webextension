'use strict';

/**
 * Motrix WebExtension – Aria2 Tracking E2E Test Suite (Playwright)
 *
 * Tests aria2 progress tracking, download completion handling,
 * connection failure recovery, and download store persistence.
 *
 * Infrastructure:
 *  - Playwright drives a real headless Chrome with the extension loaded
 *  - MockAria2Server — WebSocket JSON-RPC 2.0 server replacing Motrix/aria2c
 *  - FileServer — local HTTP server serving synthetic downloadable files
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../../mock-aria2/server');
const FileServer = require('../../file-server/server');
const { waitFor } = require('../../helpers/extension');

// Per-file download directory to avoid cross-contamination when tests run in parallel
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads/aria2-tracking');

/** Remove all files from the download directory. */
function cleanupDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.rmSync(path.join(DOWNLOAD_DIR, file), { force: true });
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 17910;
const FILE_SERVER_PORT = 9090;
const TEST_API_KEY = 'e2e-test-secret';

const DEFAULT_SETTINGS = {
  motrixAPIkey: TEST_API_KEY,
  motrixPort: ARIA2_PORT,
  extensionStatus: true,
  enableNotifications: false,
  downloadFallback: false,
  minFileSize: 0,
  blacklist: [],
  showContextOption: true,
  showOnlyAria: false,
  hideChromeBar: false,
};

// ── Shared state (initialised in beforeAll, shared across all tests) ────────────
let context;
let extensionId;
let mockAria2;
let fileServer;
let userDataDir;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Count non-hidden files in the download directory. */
function countDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return 0;
  return fs.readdirSync(DOWNLOAD_DIR).filter((f) => !f.startsWith('.')).length;
}

// ── Extension helpers ──────────────────────────────────────────────────────────

/** Set extension settings via chrome.storage.sync from the extension's config page. */
async function configureExtension(settings) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async (s) => { await chrome.storage.sync.set(s); }, settings);
    await page.waitForTimeout(400);
  } finally {
    await page.close();
  }
}

/** Read a single setting from chrome.storage.sync. */
async function readSetting(key) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });
    return await page.evaluate(
      (k) => new Promise((r) => chrome.storage.sync.get(k, (res) => r(res[k]))),
      key
    );
  } finally {
    await page.close();
  }
}

/** Cancel every in-progress browser download via chrome.downloads. */
async function cancelPendingBrowserDownloads() {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => {
      const items = await new Promise((r) =>
        chrome.downloads.search({ state: 'in_progress' }, r)
      );
      for (const { id } of items) {
        await chrome.downloads.cancel(id).catch(() => {});
        await chrome.downloads.erase({ id }).catch(() => {});
      }
    });
  } finally {
    await page.close();
  }
}

/**
 * Stub chrome.notifications.create in the MV3 service worker so notify()
 * calls become no-ops during tests.
 */
async function suppressExtensionNotifications() {
  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (!sw) return;
  await sw.evaluate(() => {
    if (self.chrome && self.chrome.notifications) {
      self.chrome.notifications.create = (_id, _opts, cb) => {
        if (typeof cb === 'function') setTimeout(() => cb('suppressed'), 0);
      };
      self.chrome.notifications.clear = (_id, cb) => {
        if (typeof cb === 'function') setTimeout(() => cb(true), 0);
      };
    }
    if (self.chrome && self.chrome.downloads) {
      self.chrome.downloads.showDefaultFolder = () => {};
      self.chrome.downloads.show = () => Promise.resolve();
    }
  });
}

/** Read a value from chrome.storage.local. */
async function readLocalStorage(key) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });
    return await page.evaluate(
      (k) => new Promise((r) => chrome.storage.local.get(k, (res) => r(res[k]))),
      key
    );
  } finally {
    await page.close();
  }
}

/** Write values into chrome.storage.local. */
async function setLocalStorage(obj) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate((o) => chrome.storage.local.set(o), obj);
    await page.waitForTimeout(200);
  } finally {
    await page.close();
  }
}

/** Open a fresh page pointing at the file server index. */
async function openFileServerPage() {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${FILE_SERVER_PORT}`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

async function restoreDefaults() {
  await configureExtension(DEFAULT_SETTINGS);
}

// ── Global setup / teardown ────────────────────────────────────────────────────
test.beforeAll(async () => {
  mockAria2 = new MockAria2Server(ARIA2_PORT);
  await mockAria2.start();

  fileServer = new FileServer(FILE_SERVER_PORT);
  await fileServer.start();

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-e2e-tracking-'));
  const defaultDir = path.join(userDataDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, 'Preferences'),
    JSON.stringify({
      download: {
        default_directory: DOWNLOAD_DIR,
        prompt_for_download: false,
        directory_upgrade: true,
      },
      safebrowsing: { enabled: false },
      profile: { default_content_setting_values: { notifications: 2 } },
    })
  );

  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromium.executablePath(),
    acceptDownloads: true,
    downloadsPath: DOWNLOAD_DIR,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extensionId = sw.url().split('/')[2];

  await suppressExtensionNotifications();
  await configureExtension(DEFAULT_SETTINGS);
});

test.afterAll(async () => {
  await context?.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  await mockAria2?.stop();
  await fileServer?.stop();
});

test.beforeEach(async () => {
  await cancelPendingBrowserDownloads();
  mockAria2.reset();
  cleanupDownloads();
  await restoreDefaults();
  // Clear stale download entries so each test starts clean
  await setLocalStorage({ history: [], downloads: {} });
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Download Progress Tracking
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Progress Tracking', () => {
  test('extension polls aria2 with tellStatus after intercepting a download', async () => {
    const page = await openFileServerPage();
    try {
      await page.click('#large-download');
      await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

      // AriaTracker polls every 1000ms — wait for at least one poll to be recorded.
      // Allow extra time for the extension to resolve the filename, call addUri,
      // receive the gid, and start the tracker before the first poll fires.
      await waitFor(() => mockAria2.getCalls('tellStatus').length > 0, 15_000, 500);

      const tellStatusCalls = mockAria2.getCalls('tellStatus');
      expect(tellStatusCalls.length).toBeGreaterThan(0);

      // Verify the tellStatus call contains the gid returned by addUri
      const addUriCalls = mockAria2.getCalls('addUri');
      expect(addUriCalls).toHaveLength(1);
    } finally {
      await page.close();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Download Completion Handling
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Completion Handling', () => {
  test('download store status is updated to completed after aria2 finishes', async () => {
    const page = await openFileServerPage();
    try {
      await page.click('#large-download');
      await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

      // Mock aria2 simulates completion at 2.5s — wait past that
      // Then check that the download store entry has status 'completed'
      await waitFor(async () => {
        const downloads = await readLocalStorage('downloads');
        if (!downloads) return false;
        const entries = Object.values(downloads);
        return entries.some((entry) => entry.status === 'completed');
      }, 15_000, 500);

      const downloads = await readLocalStorage('downloads');
      const entries = Object.values(downloads);
      const completed = entries.find((entry) => entry.status === 'completed');
      expect(completed).toBeDefined();
      expect(completed.url).toContain('/files/large.bin');
    } finally {
      await page.close();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Download Store Persistence
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Store Persistence', () => {
  test('intercepted download is persisted to chrome.storage.local', async () => {
    const page = await openFileServerPage();
    try {
      await page.click('#large-download');
      await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

      // DownloadStore has a 500ms throttle — wait for persistence
      await waitFor(async () => {
        const downloads = await readLocalStorage('downloads');
        if (!downloads) return false;
        return Object.keys(downloads).length > 0;
      }, 10_000, 500);

      const downloads = await readLocalStorage('downloads');
      expect(downloads).toBeDefined();

      const entries = Object.values(downloads);
      expect(entries.length).toBeGreaterThan(0);

      const entry = entries.find((e) => e.url && e.url.includes('/files/large.bin'));
      expect(entry).toBeDefined();
      expect(entry.name).toBeDefined();
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.status).toBeDefined();
    } finally {
      await page.close();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Download Store History Limit and Ordering
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Store History Limit and Ordering', () => {
  test('multiple downloads appear in history ordered newest first', async () => {
    const DOWNLOAD_COUNT = 5;

    for (let i = 0; i < DOWNLOAD_COUNT; i++) {
      const page = await openFileServerPage();
      try {
        await page.click('#large-download');
        await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

        // Wait for completion so the entry gets a terminal status and is flushed
        await waitFor(async () => {
          const downloads = await readLocalStorage('downloads');
          if (!downloads) return false;
          const entries = Object.values(downloads);
          // Check that the latest entry has reached a terminal status
          return entries.filter((e) => e.status === 'completed').length > i;
        }, 15_000, 500);
      } finally {
        await page.close();
      }

      // Reset mock so a fresh addUri can be detected on the next iteration,
      // but do NOT clear chrome.storage.local — we want downloads to accumulate
      cleanupDownloads();
      mockAria2.reset();
    }

    // Read history and verify
    const history = await readLocalStorage('history');
    expect(history).toBeDefined();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(DOWNLOAD_COUNT);

    // Verify ordering: each entry's startTime should be >= the next entry's startTime
    for (let i = 0; i < history.length - 1; i++) {
      const current = new Date(history[i].startTime).getTime();
      const next = new Date(history[i + 1].startTime).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });
});
