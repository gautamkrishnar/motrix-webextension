'use strict';

const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MockAria2Server = require('../mock-aria2/server');
const FileServer = require('../file-server/server');
const { waitFor } = require('../helpers/extension');

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');
const BASE_DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');
const TEST_API_KEY = 'e2e-test-secret';

function makeDefaultSettings(aria2Port) {
  return {
    motrixAPIkey: TEST_API_KEY,
    motrixPort: aria2Port,
    extensionStatus: true,
    enableNotifications: false,
    downloadFallback: false,
    minFileSize: 0,
    blacklist: [],
    showContextOption: true,
    showOnlyAria: false,
    hideChromeBar: false,
  };
}

function countDownloadsIn(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => !f.startsWith('.')).length;
}

function cleanupDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, file), { force: true });
  }
}

const test = base.extend({
  ext: [async ({}, use, workerInfo) => {
    const idx = workerInfo.workerIndex;
    const aria2Port = 16900 + idx * 100;
    const filePort = 8080 + idx * 100;
    const downloadDir = path.join(BASE_DOWNLOAD_DIR, `worker-${idx}`);

    const mockAria2 = new MockAria2Server(aria2Port);
    await mockAria2.start();

    const fileServer = new FileServer(filePort);
    await fileServer.start();

    fs.mkdirSync(downloadDir, { recursive: true });

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-e2e-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(defaultDir, 'Preferences'),
      JSON.stringify({
        download: {
          default_directory: downloadDir,
          prompt_for_download: false,
          directory_upgrade: true,
        },
        safebrowsing: { enabled: false },
        profile: { default_content_setting_values: { notifications: 2 } },
      })
    );

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: chromium.executablePath(),
      acceptDownloads: true,
      downloadsPath: downloadDir,
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
    const extensionId = sw.url().split('/')[2];

    // Suppress notifications and Finder-opening APIs in the service worker
    await sw.evaluate(() => {
      if (self.chrome?.notifications) {
        self.chrome.notifications.create = (_id, _opts, cb) => {
          if (typeof cb === 'function') setTimeout(() => cb('suppressed'), 0);
        };
        self.chrome.notifications.clear = (_id, cb) => {
          if (typeof cb === 'function') setTimeout(() => cb(true), 0);
        };
      }
      if (self.chrome?.downloads) {
        self.chrome.downloads.showDefaultFolder = () => {};
        self.chrome.downloads.show = () => Promise.resolve();
      }
    });

    // Persistent helper page for storage operations
    const helperPage = await context.newPage();
    await helperPage.goto(`chrome-extension://${extensionId}/pages/config.html`, {
      waitUntil: 'domcontentloaded',
    });

    const defaults = makeDefaultSettings(aria2Port);
    await helperPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, defaults);

    const fixture = {
      context,
      extensionId,
      mockAria2,
      fileServer,
      helperPage,
      aria2Port,
      filePort,
      downloadDir,
      defaults,

      async configureExtension(settings) {
        await helperPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, settings);
      },

      async readSetting(key) {
        return helperPage.evaluate(
          (k) => new Promise((r) => chrome.storage.sync.get(k, (res) => r(res[k]))),
          key
        );
      },

      async readLocalStorage(key) {
        return helperPage.evaluate(
          (k) => new Promise((r) => chrome.storage.local.get(k, (res) => r(res[k]))),
          key
        );
      },

      async setLocalStorage(obj) {
        await helperPage.evaluate((o) => chrome.storage.local.set(o), obj);
      },

      async cancelPendingBrowserDownloads() {
        await helperPage.evaluate(async () => {
          const items = await new Promise((r) =>
            chrome.downloads.search({ state: 'in_progress' }, r)
          );
          for (const { id } of items) {
            await chrome.downloads.cancel(id).catch(() => {});
            await chrome.downloads.erase({ id }).catch(() => {});
          }
        });
      },

      async openFileServerPage() {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${filePort}`, {
          waitUntil: 'domcontentloaded',
        });
        return page;
      },

      async restoreDefaults() {
        await helperPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, defaults);
      },

      countDownloads() {
        return countDownloadsIn(downloadDir);
      },
    };

    await use(fixture);

    await helperPage.close();
    await context.close();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    if (downloadDir) fs.rmSync(downloadDir, { recursive: true, force: true });
    await mockAria2.stop();
    await fileServer.stop();
  }, { scope: 'worker' }],
});

// Auto-cleanup before each test
test.beforeEach(async ({ ext }) => {
  await ext.cancelPendingBrowserDownloads();
  ext.mockAria2.reset();
  cleanupDir(ext.downloadDir);
});

module.exports = { test, expect, EXTENSION_PATH, TEST_API_KEY, BASE_DOWNLOAD_DIR, waitFor };
