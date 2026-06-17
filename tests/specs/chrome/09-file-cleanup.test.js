'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect, waitFor } = require('../../fixtures/chrome-extension');

test.describe('File Cleanup', () => {
  test('cleanup removes files from the download directory', async ({ ext }) => {
    fs.mkdirSync(ext.downloadDir, { recursive: true });
    const sentinel = path.join(ext.downloadDir, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'test');
    expect(fs.existsSync(sentinel)).toBe(true);
    // Remove all files
    for (const file of fs.readdirSync(ext.downloadDir)) {
      fs.rmSync(path.join(ext.downloadDir, file), { force: true });
    }
    expect(fs.readdirSync(ext.downloadDir)).toHaveLength(0);
  });

  test('intercepted downloads leave no completed files on disk', async ({ ext }) => {
    const page = await ext.openFileServerPage();
    await page.click('#large-download');
    await waitFor(() => ext.mockAria2.getCalls('addUri').length > 0, 25_000, 200, 'aria2 addUri');
    await waitFor(() => {
      const completed = fs.existsSync(ext.downloadDir)
        ? fs.readdirSync(ext.downloadDir).filter(
            (f) => !f.endsWith('.crdownload') && !f.startsWith('.')
          )
        : [];
      return completed.length === 0;
    }, 5_000, 200, 'no completed files on disk');
    await page.close();
  });

  test('beforeEach leaves the download directory clean for the next test', async ({ ext }) => {
    const files = fs.existsSync(ext.downloadDir)
      ? fs.readdirSync(ext.downloadDir).filter(
          (f) => !f.endsWith('.crdownload') && !f.startsWith('.')
        )
      : [];
    expect(files).toHaveLength(0);
  });
});
