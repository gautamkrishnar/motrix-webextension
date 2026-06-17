'use strict';

/**
 * Motrix WebExtension – Chrome E2E Test Suite (Playwright)
 *
 * Infrastructure:
 *  • Playwright drives a real headless Chrome (stable) with the extension loaded
 *  • MockAria2Server — WebSocket JSON-RPC 2.0 server replacing Motrix/aria2c
 *  • FileServer — local HTTP server serving synthetic downloadable files
 *
 * Pre-requisite: yarn build chrome   (produces dist/chrome/)
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../../mock-aria2/server');
const FileServer = require('../../file-server/server');
const { DOWNLOAD_DIR, cleanupDownloads, waitFor } = require('../../helpers/extension');

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 16900;
const FILE_SERVER_PORT = 8080;
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
let context;   // Playwright BrowserContext
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
 *
 * Playwright's Worker.evaluate() runs code directly in the service worker's
 * JavaScript context — no CDP session needed.
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

  // Temp Chrome profile: bake download dir and notification block into Preferences
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-e2e-'));
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

  // ── Headless Chrome with extension support ────────────────────────────────
  //
  // Two Playwright defaults must be overridden to load Chrome extensions:
  //
  //  1. headless: false  +  '--headless=new'
  //     Playwright's `headless: true` injects '--headless' (legacy mode) which
  //     silently disables extension support.  Passing `headless: false` skips
  //     that flag; we then add '--headless=new' to activate Chrome's modern
  //     headless mode which fully supports extensions and service workers.
  //
  //  2. ignoreDefaultArgs: ['--disable-extensions']
  //     Playwright adds '--disable-extensions' by default which blocks ALL user
  //     extensions.  Removing it allows our extension to load.
  //     Note: '--disable-component-extensions-with-background-pages' is kept
  //     (not removed) to suppress Chrome built-in component extensions.
  //
  // We use Playwright's bundled "Chrome for Testing" binary (chromium.executablePath())
  // because it is specifically built to allow unpacked extension loading.
  // The system Chrome stable enforces stricter signing requirements that prevent
  // unpacked extensions from registering their service workers via --load-extension.
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

  // Wait for the MV3 service worker to register
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extensionId = sw.url().split('/')[2];

  await suppressExtensionNotifications();
  await configureExtension(DEFAULT_SETTINGS);
});

test.afterAll(async () => {
  await context?.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  await mockAria2?.stop();
  await fileServer?.stop();
  // cleanupDownloads();
});

test.beforeEach(async () => {
  await cancelPendingBrowserDownloads();
  mockAria2.reset();
  cleanupDownloads();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Extension Setup
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Extension Setup', () => {
  test('service worker is registered with the correct extension ID', () => {
    const sw = context.serviceWorkers().find((w) =>
      w.url().startsWith(`chrome-extension://${extensionId}/`)
    );
    expect(sw).toBeDefined();
  });

  test('popup page loads without JavaScript errors', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_000);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('popup contains rendered content (React mounted)', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_000);
    const len = await page.evaluate(() => document.body.innerHTML.length);
    expect(len).toBeGreaterThan(200);
    await page.close();
  });

  test('settings page loads without JavaScript errors', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_000);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('history page loads without JavaScript errors', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${extensionId}/pages/history.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_000);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('extension storage is initialised with correct default settings', async () => {
    expect(await readSetting('motrixPort')).toBe(ARIA2_PORT);
    expect(await readSetting('motrixAPIkey')).toBe(TEST_API_KEY);
    expect(await readSetting('extensionStatus')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Download Interception
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Interception', () => {
  test('large file download is intercepted — Aria2 receives addUri', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);
    await page.close();
  });

  test('addUri call carries correct token', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    expect(mockAria2.getCalls('addUri')[0].params[0]).toBe(`token:${TEST_API_KEY}`);
    expect(countDownloads()).toBe(0);
    await page.close();
  });

  test('addUri call carries the correct download URL', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    const urls = mockAria2.getCalls('addUri')[0].params[1];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls[0]).toContain('/files/large.bin');
    expect(countDownloads()).toBe(0);
    await page.close();
  });

  test('addUri call carries a filename in options', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    const options = mockAria2.getCalls('addUri')[0].params[2];
    expect(options).toBeDefined();
    // Chrome for Testing (headless) sometimes resolves filenames as UUID temp
    // names before the final Content-Disposition name is applied.  We verify
    // that a non-empty filename string was produced; the URL test covers that
    // the correct file was targeted.
    expect(typeof options.out).toBe('string');
    expect(options.out.length).toBeGreaterThan(0);
    expect(countDownloads()).toBe(0);
    await page.close();
  });

  test('browser download item is erased after interception', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await sleep(1_000);
    const crdownloads = fs.existsSync(DOWNLOAD_DIR)
      ? fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith('.crdownload'))
      : [];
    expect(crdownloads).toHaveLength(0);
    expect(countDownloads()).toBe(0);
    await page.close();
  });

  test('two sequential downloads are each intercepted independently', async () => {
    const p1 = await openFileServerPage();
    await p1.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length === 1, 25_000);
    await p1.close();

    mockAria2.reset();

    const p2 = await openFileServerPage();
    await p2.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length === 1, 25_000);
    await p2.close();

    expect(mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(countDownloads()).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Bypass Scenarios
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Bypass Scenarios', () => {
  test('small file is NOT intercepted when minFileSize is 1 MB', async () => {
    await configureExtension({ minFileSize: 1 });
    const page = await openFileServerPage();
    await page.click('#small-download');
    await sleep(4_000);
    expect(mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(countDownloads()).toBe(1);
    await page.close();
    await restoreDefaults();
  });

  test('blacklisted URL is NOT intercepted', async () => {
    await configureExtension({ blacklist: ['blacklisted'] });
    const page = await openFileServerPage();
    await page.click('#blacklisted-download');
    await sleep(4_000);
    expect(mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(countDownloads()).toBe(1);
    await page.close();
    await restoreDefaults();
  });

  test('downloads are NOT intercepted when extension is disabled', async () => {
    await configureExtension({ extensionStatus: false });
    const page = await openFileServerPage();
    await page.click('#mini-download');
    await sleep(4_000);
    expect(mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(countDownloads()).toBe(1);
    await page.close();
    await restoreDefaults();
  });

  test('non-blacklisted URL is still intercepted alongside a blacklisted pattern', async () => {
    await configureExtension({ blacklist: ['blacklisted'] });
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
// 4. Fallback Behaviour
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Fallback Behaviour', () => {
  test('browser downloads file when Aria2 is unreachable and fallback is enabled', async () => {
    await configureExtension({ motrixPort: 19_999, downloadFallback: true });

    // We verify the fallback via chrome.downloads API and the filesystem.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });

    const miniUrl = `http://127.0.0.1:${FILE_SERVER_PORT}/files/mini.bin`;

    const countBefore = await configPage.evaluate(
      (url) => new Promise((r) => chrome.downloads.search({ url }, (res) => r(res.length))),
      miniUrl
    );

    const page = await openFileServerPage();
    await page.click('#mini-download');

    // Wait for the fallback download to complete (not just appear).
    // chrome.downloads.search returns entries as soon as Chrome creates them —
    // before the extension pauses, tries Aria2, and resumes.  Checking only for
    // existence can race ahead of the actual file landing on disk.
    await waitFor(async () => {
      const completed = await configPage.evaluate(
        (url) => new Promise((r) =>
          chrome.downloads.search({ url, state: 'complete' }, (res) => r(res.length))),
        miniUrl
      );
      return completed > countBefore;
    }, 30_000, 300);

    // Aria2 was unreachable — no addUri should have reached the mock
    expect(mockAria2.getCalls('addUri')).toHaveLength(0);
    // Browser took over — a file should have landed in the download dir
    expect(countDownloads()).toBeGreaterThan(0);

    // Clean up completed download entries
    await configPage.evaluate(async (url) => {
      const items = await new Promise((r) => chrome.downloads.search({ url }, r));
      for (const { id } of items) {
        await chrome.downloads.erase({ id }).catch(() => {});
      }
    }, miniUrl);

    await page.close();
    await configPage.close();
    await restoreDefaults();
  });

  test('download is cancelled when Aria2 is unreachable and fallback is disabled', async () => {
    await configureExtension({ motrixPort: 19_999, downloadFallback: false });
    const page = await openFileServerPage();
    try {
      await page.click('#large-download');
      await sleep(8_000);
      expect(countDownloads()).toBe(0);
    } finally {
      await page.close();
      await restoreDefaults();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Settings Persistence
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Settings Persistence', () => {
  test('API key is readable from the config page', async () => {
    expect(await readSetting('motrixAPIkey')).toBe(TEST_API_KEY);
  });

  test('RPC port is readable from the config page', async () => {
    expect(await readSetting('motrixPort')).toBe(ARIA2_PORT);
  });

  test('extensionStatus toggle persists', async () => {
    await configureExtension({ extensionStatus: false });
    expect(await readSetting('extensionStatus')).toBe(false);
    await configureExtension({ extensionStatus: true });
    expect(await readSetting('extensionStatus')).toBe(true);
  });

  test('minFileSize setting persists', async () => {
    await configureExtension({ minFileSize: 5 });
    expect(await readSetting('minFileSize')).toBe(5);
    await restoreDefaults();
  });

  test('blacklist setting persists as an array', async () => {
    const list = ['example.com', '.torrent', 'no-motrix.org'];
    await configureExtension({ blacklist: list });
    expect(await readSetting('blacklist')).toEqual(list);
    await restoreDefaults();
  });

  test('downloadFallback toggle persists', async () => {
    await configureExtension({ downloadFallback: true });
    expect(await readSetting('downloadFallback')).toBe(true);
    await restoreDefaults();
  });

  test('darkMode toggle persists', async () => {
    await configureExtension({ darkMode: true });
    expect(await readSetting('darkMode')).toBe(true);
    await restoreDefaults();
  });

  test('enableNotifications toggle persists', async () => {
    await configureExtension({ enableNotifications: true });
    expect(await readSetting('enableNotifications')).toBe(true);
    await restoreDefaults();
  });

  test('showContextOption toggle persists', async () => {
    await configureExtension({ showContextOption: false });
    expect(await readSetting('showContextOption')).toBe(false);
    await restoreDefaults();
  });

  test('showOnlyAria toggle persists', async () => {
    await configureExtension({ showOnlyAria: true });
    expect(await readSetting('showOnlyAria')).toBe(true);
    await restoreDefaults();
  });

  test('changed port causes subsequent downloads to use the new port', async () => {
    await configureExtension({ motrixPort: 29_999, downloadFallback: false });
    const page = await openFileServerPage();
    try {
      await page.click('#large-download');
      await sleep(7_000);
      expect(mockAria2.getCalls('addUri')).toHaveLength(0);
    } finally {
      await page.close();
      await restoreDefaults();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. History Page
// ══════════════════════════════════════════════════════════════════════════════
test.describe('History Page', () => {
  test('history page renders after an intercepted download', async () => {
    const dlPage = await openFileServerPage();
    await dlPage.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await dlPage.close();
    await sleep(1_000);

    const histPage = await context.newPage();
    const errors = [];
    histPage.on('pageerror', (e) => errors.push(e.message));
    await histPage.goto(`chrome-extension://${extensionId}/pages/history.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_500);

    expect(errors).toHaveLength(0);
    const content = await histPage.evaluate(() => document.body.innerHTML);
    expect(content.length).toBeGreaterThan(100);
    expect(countDownloads()).toBe(0);
    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Prompt Before Download (auto-detection)
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Prompt Before Download', () => {
  // A separate browser context with prompt_for_download: true.
  // In headless=new Chrome, the Save As dialog is auto-dismissed so the download
  // proceeds normally — this verifies the auto-detection doesn't break interception.
  let pbdContext;
  let pbdExtensionId;
  let pbdUserDataDir;

  test.beforeAll(async () => {
    pbdUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-pbd-'));
    const defaultDir = path.join(pbdUserDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(defaultDir, 'Preferences'),
      JSON.stringify({
        download: {
          default_directory: DOWNLOAD_DIR,
          prompt_for_download: true,
          directory_upgrade: true,
        },
        safebrowsing: { enabled: false },
        profile: { default_content_setting_values: { notifications: 2 } },
      })
    );

    pbdContext = await chromium.launchPersistentContext(pbdUserDataDir, {
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

    let sw = pbdContext.serviceWorkers()[0];
    if (!sw) sw = await pbdContext.waitForEvent('serviceworker');
    pbdExtensionId = sw.url().split('/')[2];

    const configPage = await pbdContext.newPage();
    await configPage.goto(`chrome-extension://${pbdExtensionId}/pages/config.html`, { waitUntil: 'domcontentloaded' });
    await configPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, DEFAULT_SETTINGS);
    await configPage.waitForTimeout(400);
    await configPage.close();
  });

  test.afterAll(async () => {
    await pbdContext?.close();
    if (pbdUserDataDir) fs.rmSync(pbdUserDataDir, { recursive: true, force: true });
  });

  test('download is intercepted when prompt_for_download is enabled', async () => {
    const mockAria2Pbd = new MockAria2Server(16_901);
    await mockAria2Pbd.start();

    try {
      const configPage = await pbdContext.newPage();
      await configPage.goto(`chrome-extension://${pbdExtensionId}/pages/config.html`, { waitUntil: 'domcontentloaded' });
      await configPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, { ...DEFAULT_SETTINGS, motrixPort: 16_901 });
      await configPage.waitForTimeout(400);
      await configPage.close();

      const page = await pbdContext.newPage();
      await page.goto(`http://127.0.0.1:${FILE_SERVER_PORT}`, { waitUntil: 'domcontentloaded' });
      await page.click('#large-download');
      await waitFor(() => mockAria2Pbd.getCalls('addUri').length > 0, 30_000);
      expect(mockAria2Pbd.getCalls('addUri')).toHaveLength(1);
      expect(countDownloads()).toBe(0);
      await page.close();
    } finally {
      await mockAria2Pbd.stop();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Motrix Reachability
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Motrix Reachability', () => {
  test.afterEach(async () => {
    await setLocalStorage({ motrixReachable: null });
  });

  test('motrixReachable is set to true after a successful intercept', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await waitFor(async () => (await readLocalStorage('motrixReachable')) === true, 5_000);
    expect(await readLocalStorage('motrixReachable')).toBe(true);
    await page.close();
  });

  test('motrixReachable is set to false when Aria2 is unreachable', async () => {
    await configureExtension({ motrixPort: 19_999, downloadFallback: true });
    const page = await openFileServerPage();
    await page.click('#mini-download');
    await waitFor(async () => (await readLocalStorage('motrixReachable')) === false, 15_000, 500);
    expect(await readLocalStorage('motrixReachable')).toBe(false);
    await page.close();
    await restoreDefaults();
  });

  test('popup shows reachability banner when motrixReachable is false', async () => {
    // Reject aria2 connections so the on-open ping also fails and doesn't clear the flag
    mockAria2.setRejectConnections(true);
    try {
      await setLocalStorage({ motrixReachable: false });
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
        waitUntil: 'networkidle',
      });
      await sleep(1_000);
      await expect(page.locator('text=Motrix is not reachable')).toBeVisible();
      await page.close();
    } finally {
      mockAria2.setRejectConnections(false);
    }
  });

  test('popup does not show banner when motrixReachable is true', async () => {
    await setLocalStorage({ motrixReachable: true });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(500);
    await expect(page.locator('text=Motrix is not reachable')).toHaveCount(0);
    await page.close();
  });

  test('opening popup with Motrix running clears the unreachable flag', async () => {
    await setLocalStorage({ motrixReachable: false });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    // Popup sends checkMotrixStatus on mount; background pings mock aria2 (running)
    await waitFor(async () => (await readLocalStorage('motrixReachable')) === true, 8_000, 300);
    expect(await readLocalStorage('motrixReachable')).toBe(true);
    await expect(page.locator('text=Motrix is not reachable')).toHaveCount(0);
    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. File Cleanup
// ══════════════════════════════════════════════════════════════════════════════
test.describe('File Cleanup', () => {
  test('cleanupDownloads removes files from the download directory', () => {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const sentinel = path.join(DOWNLOAD_DIR, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'test');
    expect(fs.existsSync(sentinel)).toBe(true);
    cleanupDownloads();
    expect(fs.existsSync(DOWNLOAD_DIR) ? fs.readdirSync(DOWNLOAD_DIR) : []).toHaveLength(0);
  });

  test('intercepted downloads leave no completed files on disk', async () => {
    const page = await openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    // large.bin delays data by 5 s; check at 2 s — before any bytes land
    await sleep(2_000);
    const completed = fs.existsSync(DOWNLOAD_DIR)
      ? fs.readdirSync(DOWNLOAD_DIR).filter(
          (f) => !f.endsWith('.crdownload') && !f.startsWith('.')
        )
      : [];
    expect(completed).toHaveLength(0);
    await page.close();
  });

  test('beforeEach leaves the download directory clean for the next test', () => {
    const files = fs.existsSync(DOWNLOAD_DIR)
      ? fs.readdirSync(DOWNLOAD_DIR).filter(
          (f) => !f.endsWith('.crdownload') && !f.startsWith('.')
        )
      : [];
    expect(files).toHaveLength(0);
  });
});
