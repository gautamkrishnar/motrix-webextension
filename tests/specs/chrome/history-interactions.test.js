'use strict';

/**
 * Motrix WebExtension – History Page Interaction Tests (Playwright)
 *
 * Covers the history page: empty state, download rendering after interception,
 * real-time updates via storage listener, multiple downloads, fallback icons,
 * dark mode theming, and i18n label rendering.
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../../mock-aria2/server');
const FileServer = require('../../file-server/server');
const { waitFor } = require('../../helpers/extension');

const DOWNLOAD_DIR = path.resolve(__dirname, '../../downloads/history-ui');

function cleanupDownloads() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.rmSync(path.join(DOWNLOAD_DIR, file), { recursive: true, force: true });
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 17820;
const FILE_SERVER_PORT = 9200;
const TEST_API_KEY = 'e2e-history-test-secret';

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
  darkMode: false,
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

async function openHistoryPage() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/history.html`, {
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

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-history-e2e-'));
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
  // Clear history between tests
  await setLocalStorage({ history: [], downloads: {} });
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Empty State
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Empty State', () => {
  test('history page renders without errors when no downloads exist', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`chrome-extension://${extensionId}/pages/history.html`, {
      waitUntil: 'networkidle',
    });
    await sleep(1_000);

    expect(errors).toHaveLength(0);

    // Verify React mounted — the react-root should have content
    const reactRoot = page.locator('#react-root');
    await expect(reactRoot).toBeVisible();
    const innerHTML = await reactRoot.evaluate((el) => el.innerHTML);
    expect(innerHTML.length).toBeGreaterThan(50);

    // No download Paper elements should be present
    const downloadItems = page.locator('.MuiPaper-root');
    await expect(downloadItems).toHaveCount(0);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Downloads Appear After Interception
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Downloads Appear After Interception', () => {
  test('history page shows download entry after intercepting a file', async () => {
    // Trigger a download
    const dlPage = await openFileServerPage();
    await dlPage.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await dlPage.close();
    await sleep(1_500);

    // Open history page
    const histPage = await openHistoryPage();

    // Verify at least one download entry appears
    const downloadItems = histPage.locator('.MuiPaper-root');
    const count = await downloadItems.count();
    expect(count).toBeGreaterThan(0);

    // The entry should contain content (text rendered)
    const content = await histPage.evaluate(() => document.body.innerText);
    expect(content.length).toBeGreaterThan(20);

    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Real-time Update via Storage Listener
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Real-time Update via Storage Listener', () => {
  test('download appears in history page without reload when storage changes', async () => {
    // Open history page FIRST — it should be empty
    const histPage = await openHistoryPage();

    const initialItems = histPage.locator('.MuiPaper-root');
    await expect(initialItems).toHaveCount(0);

    // Trigger a download from another tab — this will update storage.local.history
    const dlPage = await openFileServerPage();
    await dlPage.click('#large-download');
    await waitFor(() => mockAria2.getCalls('addUri').length > 0, 25_000);
    await dlPage.close();

    // The history page should update reactively via storage.onChanged listener.
    // Wait for a Paper element to appear (the download entry).
    await waitFor(async () => {
      const count = await histPage.locator('.MuiPaper-root').count();
      return count > 0;
    }, 15_000, 500);

    const updatedItems = histPage.locator('.MuiPaper-root');
    const count = await updatedItems.count();
    expect(count).toBeGreaterThan(0);

    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Multiple Downloads Listed
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Multiple Downloads Listed', () => {
  test('three downloads all appear in history', async () => {
    // Open history page first, then inject data — the storage.onChanged
    // listener in history.js will pick up the change and re-render.
    const histPage = await openHistoryPage();

    // Inject history data from within the history page context
    await histPage.evaluate((data) => chrome.storage.local.set(data), {
      history: [
        { gid: 'gid-1', name: 'file-one.bin', status: 'completed', downloader: 'aria' },
        { gid: 'gid-2', name: 'file-two.bin', status: 'completed', downloader: 'aria' },
        { gid: 'gid-3', name: 'file-three.bin', status: 'completed', downloader: 'aria' },
      ],
    });

    // Wait for React to re-render via storage.onChanged listener
    await waitFor(async () => {
      const html = await histPage.evaluate(() => document.body.innerHTML);
      return html.includes('file-one.bin') && html.includes('file-two.bin') && html.includes('file-three.bin');
    }, 10_000, 300, 'all 3 downloads to render in history');

    const content = await histPage.evaluate(() => document.body.innerText);
    expect(content).toContain('file-one.bin');
    expect(content).toContain('file-two.bin');
    expect(content).toContain('file-three.bin');

    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Fallback Icon for Missing Download Icons
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Fallback Icon for Missing Download Icons', () => {
  test('downloads without icon show default file icon instead of broken image', async () => {
    // Seed a download entry without an icon
    await setLocalStorage({
      history: [
        { gid: 'no-icon-gid', name: 'no-icon-file.bin', status: 'completed', downloader: 'aria' },
      ],
    });

    const histPage = await openHistoryPage();

    // Should have one download entry
    const downloadItems = histPage.locator('.MuiPaper-root');
    await expect(downloadItems).toHaveCount(1);

    // There should be no <img> tags with empty or broken src
    const brokenImages = await histPage.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      return Array.from(imgs).filter((img) => !img.src || img.naturalWidth === 0).length;
    });
    expect(brokenImages).toBe(0);

    // The InsertDriveFileIcon SVG should be rendered instead
    const fileIcon = histPage.locator('[data-testid="InsertDriveFileIcon"]');
    await expect(fileIcon).toBeVisible();

    await histPage.close();
  });

  test('download with icon property renders the img tag', async () => {
    // Seed a download entry WITH an icon (using a data URI so it loads)
    const tinyIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await setLocalStorage({
      history: [
        { gid: 'icon-gid', name: 'with-icon.bin', status: 'completed', downloader: 'aria', icon: tinyIcon },
      ],
    });

    const histPage = await openHistoryPage();

    // Should render an <img> with the icon src
    const img = histPage.locator('img[alt="icon"]');
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toContain('data:image/png');

    // No fallback InsertDriveFileIcon should be present
    const fileIcon = histPage.locator('[data-testid="InsertDriveFileIcon"]');
    await expect(fileIcon).toHaveCount(0);

    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Dark Mode on History Page
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Dark Mode on History Page', () => {
  test('history page renders with dark theme when darkMode is enabled', async () => {
    await configureExtension({ ...DEFAULT_SETTINGS, darkMode: true });

    const histPage = await openHistoryPage();

    // Check that the root themed wrapper has a dark background
    const bgColor = await histPage.evaluate(() => {
      const root = document.querySelector('#react-root > div');
      return root ? getComputedStyle(root).backgroundColor : '';
    });

    // Dark mode MUI default background is a dark color (e.g., rgb(18, 18, 18))
    // Parse the RGB values and verify it's dark
    const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(match).toBeTruthy();
    const [, r, g, b] = match.map(Number);
    // In dark mode, all RGB channels should be well below 128
    expect(r).toBeLessThan(128);
    expect(g).toBeLessThan(128);
    expect(b).toBeLessThan(128);

    await histPage.close();
    // Restore light mode
    await configureExtension({ ...DEFAULT_SETTINGS, darkMode: false });
  });

  test('history page has light background when darkMode is disabled', async () => {
    await configureExtension({ ...DEFAULT_SETTINGS, darkMode: false });

    const histPage = await openHistoryPage();

    const bgColor = await histPage.evaluate(() => {
      const root = document.querySelector('#react-root > div');
      return root ? getComputedStyle(root).backgroundColor : '';
    });

    const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(match).toBeTruthy();
    const [, r, g, b] = match.map(Number);
    // In light mode, all RGB channels should be above 200
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);

    await histPage.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. i18n on History Page
// ══════════════════════════════════════════════════════════════════════════════
test.describe('i18n on History Page', () => {
  test('no __MSG_ text is visible on the history page', async () => {
    // Seed a download with null name to trigger the unknownFilename i18n string
    await setLocalStorage({
      history: [
        { gid: 'i18n-gid', name: null, status: 'completed', downloader: 'aria' },
      ],
    });

    const histPage = await openHistoryPage();

    const bodyText = await histPage.evaluate(() => document.body.innerText);

    // No unresolved i18n placeholders should remain
    expect(bodyText).not.toContain('__MSG_');

    // The null name should have been replaced with the "unknown" fallback
    expect(bodyText).toContain('unknown');

    await histPage.close();
  });
});
