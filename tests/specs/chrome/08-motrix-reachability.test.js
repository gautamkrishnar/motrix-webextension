'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Motrix Reachability', () => {
  test.afterEach(async ({ ext }) => {
    await ext.setLocalStorage({ motrixReachable: null });
  });

  test('motrixReachable is set to true after a successful intercept', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    await waitFor(async () => (await ext.readLocalStorage('motrixReachable')) === true, 5_000, 200, 'motrixReachable=true');
    expect(await ext.readLocalStorage('motrixReachable')).toBe(true);
    await page.close();
  });

  test('motrixReachable is set to false when Aria2 is unreachable', async ({ ext }) => {
    await ext.configureExtension({ motrixPort: 19_999, downloadFallback: true });
    const page = await ext.openFileServerPage();
    await page.click('#mini-download');
    await waitFor(async () => (await ext.readLocalStorage('motrixReachable')) === false, 15_000, 500, 'motrixReachable=false');
    expect(await ext.readLocalStorage('motrixReachable')).toBe(false);
    await page.close();
    await ext.restoreDefaults();
  });

  test('popup shows reachability banner when motrixReachable is false', async ({ ext }) => {
    ext.mockAria2.setRejectConnections(true);
    try {
      await ext.setLocalStorage({ motrixReachable: false });
      const page = await ext.context.newPage();
      await page.goto(`chrome-extension://${ext.extensionId}/pages/popup.html`, {
        waitUntil: 'networkidle',
      });
      await expect(page.locator('text=Motrix is not reachable')).toBeVisible({ timeout: 5_000 });
      await page.close();
    } finally {
      ext.mockAria2.setRejectConnections(false);
    }
  });

  test('popup does not show banner when motrixReachable is true', async ({ ext }) => {
    await ext.setLocalStorage({ motrixReachable: true });
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.innerHTML.length > 200);
    await expect(page.locator('text=Motrix is not reachable')).toHaveCount(0);
    await page.close();
  });

  test('opening popup with Motrix running clears the unreachable flag', async ({ ext }) => {
    await ext.setLocalStorage({ motrixReachable: false });
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await waitFor(async () => (await ext.readLocalStorage('motrixReachable')) === true, 8_000, 300, 'popup clears unreachable flag');
    expect(await ext.readLocalStorage('motrixReachable')).toBe(true);
    await expect(page.locator('text=Motrix is not reachable')).toHaveCount(0);
    await page.close();
  });
});
