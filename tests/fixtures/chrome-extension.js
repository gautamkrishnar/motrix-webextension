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
  // Ignore dotfiles and Chrome's in-progress partial files (foo.crdownload / foo.part).
  // A partial temp and its final file briefly coexist, which would otherwise double-count
  // a single download and make the count-based assertions flaky.
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.') && !f.endsWith('.crdownload') && !f.endsWith('.part')).length;
}

function cleanupDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, file), { force: true });
  }
}

// Runs INSIDE the extension service worker. The extension's settingsCache updates
// asynchronously via a storage.onChanged listener, so a download clicked right after
// chrome.storage.sync.set() can be handled with stale settings. This mirrors the applied
// sync settings into self.__appliedSettings: this listener and settingsCache's listener
// run within the same synchronous onChanged dispatch, so once __appliedSettings reflects a
// change the cache has too. Idempotent, and re-seeds from storage because the mirror is
// lost whenever the MV3 service worker restarts.
function installSettingsMirror() {
  if (!self.__settingsMirrorReady) {
    self.__settingsMirrorReady = true;
    self.__appliedSettings = {};
    chrome.storage.sync.get(null, (all) => Object.assign(self.__appliedSettings, all));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const key of Object.keys(changes)) {
        self.__appliedSettings[key] = changes[key].newValue;
      }
    });
  }
  return self.__appliedSettings;
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

    // Suppress notifications and Finder-opening APIs in the service worker, and
    // install a mirror of the applied sync settings (see installSettingsMirror).
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
    await sw.evaluate(installSettingsMirror);

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

      // Wait until the service worker's settings cache has applied the given values, so a
      // subsequent download isn't handled with stale settings. Self-heals the mirror if the
      // MV3 service worker restarted and dropped it.
      async waitForSettingsApplied(expected) {
        await waitFor(async () => {
          const liveSw = context.serviceWorkers()[0] || sw;
          const applied = await liveSw.evaluate(installSettingsMirror);
          return Object.entries(expected).every(
            ([k, v]) => JSON.stringify(applied?.[k]) === JSON.stringify(v)
          );
        }, 5_000, 50, 'service worker to apply settings');
      },

      async configureExtension(settings) {
        await helperPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, settings);
        await this.waitForSettingsApplied(settings);
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

      // Wait until the extension has finished processing any download still in flight. An
      // intercepted download is held paused (state 'in_progress') while the extension resolves
      // its filename and sends it to aria2, so waiting for no in-progress downloads ensures a
      // previous test's addUri has already been sent — it can't bleed into the next test.
      async waitForDownloadsIdle(timeoutMs = 4000) {
        await waitFor(async () => {
          const n = await helperPage.evaluate(
            () => new Promise((r) => chrome.downloads.search({ state: 'in_progress' }, (res) => r(res.length)))
          );
          return n === 0;
        }, timeoutMs, 100, 'browser downloads to be idle').catch(() => {});
      },

      async cancelPendingBrowserDownloads() {
        await helperPage.evaluate(async () => {
          // Cancel/remove every download in any state so no in-flight transfer from a
          // previous test can finalize a file into the shared download dir afterwards.
          const items = await new Promise((r) => chrome.downloads.search({}, r));
          for (const { id } of items) {
            await chrome.downloads.cancel(id).catch(() => {});
            if (chrome.downloads.removeFile) await chrome.downloads.removeFile(id).catch(() => {});
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
        await this.waitForSettingsApplied(defaults);
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
  // Let any in-flight interception from the previous test finish (the extension holds the item
  // paused while it resolves the filename and sends it to aria2) before clearing state, so a
  // late addUri / downloaded file is less likely to leak into this test's assertions.
  await ext.waitForDownloadsIdle();
  await ext.cancelPendingBrowserDownloads();
  ext.mockAria2.reset();
  cleanupDir(ext.downloadDir);
});

module.exports = { test, expect, EXTENSION_PATH, TEST_API_KEY, BASE_DOWNLOAD_DIR, waitFor };
