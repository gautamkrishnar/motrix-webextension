'use strict';

/**
 * Motrix WebExtension – Chrome Storage & Blacklist Edge-Case Tests (Playwright)
 *
 * Covers:
 *  • Settings persistence across service worker restarts
 *  • Blacklist substring matching with regex-special characters
 *  • Rapid successive settings mutations
 *  • Large blacklist handling
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
const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads/storage-edge');

/** Remove all files from the download directory. */
function cleanupDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.rmSync(path.join(DOWNLOAD_DIR, file), { force: true });
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 17920;
const FILE_SERVER_PORT = 9100;
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

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-e2e-storage-'));
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
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Settings Survive Service Worker Restart
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Settings Survive Service Worker Restart', () => {
  test('custom settings persist across navigation away and back', async () => {
    await configureExtension({ minFileSize: 5, blacklist: ['test-entry'] });

    // Navigate away from extension pages — open a regular page, wait a few seconds
    const page = await context.newPage();
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
    await sleep(3_000);
    await page.close();

    // Read settings back — they should still be what we set
    expect(await readSetting('minFileSize')).toBe(5);
    expect(await readSetting('blacklist')).toEqual(['test-entry']);

    await restoreDefaults();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Blacklist with Special Characters
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Blacklist with Special Characters', () => {
  test('escaped dot in blacklist does NOT match (substring, not regex)', async () => {
    // The interceptor uses url.includes(entry), so 'large\\.bin' is a literal
    // string that won't match the URL '/files/large.bin'
    await configureExtension({ blacklist: ['large\\.bin'] });

    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

    // Download WAS intercepted — the escaped dot didn't match as a substring
    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);

    await page.close();
    await restoreDefaults();
  });

  test('literal dot in blacklist DOES match as substring', async () => {
    // 'large.bin' appears literally in the download URL, so it matches
    await configureExtension({ blacklist: ['large.bin'] });

    const page = await openFileServerPage();
    await page.click('#mini-download');

    // mini.bin does NOT contain 'large.bin', so it should be intercepted
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    expect(mockAria2.getCalls('addUri')).toHaveLength(1);

    await page.close();

    // Now verify that a URL containing 'large.bin' IS blocked
    mockAria2.reset();
    cleanupDownloads();

    await configureExtension({ blacklist: ['large.bin'], downloadFallback: true });
    const page2 = await openFileServerPage();
    await page2.click('#large-download');
    // Blacklisted URL bypasses aria2 — with fallback enabled, browser downloads it
    await waitFor(() => countDownloads() > 0, 15_000, 200, 'blacklisted download to land on disk');
    expect(mockAria2.getCalls('addUri')).toHaveLength(0);

    await page2.close();
    await restoreDefaults();
  });

  test('regex-special characters *, ?, [, ( are treated as literals', async () => {
    // None of these regex-special patterns appear literally in any download URL,
    // so all downloads should still be intercepted
    await configureExtension({ blacklist: ['file*.bin', 'down?load', '[test]', '(group)'] });

    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);

    await page.close();
    await restoreDefaults();
  });

  test('URL-encoded characters in blacklist are treated as literal substrings', async () => {
    // '%20' won't appear in our test URLs (they have no spaces), so download proceeds
    await configureExtension({ blacklist: ['%20large', 'file%2Fpath'] });

    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);

    await page.close();
    await restoreDefaults();
  });

  test('Unicode characters in blacklist are treated as literal substrings', async () => {
    // Unicode entries won't appear in our ASCII test URLs
    await configureExtension({ blacklist: ['éèê', '中文', '😀'] });

    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);

    await page.close();
    await restoreDefaults();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Multiple Settings Changes in Rapid Succession
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Rapid Settings Changes', () => {
  test('last value wins after 5 rapid-fire storage writes', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });

    // Rapid-fire 5 changes without awaiting between them (except the last)
    await page.evaluate(async () => {
      chrome.storage.sync.set({ minFileSize: 1 });
      chrome.storage.sync.set({ minFileSize: 2 });
      chrome.storage.sync.set({ minFileSize: 3 });
      chrome.storage.sync.set({ minFileSize: 4 });
      await chrome.storage.sync.set({ minFileSize: 5 });
    });
    await page.waitForTimeout(500);
    await page.close();

    // The final value should be 5
    expect(await readSetting('minFileSize')).toBe(5);

    await restoreDefaults();
  });

  test('rapid blacklist mutations settle on the last value', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });

    await page.evaluate(async () => {
      chrome.storage.sync.set({ blacklist: ['a'] });
      chrome.storage.sync.set({ blacklist: ['a', 'b'] });
      chrome.storage.sync.set({ blacklist: ['a', 'b', 'c'] });
      chrome.storage.sync.set({ blacklist: ['x'] });
      await chrome.storage.sync.set({ blacklist: ['final-entry'] });
    });
    await page.waitForTimeout(500);
    await page.close();

    expect(await readSetting('blacklist')).toEqual(['final-entry']);

    await restoreDefaults();
  });

  test('rapid changes across multiple keys settle correctly', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });

    await page.evaluate(async () => {
      chrome.storage.sync.set({ minFileSize: 10, extensionStatus: false });
      chrome.storage.sync.set({ minFileSize: 20, downloadFallback: true });
      chrome.storage.sync.set({ minFileSize: 0, extensionStatus: true });
      await chrome.storage.sync.set({ minFileSize: 7, downloadFallback: false, extensionStatus: true });
    });
    await page.waitForTimeout(500);
    await page.close();

    expect(await readSetting('minFileSize')).toBe(7);
    expect(await readSetting('downloadFallback')).toBe(false);
    expect(await readSetting('extensionStatus')).toBe(true);

    await restoreDefaults();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Large Blacklist Handling
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Large Blacklist Handling', () => {
  test('extension functions correctly with 50+ blacklist entries (none matching)', async () => {
    // Generate 50 unique entries that do NOT match any test download URL
    const largeBlacklist = Array.from({ length: 50 }, (_, i) =>
      `no-match-domain-${i}.example.org`
    );
    await configureExtension({ blacklist: largeBlacklist });

    // Verify the blacklist was stored correctly
    const stored = await readSetting('blacklist');
    expect(stored).toHaveLength(50);

    // Trigger a download — none of the 50 entries match, so it should be intercepted
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);

    expect(mockAria2.getCalls('addUri')).toHaveLength(1);

    await page.close();
    await restoreDefaults();
  });

  test('adding a matching entry to a large blacklist blocks the download', async () => {
    // 50 non-matching entries + 1 that matches the mini.bin download URL
    const largeBlacklist = Array.from({ length: 50 }, (_, i) =>
      `no-match-domain-${i}.example.org`
    );
    largeBlacklist.push('mini.bin');
    await configureExtension({ blacklist: largeBlacklist, downloadFallback: true });

    const stored = await readSetting('blacklist');
    expect(stored).toHaveLength(51);

    // mini.bin URL contains 'mini.bin' as a substring — should be blocked
    const page = await openFileServerPage();
    await page.click('#mini-download');
    await waitFor(() => countDownloads() > 0, 15_000, 200, 'blacklisted download to land on disk');

    expect(mockAria2.getCalls('addUri')).toHaveLength(0);

    await page.close();
    await restoreDefaults();
  });
});
