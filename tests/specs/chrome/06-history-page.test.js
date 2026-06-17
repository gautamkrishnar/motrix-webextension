'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('History Page', () => {
  test('history page renders after an intercepted download', async ({ ext }) => {
    const dlPage = await ext.openFileServerPage();
    await dlPage.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    await dlPage.close();

    const histPage = await ext.context.newPage();
    const errors = [];
    histPage.on('pageerror', (e) => errors.push(e.message));
    await histPage.goto(`chrome-extension://${ext.extensionId}/pages/history.html`, {
      waitUntil: 'networkidle',
    });
    await histPage.waitForFunction(() => document.body.innerHTML.length > 100);

    expect(errors).toHaveLength(0);
    const content = await histPage.evaluate(() => document.body.innerHTML);
    expect(content.length).toBeGreaterThan(100);
    expect(ext.countDownloads()).toBe(0);
    await histPage.close();
  });
});
