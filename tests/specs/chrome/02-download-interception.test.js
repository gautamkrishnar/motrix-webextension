'use strict';

const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('Download Interception', () => {
  test('large file download is intercepted — Aria2 receives addUri', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(1);
    expect(ext.countDownloads()).toBe(0);
    await page.close();
  });

  test('addUri call carries correct token', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    expect(ext.mockAria2.getCalls('addUri')[0].params[0]).toBe(`token:e2e-test-secret`);
    await page.close();
  });

  test('addUri call carries the correct download URL', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    const urls = ext.mockAria2.getCalls('addUri')[0].params[1];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls[0]).toContain('/files/large.bin');
    await page.close();
  });

  test('addUri call carries a filename in options', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    const options = ext.mockAria2.getCalls('addUri')[0].params[2];
    expect(options).toBeDefined();
    expect(typeof options.out).toBe('string');
    expect(options.out.length).toBeGreaterThan(0);
    await page.close();
  });

  test('browser download item is erased after interception', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    await waitFor(() => {
      const crdownloads = ext.countDownloads();
      return crdownloads === 0;
    }, 5_000, 200, 'no leftover .crdownload files');
    expect(ext.countDownloads()).toBe(0);
    await page.close();
  });

  test('two sequential downloads are each intercepted independently', async ({ ext }) => {
    const p1 = await ext.openFileServerPage();
    await p1.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length === 1, 25_000, 200, 'first addUri');
    await p1.close();

    ext.mockAria2.reset();

    const p2 = await ext.openFileServerPage();
    await p2.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length === 1, 25_000, 200, 'second addUri');
    await p2.close();

    expect(ext.mockAria2.getCalls('addUri')).toHaveLength(1);
  });
});
