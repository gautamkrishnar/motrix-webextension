'use strict';

const { test, expect, waitFor, EXTENSION_PATH, TEST_API_KEY, BASE_DOWNLOAD_DIR } = require('../../fixtures/chrome-extension');
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MockAria2Server = require('../../mock-aria2/server');

const PBD_DOWNLOAD_DIR = path.join(BASE_DOWNLOAD_DIR, 'pbd');

test.describe('Prompt Before Download', () => {
  let pbdContext;
  let pbdExtensionId;
  let pbdUserDataDir;

  test.beforeAll(async () => {
    fs.mkdirSync(PBD_DOWNLOAD_DIR, { recursive: true });
    pbdUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motrix-pbd-'));
    const defaultDir = path.join(pbdUserDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(defaultDir, 'Preferences'),
      JSON.stringify({
        download: {
          default_directory: PBD_DOWNLOAD_DIR,
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
      downloadsPath: PBD_DOWNLOAD_DIR,
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
    await configPage.evaluate(async (s) => { await chrome.storage.sync.set(s); }, {
      motrixAPIkey: TEST_API_KEY,
      motrixPort: 16_901,
      extensionStatus: true,
      enableNotifications: false,
      downloadFallback: false,
      minFileSize: 0,
      blacklist: [],
      showContextOption: true,
      showOnlyAria: false,
      hideChromeBar: false,
    });
    await configPage.close();
  });

  test.afterAll(async () => {
    await pbdContext?.close();
    if (pbdUserDataDir) fs.rmSync(pbdUserDataDir, { recursive: true, force: true });
    fs.rmSync(PBD_DOWNLOAD_DIR, { recursive: true, force: true });
  });

  test('download is intercepted when prompt_for_download is enabled', async ({ ext }) => {
    const mockAria2Pbd = new MockAria2Server(16_901);
    await mockAria2Pbd.start();

    try {
      const page = await pbdContext.newPage();
      await page.goto(`http://127.0.0.1:${ext.filePort}`, { waitUntil: 'domcontentloaded' });
      await page.click('#large-download');
      await waitFor(() => mockAria2Pbd.getCalls('addUri').length > 0, 30_000, 200, 'PBD aria2 addUri');
      expect(mockAria2Pbd.getCalls('addUri')).toHaveLength(1);
      await page.close();
    } finally {
      await mockAria2Pbd.stop();
    }
  });
});
