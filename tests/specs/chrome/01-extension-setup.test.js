'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Extension Setup', () => {
  test('service worker is registered with the correct extension ID', async ({ ext }) => {
    const sw = ext.context.serviceWorkers().find((w) =>
      w.url().startsWith(`chrome-extension://${ext.extensionId}/`)
    );
    expect(sw).toBeDefined();
  });

  test('popup page loads without JavaScript errors', async ({ ext }) => {
    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${ext.extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.innerHTML.length > 200);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('popup contains rendered content (React mounted)', async ({ ext }) => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/pages/popup.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.innerHTML.length > 200);
    const len = await page.evaluate(() => document.body.innerHTML.length);
    expect(len).toBeGreaterThan(200);
    await page.close();
  });

  test('settings page loads without JavaScript errors', async ({ ext }) => {
    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${ext.extensionId}/pages/config.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('history page loads without JavaScript errors', async ({ ext }) => {
    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${ext.extensionId}/pages/history.html`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('extension storage is initialised with correct default settings', async ({ ext }) => {
    expect(await ext.readSetting('motrixPort')).toBe(ext.aria2Port);
    expect(await ext.readSetting('motrixAPIkey')).toBe('e2e-test-secret');
    expect(await ext.readSetting('extensionStatus')).toBe(true);
  });
});
