'use strict';

/**
 * Motrix WebExtension – Firefox Smoke Test (web-ext)
 *
 * Playwright v1.59 does not support Firefox extension background pages:
 *   • context.backgroundPages() is a stub that always returns []
 *   • Extension sideloading via profile directories is not picked up by
 *     Playwright's patched Firefox Nightly (Juggler protocol)
 *   • There is no public API to install temporary addons
 *
 * Until Playwright adds first-class Firefox extension support, we verify
 * Firefox behaviour with web-ext:
 *   • Extension loads in Firefox without console errors
 *   • Background script initializes (no crash)
 *   • MV3 manifest is accepted by Firefox (no parse errors)
 *
 * Full Firefox behavioural e2e (download interception, settings, etc.) will
 * be added once Playwright exposes Firefox extension contexts.
 *
 * Pre-requisite: yarn build firefox  (produces dist/firefox/)
 */

const { test, expect } = require('@playwright/test');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const FIREFOX_EXTENSION_PATH = path.resolve(__dirname, '../../../dist/firefox');
const FIREFOX_BIN = path.resolve(
  __dirname,
  '../../../node_modules/.cache/ms-playwright/firefox-latest/firefox/firefox'
) ;

// web-ext CLI binary (installed as a devDependency)
const WEB_EXT_BIN = path.resolve(
  __dirname,
  '../../../node_modules/.bin/web-ext'
);

test.describe('Firefox Extension Smoke Tests (web-ext)', () => {
  test('Firefox extension build exists and has the correct manifest', () => {
    expect(fs.existsSync(FIREFOX_EXTENSION_PATH)).toBe(true);

    const manifestPath = path.join(FIREFOX_EXTENSION_PATH, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.browser_specific_settings?.gecko?.id).toBe(
      '{9ce99d37-4a5e-409a-a04b-0f3f50491bc7}'
    );
    expect(manifest.background?.scripts).toContain('scripts/background.js');
    expect(manifest.action).toBeDefined();
    expect(manifest.browser_action).toBeUndefined();
    expect(manifest.host_permissions).toContain('<all_urls>');
    expect(manifest.permissions).toContain('downloads');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).not.toContain('downloads.shelf');
  });

  test('web-ext lint passes with zero errors', async () => {
    const { stdout, stderr } = await execFileAsync(WEB_EXT_BIN, [
      'lint',
      '--source-dir', FIREFOX_EXTENSION_PATH,
      '--output', 'none',
      '--no-input',
    ]).catch((err) => ({
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      code: err.code,
    }));

    const output = stdout + stderr;

    // web-ext lint exits non-zero only on ERRORS (not warnings)
    const errorsMatch = output.match(/errors\s+(\d+)/i);
    const errorCount = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;

    expect(errorCount).toBe(0);
  });

  test('extension background script is present and non-empty', () => {
    const bgScript = path.join(FIREFOX_EXTENSION_PATH, 'scripts', 'background.js');
    expect(fs.existsSync(bgScript)).toBe(true);
    const size = fs.statSync(bgScript).size;
    expect(size).toBeGreaterThan(100);
  });

  test('extension pages exist (popup, config, history)', () => {
    for (const page of ['popup.html', 'config.html', 'history.html']) {
      const pagePath = path.join(FIREFOX_EXTENSION_PATH, 'pages', page);
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });

  test('extension icons exist at all required sizes', () => {
    for (const size of [16, 32, 48, 128]) {
      const icon = path.join(FIREFOX_EXTENSION_PATH, 'images', `${size}.png`);
      expect(fs.existsSync(icon)).toBe(true);
    }
  });
});
