'use strict';

/**
 * Motrix WebExtension – Popup UI Interaction Tests (Playwright)
 *
 * Covers interactive elements in the popup page: power toggle, navigation
 * buttons, clear all, download list rendering, reachability banner, and
 * showOnlyAria filter.
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../../mock-aria2/server');
const FileServer = require('../../file-server/server');
const { waitFor } = require('../../helpers/extension');

const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads/popup-ui');

function cleanupDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.rmSync(path.join(DOWNLOAD_DIR, file), { recursive: true, force: true });
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 17800;
const FILE_SERVER_PORT = 9180;
const TEST_API_KEY = 'e2e-popup-test-secret';

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

// ── Shared state ──────────────────────────────────────────────────────────────
let context;
let extensionId;
let mockAria2;
let fileServer;
let userDataDir;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Extension helpers ──────────────────────────────────────────────────────────

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

async function openFileServerPage() {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${FILE_SERVER_PORT}`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

async function openPopup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
    waitUntil: 'networkidle',
  });
  await sleep(1_000);
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

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-popup-e2e-'));
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
  // Clear local storage history between tests
  await setLocalStorage({ history: [], downloads: {}, motrixReachable: null });
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Power Toggle Button
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Power Toggle Button', () => {
  test('clicking power button toggles extensionStatus to false and changes icon color', async () => {
    const page = await openPopup();

    // The power button is the first IconButton with PowerSettingsNewIcon.
    // When extensionStatus is true, the icon should have success (green) color.
    const powerButton = page.locator('button').filter({ has: page.locator('[data-testid="PowerSettingsNewIcon"]') }).first();
    await expect(powerButton).toBeVisible();

    // Verify initial green color
    const iconBefore = page.locator('[data-testid="PowerSettingsNewIcon"]').first();
    const colorBefore = await iconBefore.evaluate((el) => getComputedStyle(el).color);
    // MUI success color is green-ish
    expect(colorBefore).toMatch(/rgb\(.*[1-9].*,\s*\d+,/); // non-zero red/green component

    // Click to toggle off
    await powerButton.click();
    await sleep(500);

    // Verify storage updated
    const status = await readSetting('extensionStatus');
    expect(status).toBe(false);

    // Verify icon color changed to error (red)
    const colorAfter = await iconBefore.evaluate((el) => getComputedStyle(el).color);
    expect(colorAfter).not.toBe(colorBefore);

    await page.close();
  });

  test('toggling power button back restores extensionStatus to true', async () => {
    // Start with extension disabled
    await configureExtension({ extensionStatus: false });

    const page = await openPopup();
    const powerButton = page.locator('button').filter({ has: page.locator('[data-testid="PowerSettingsNewIcon"]') }).first();

    // Click to toggle on
    await powerButton.click();
    await sleep(500);

    const status = await readSetting('extensionStatus');
    expect(status).toBe(true);

    // Verify icon color is now success (green)
    const icon = page.locator('[data-testid="PowerSettingsNewIcon"]').first();
    const classList = await icon.evaluate((el) => el.classList.toString());
    expect(classList).toContain('colorSuccess');

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Settings Button Opens Config Page
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Settings Button', () => {
  test('clicking settings icon opens config.html in a new tab', async () => {
    const page = await openPopup();

    const settingsButton = page.locator('button').filter({ has: page.locator('[data-testid="SettingsIcon"]') });
    await expect(settingsButton).toBeVisible();

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      settingsButton.click(),
    ]);

    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('pages/config.html');

    await newPage.close();
    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. History Button Opens History Page
// ══════════════════════════════════════════════════════════════════════════════
test.describe('History Button', () => {
  test('clicking history icon opens history.html in a new tab', async () => {
    const page = await openPopup();

    const historyButton = page.locator('button').filter({ has: page.locator('[data-testid="HistoryIcon"]') });
    await expect(historyButton).toBeVisible();

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      historyButton.click(),
    ]);

    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('pages/history.html');

    await newPage.close();
    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Clear All Button
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Clear All Button', () => {
  test('clicking clear all clears download history from storage', async () => {
    // First, seed some history data
    await setLocalStorage({
      history: [
        { gid: 'test-gid-1', name: 'testfile.bin', status: 'completed', downloader: 'aria' },
        { gid: 'test-gid-2', name: 'another.bin', status: 'completed', downloader: 'aria' },
      ],
    });

    // Open popup and verify items are rendered
    const page = await openPopup();

    // Click clear all button
    const clearButton = page.locator('button').filter({ has: page.locator('[data-testid="ClearAllIcon"]') });
    await expect(clearButton).toBeVisible();
    await clearButton.click();
    await sleep(500);

    // Verify storage is cleared
    const history = await readLocalStorage('history');
    expect(history).toEqual([]);

    await page.close();
  });

  test('popup shows empty list after clearing all downloads', async () => {
    // Seed history
    await setLocalStorage({
      history: [
        { gid: 'test-gid-1', name: 'testfile.bin', status: 'completed', downloader: 'aria' },
      ],
    });

    const page1 = await openPopup();

    // Click clear all
    const clearButton = page1.locator('button').filter({ has: page1.locator('[data-testid="ClearAllIcon"]') });
    await clearButton.click();
    await sleep(500);

    // The popup listens to storage changes via useBrowserStorage, so the list
    // should update reactively. Verify no Paper elements contain download names.
    const downloadItems = page1.locator('div.text');
    await expect(downloadItems).toHaveCount(0);

    await page1.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Open Downloads Folder Button
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Open Downloads Folder Button', () => {
  test('clicking folder button does not throw errors', async () => {
    const page = await openPopup();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // The toolbar folder button is the last FolderIcon button in the toolbar row.
    // It's the one directly in the toolbar (not inside a download item).
    const folderButtons = page.locator('button').filter({ has: page.locator('[data-testid="FolderIcon"]') });
    // The toolbar folder button is the first one (when no downloads present)
    const folderButton = folderButtons.first();
    await expect(folderButton).toBeVisible();
    await folderButton.click();
    await sleep(500);

    expect(errors).toHaveLength(0);
    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Download List Rendering
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download List Rendering', () => {
  test('intercepted download appears in popup with filename', async () => {
    // Trigger a download
    const dlPage = await openFileServerPage();
    await dlPage.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await dlPage.close();

    // Wait for the download to be persisted to history in local storage.
    // The mock completes the download ~2.5 s after addUri, and DownloadStore
    // flushes immediately on terminal status changes.
    await waitFor(async () => {
      const history = await readLocalStorage('history');
      return Array.isArray(history) && history.length > 0;
    }, 15_000, 500);

    // Open popup and check for the download entry
    const page = await openPopup();

    // popup.js renders each history item's filename in <div className="text">.
    // Wait for at least one download item to appear via useBrowserStorage.
    await waitFor(async () => {
      const html = await page.evaluate(() => document.body.innerHTML);
      return html.includes('class="text"');
    }, 10_000, 300, 'download item to appear in popup');

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Reachability Banner Interaction
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Reachability Banner Interaction', () => {
  test('banner is visible and has clickable button when motrix is unreachable', async () => {
    // Reject aria2 connections so the popup's ping doesn't clear the flag
    mockAria2.setRejectConnections(true);
    try {
      await setLocalStorage({ motrixReachable: false });
      const page = await openPopup();

      // Verify the banner text is visible
      await expect(page.locator('text=Motrix is not reachable')).toBeVisible();

      // The banner is a MUI Paper containing the warning text and an IconButton.
      // Find the Paper that contains the warning text, then locate the button inside it.
      const bannerPaper = page.locator('.MuiPaper-root', { hasText: 'Motrix is not reachable' });
      const bannerButton = bannerPaper.locator('button');
      await expect(bannerButton).toBeVisible({ timeout: 3_000 });

      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await bannerButton.click();
      await sleep(500);
      expect(errors).toHaveLength(0);

      await page.close();
    } finally {
      mockAria2.setRejectConnections(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. showOnlyAria Filter
// ══════════════════════════════════════════════════════════════════════════════
test.describe('showOnlyAria Filter', () => {
  test('with showOnlyAria true, only aria downloads appear; with false, all appear', async () => {
    // Seed history with both aria and browser downloads
    await setLocalStorage({
      history: [
        { gid: 'aria-gid-1', name: 'aria-download.bin', status: 'completed', downloader: 'aria' },
        { gid: 'browser-gid-1', name: 'browser-download.bin', status: 'completed', downloader: 'browser' },
      ],
    });

    // Set showOnlyAria to true
    await configureExtension({ ...DEFAULT_SETTINGS, showOnlyAria: true });

    const page1 = await openPopup();

    // Only the aria download should be visible
    await expect(page1.locator('text=aria-download.bin')).toBeVisible();
    await expect(page1.locator('text=browser-download.bin')).toHaveCount(0);

    await page1.close();

    // Set showOnlyAria to false
    await configureExtension({ ...DEFAULT_SETTINGS, showOnlyAria: false });

    const page2 = await openPopup();

    // Both downloads should be visible
    await expect(page2.locator('text=aria-download.bin')).toBeVisible();
    await expect(page2.locator('text=browser-download.bin')).toBeVisible();

    await page2.close();
  });
});
