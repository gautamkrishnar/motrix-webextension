'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Fallback Behaviour', () => {
  test('browser downloads file when Aria2 is unreachable and fallback is enabled', async ({ ext }) => {
    await ext.configureExtension({ motrixPort: 19_999, downloadFallback: true });

    const miniUrl = `http://127.0.0.1:${ext.filePort}/files/mini.bin`;

    const countBefore = await ext.helperPage.evaluate(
      (url) => new Promise((r) => chrome.downloads.search({ url }, (res) => r(res.length))),
      miniUrl
    );

    const page = await ext.openFileServerPage();
    await page.click('#mini-download');

    await waitFor(async () => {
      const completed = await ext.helperPage.evaluate(
        (url) => new Promise((r) =>
          chrome.downloads.search({ url, state: 'complete' }, (res) => r(res.length))),
        miniUrl
      );
      return completed > countBefore;
    }, 30_000, 300, 'fallback download to complete');

    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(ext.countDownloads()).toBeGreaterThan(0);

    await ext.helperPage.evaluate(async (url) => {
      const items = await new Promise((r) => chrome.downloads.search({ url }, r));
      for (const { id } of items) {
        await chrome.downloads.erase({ id }).catch(() => {});
      }
    }, miniUrl);

    await page.close();
    await ext.restoreDefaults();
  });

  test('download is cancelled when Aria2 is unreachable and fallback is disabled', async ({ ext }) => {
    await ext.configureExtension({ motrixPort: 19_999, downloadFallback: false });
    const page = await ext.openFileServerPage();
    try {
      await page.click('#large-download');
      // Wait long enough for the extension to attempt connection and give up
      await waitFor(async () => {
        // Check that no addUri was sent and no file landed
        return ext.mockAria2.getCalls('addUri').length === 0 && ext.countDownloads() === 0;
      }, 15_000, 500, 'download to be cancelled');
      expect(ext.countDownloads()).toBe(0);
    } finally {
      await page.close();
      await ext.restoreDefaults();
    }
  });
});
