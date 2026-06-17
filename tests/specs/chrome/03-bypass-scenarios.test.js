'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Bypass Scenarios', () => {
  test('small file is NOT intercepted when minFileSize is 1 MB', async ({ ext }) => {
    await ext.configureExtension({ minFileSize: 1 });
    const page = await ext.openFileServerPage();
    await page.click('#small-download');
    await waitFor(() => ext.countDownloads() > 0, 15_000, 200, 'small file to land on disk');
    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(ext.countDownloads()).toBe(1);
    await page.close();
    await ext.restoreDefaults();
  });

  test('blacklisted URL is NOT intercepted', async ({ ext }) => {
    await ext.configureExtension({ blacklist: ['blacklisted'] });
    const page = await ext.openFileServerPage();
    await page.click('#blacklisted-download');
    await waitFor(() => ext.countDownloads() > 0, 15_000, 200, 'blacklisted file to land on disk');
    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(ext.countDownloads()).toBe(1);
    await page.close();
    await ext.restoreDefaults();
  });

  test('downloads are NOT intercepted when extension is disabled', async ({ ext }) => {
    await ext.configureExtension({ extensionStatus: false });
    const page = await ext.openFileServerPage();
    await page.click('#mini-download');
    await waitFor(() => ext.countDownloads() > 0, 15_000, 200, 'bypass download to complete');
    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(0);
    expect(ext.countDownloads()).toBe(1);
    await page.close();
    await ext.restoreDefaults();
  });

  test('non-blacklisted URL is still intercepted alongside a blacklisted pattern', async ({ ext }) => {
    await ext.configureExtension({ blacklist: ['blacklisted'] });
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(ext.countDownloads()).toBe(0);
    await page.close();
    await ext.restoreDefaults();
  });
});
