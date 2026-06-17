'use strict';

/**
 * Motrix WebExtension – Config (Settings) Page Interaction Tests (Playwright)
 *
 * Covers all form interactions on the settings page: text inputs with save
 * buttons, toggle switches, blacklist textarea, persistence across reload,
 * and i18n label rendering.
 */

const { test, expect } = require('@playwright/test');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../../mock-aria2/server');
const FileServer = require('../../file-server/server');
const { DOWNLOAD_DIR, cleanupDownloads } = require('../../helpers/extension');

// ── Constants ──────────────────────────────────────────────────────────────────
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const ARIA2_PORT = 17810;
const FILE_SERVER_PORT = 9190;
const TEST_API_KEY = 'e2e-config-test-secret';

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

/** Open a fresh config page and wait for React to render. */
async function openConfigPage() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/config.html`, {
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

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-config-e2e-'));
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
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. API Key Input and Save
// ══════════════════════════════════════════════════════════════════════════════
test.describe('API Key Input and Save', () => {
  test('entering a new API key and clicking save persists it', async () => {
    const page = await openConfigPage();

    const apiKeyInput = page.locator('#motrix-key');
    await expect(apiKeyInput).toBeVisible();

    // Clear and type new key
    await apiKeyInput.click({ clickCount: 3 }); // select all
    await apiKeyInput.fill('new-test-api-key-12345');

    // Click the save button next to the API key field.
    // The l10n.js script replaces __MSG_setKey__ with "Set Key" after React renders.
    const saveButtons = page.locator('button:has-text("Set Key")');
    await saveButtons.first().click();
    await sleep(500);

    // Verify storage is updated
    const savedKey = await readSetting('motrixAPIkey');
    expect(savedKey).toBe('new-test-api-key-12345');

    await page.close();
  });

  test('saved API key persists after page reload', async () => {
    // Set a key directly
    await configureExtension({ motrixAPIkey: 'persisted-key-abc' });

    const page = await openConfigPage();

    const apiKeyInput = page.locator('#motrix-key');
    const value = await apiKeyInput.inputValue();
    expect(value).toBe('persisted-key-abc');

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Port Number Input and Save
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Port Number Input and Save', () => {
  test('entering a new port and clicking save persists it', async () => {
    const page = await openConfigPage();

    const portInput = page.locator('#motrix-port');
    await expect(portInput).toBeVisible();

    await portInput.click({ clickCount: 3 });
    await portInput.fill('12345');

    // Click the "Set Port" save button
    const saveButton = page.locator('button:has-text("Set Port")');
    await saveButton.click();
    await sleep(500);

    const savedPort = await readSetting('motrixPort');
    expect(savedPort).toBe(12345);

    await page.close();
  });

  test('saved port persists after reload', async () => {
    await configureExtension({ motrixPort: 54321 });

    const page = await openConfigPage();

    const portInput = page.locator('#motrix-port');
    const value = await portInput.inputValue();
    expect(value).toBe('54321');

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Minimum File Size Input and Save
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Minimum File Size Input and Save', () => {
  test('entering a file size and clicking save persists it', async () => {
    const page = await openConfigPage();

    const sizeInput = page.locator('#minimum-size');
    await expect(sizeInput).toBeVisible();

    await sizeInput.click({ clickCount: 3 });
    await sizeInput.fill('10');

    // Click "Set size" button
    const saveButton = page.locator('button:has-text("Set size")');
    await saveButton.click();
    await sleep(500);

    const savedSize = await readSetting('minFileSize');
    expect(savedSize).toBe(10);

    await page.close();
  });

  test('empty size input saves as 0', async () => {
    // First set a non-zero value
    await configureExtension({ minFileSize: 5 });

    const page = await openConfigPage();

    const sizeInput = page.locator('#minimum-size');
    await sizeInput.click({ clickCount: 3 });
    await sizeInput.fill('');

    const saveButton = page.locator('button:has-text("Set size")');
    await saveButton.click();
    await sleep(500);

    const savedSize = await readSetting('minFileSize');
    expect(savedSize).toBe(0);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Extension Status Toggle Switch
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Extension Status Toggle', () => {
  test('clicking extension status switch toggles it off and on', async () => {
    const page = await openConfigPage();

    // MUI Switches render as <input type="checkbox"> inside a <span>.
    // The extension status switch is the first one on the page.
    // We locate it by finding the label text and then the nearby switch.
    const extensionStatusLabel = page.locator('label:has-text("Extension status")');
    await expect(extensionStatusLabel).toBeVisible();

    // The switches are all in the same grid structure — extension status is the
    // first switch. MUI Switch renders an input[type="checkbox"] inside.
    const switches = page.locator('input[type="checkbox"]');
    const extensionSwitch = switches.nth(0); // First switch is extension status

    // Should be checked initially
    await expect(extensionSwitch).toBeChecked();

    // Click the switch container (MUI Switch's click target is the span, not the input)
    const switchContainers = page.locator('.MuiSwitch-root');
    await switchContainers.nth(0).click();
    await sleep(500);

    const statusOff = await readSetting('extensionStatus');
    expect(statusOff).toBe(false);

    // Click again to turn on
    await switchContainers.nth(0).click();
    await sleep(500);

    const statusOn = await readSetting('extensionStatus');
    expect(statusOn).toBe(true);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Download Fallback Toggle
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Download Fallback Toggle', () => {
  test('toggling download fallback switch updates storage', async () => {
    const page = await openConfigPage();

    // Download fallback is the second switch
    const switchContainers = page.locator('.MuiSwitch-root');
    const fallbackSwitch = switchContainers.nth(1);

    // Initially false (as set in defaults)
    await fallbackSwitch.click();
    await sleep(500);

    const fallbackOn = await readSetting('downloadFallback');
    expect(fallbackOn).toBe(true);

    // Toggle back
    await fallbackSwitch.click();
    await sleep(500);

    const fallbackOff = await readSetting('downloadFallback');
    expect(fallbackOff).toBe(false);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Dark Mode Toggle
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Dark Mode Toggle', () => {
  test('toggling dark mode reloads the page and persists the setting', async () => {
    const page = await openConfigPage();

    // Dark mode is the 4th switch (extension status, download fallback,
    // notifications, dark mode)
    const switchContainers = page.locator('.MuiSwitch-root');
    const darkModeSwitch = switchContainers.nth(3);

    // Click to enable dark mode — this triggers window.location.reload()
    await darkModeSwitch.click();

    // The page will reload; wait for it
    await page.waitForLoadState('networkidle');
    await sleep(1_500);

    // Verify the setting persisted
    const darkMode = await readSetting('darkMode');
    expect(darkMode).toBe(true);

    // Verify the page rendered with dark theme by checking background color
    const bgColor = await page.evaluate(() => {
      const root = document.querySelector('#react-root > div');
      return root ? getComputedStyle(root).backgroundColor : '';
    });
    // Dark mode MUI background is dark (e.g., rgb(18, 18, 18) or similar)
    // Light mode would be rgb(255, 255, 255) or similar
    expect(bgColor).not.toBe('rgb(255, 255, 255)');

    await page.close();
    // Restore light mode for subsequent tests
    await configureExtension({ darkMode: false });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Notification Toggle
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Notification Toggle', () => {
  test('toggling notifications switch updates storage', async () => {
    const page = await openConfigPage();

    // Notifications is the 3rd switch
    const switchContainers = page.locator('.MuiSwitch-root');
    const notifSwitch = switchContainers.nth(2);

    // Initially false
    await notifSwitch.click();
    await sleep(500);

    const notifOn = await readSetting('enableNotifications');
    expect(notifOn).toBe(true);

    // Toggle back
    await notifSwitch.click();
    await sleep(500);

    const notifOff = await readSetting('enableNotifications');
    expect(notifOff).toBe(false);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Blacklist Textarea
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Blacklist Textarea', () => {
  test('entering domains and saving filters out empty lines', async () => {
    const page = await openConfigPage();

    // The blacklist is a multiline TextField — find it by label text
    const blacklistTextarea = page.locator('textarea').first();
    await expect(blacklistTextarea).toBeVisible();

    // Clear and type domains with an empty line
    await blacklistTextarea.click();
    await blacklistTextarea.fill('example.com\nblocked.net\n\ntest.org');

    // Click "Save blacklist" button
    const saveButton = page.locator('button:has-text("Save blacklist")');
    await saveButton.click();
    await sleep(500);

    // Verify storage — empty strings should be filtered out
    const savedBlacklist = await readSetting('blacklist');
    expect(savedBlacklist).toEqual(['example.com', 'blocked.net', 'test.org']);

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. All Settings Persist After Reload
// ══════════════════════════════════════════════════════════════════════════════
test.describe('All Settings Persist After Reload', () => {
  test('all fields show saved values after page reload', async () => {
    // Set non-default values via storage
    await configureExtension({
      motrixAPIkey: 'reload-test-key',
      motrixPort: 99999,
      minFileSize: 42,
      extensionStatus: false,
      downloadFallback: true,
      enableNotifications: true,
      darkMode: false,
      showOnlyAria: true,
      hideChromeBar: false,
      showContextOption: false,
      blacklist: ['reloaded.com', 'persist.net'],
    });

    const page = await openConfigPage();

    // Verify text fields — MUI TextField puts id on the wrapper div,
    // so target the inner <input> for value assertions.
    const apiKeyInput = page.locator('#motrix-key');
    await expect(apiKeyInput).toHaveValue('reload-test-key');

    const portInput = page.locator('#motrix-port');
    await expect(portInput).toHaveValue('99999');

    const sizeInput = page.locator('#minimum-size');
    await expect(sizeInput).toHaveValue('42');

    // Verify switches — check the checkbox inputs
    const switches = page.locator('input[type="checkbox"]');

    // Extension status (1st switch) — should be unchecked
    await expect(switches.nth(0)).not.toBeChecked();

    // Download fallback (2nd switch) — should be checked
    await expect(switches.nth(1)).toBeChecked();

    // Notifications (3rd switch) — should be checked
    await expect(switches.nth(2)).toBeChecked();

    // Verify blacklist textarea content
    const blacklistTextarea = page.locator('textarea').first();
    const blacklistValue = await blacklistTextarea.inputValue();
    expect(blacklistValue).toContain('reloaded.com');
    expect(blacklistValue).toContain('persist.net');

    await page.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. i18n Labels Rendered
// ══════════════════════════════════════════════════════════════════════════════
test.describe('i18n Labels Rendered', () => {
  test('no __MSG_ text is visible on the config page', async () => {
    const page = await openConfigPage();

    // Get all visible text content
    const bodyText = await page.evaluate(() => document.body.innerText);

    // No unresolved i18n placeholders should remain
    expect(bodyText).not.toContain('__MSG_');

    // Verify that some expected labels are actually rendered
    expect(bodyText).toContain('Set Key');
    expect(bodyText).toContain('Set Port');
    expect(bodyText).toContain('Extension status');

    await page.close();
  });
});
