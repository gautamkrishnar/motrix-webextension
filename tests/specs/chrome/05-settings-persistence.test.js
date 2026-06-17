'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Settings Persistence', () => {
  test('API key is readable from the config page', async ({ ext }) => {
    expect(await ext.readSetting('motrixAPIkey')).toBe('e2e-test-secret');
  });

  test('RPC port is readable from the config page', async ({ ext }) => {
    expect(await ext.readSetting('motrixPort')).toBe(ext.aria2Port);
  });

  test('extensionStatus toggle persists', async ({ ext }) => {
    await ext.configureExtension({ extensionStatus: false });
    expect(await ext.readSetting('extensionStatus')).toBe(false);
    await ext.configureExtension({ extensionStatus: true });
    expect(await ext.readSetting('extensionStatus')).toBe(true);
  });

  test('minFileSize setting persists', async ({ ext }) => {
    await ext.configureExtension({ minFileSize: 5 });
    expect(await ext.readSetting('minFileSize')).toBe(5);
    await ext.restoreDefaults();
  });

  test('blacklist setting persists as an array', async ({ ext }) => {
    const list = ['example.com', '.torrent', 'no-motrix.org'];
    await ext.configureExtension({ blacklist: list });
    expect(await ext.readSetting('blacklist')).toEqual(list);
    await ext.restoreDefaults();
  });

  test('downloadFallback toggle persists', async ({ ext }) => {
    await ext.configureExtension({ downloadFallback: true });
    expect(await ext.readSetting('downloadFallback')).toBe(true);
    await ext.restoreDefaults();
  });

  test('darkMode toggle persists', async ({ ext }) => {
    await ext.configureExtension({ darkMode: true });
    expect(await ext.readSetting('darkMode')).toBe(true);
    await ext.restoreDefaults();
  });

  test('enableNotifications toggle persists', async ({ ext }) => {
    await ext.configureExtension({ enableNotifications: true });
    expect(await ext.readSetting('enableNotifications')).toBe(true);
    await ext.restoreDefaults();
  });

  test('showContextOption toggle persists', async ({ ext }) => {
    await ext.configureExtension({ showContextOption: false });
    expect(await ext.readSetting('showContextOption')).toBe(false);
    await ext.restoreDefaults();
  });

  test('showOnlyAria toggle persists', async ({ ext }) => {
    await ext.configureExtension({ showOnlyAria: true });
    expect(await ext.readSetting('showOnlyAria')).toBe(true);
    await ext.restoreDefaults();
  });

  test('changed port causes subsequent downloads to use the new port', async ({ ext }) => {
    await ext.configureExtension({ motrixPort: 29_999, downloadFallback: false });
    const page = await ext.openFileServerPage();
    try {
      await page.click('#large-download');
      // Wait for the extension to try the wrong port and give up
      await waitFor(async () => {
        return ext.mockAria2.getCalls('addUri').length === 0;
      }, 10_000, 500, 'no addUri on wrong port');
      expect(ext.mockAria2.getCalls('addUri')).toHaveLength(0);
    } finally {
      await page.close();
      await ext.restoreDefaults();
    }
  });
});
