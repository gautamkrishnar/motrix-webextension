import * as browser from 'webextension-polyfill';

const DEFAULTS = {
  motrixAPIkey: '',
  extensionStatus: true,
  enableNotifications: true,
  downloadFallback: true,
  minFileSize: 0,
  blacklist: [],
  motrixPort: 16800,
  hideChromeBar: true,
  showContextOption: true,
  showOnlyAria: false,
  darkMode: false,
};

class SettingsCache {
  #data = null;

  async init() {
    const stored = await browser.storage.sync.get(Object.keys(DEFAULTS));
    // Merge with defaults so missing keys are never undefined
    this.#data = { ...DEFAULTS, ...stored };

    // Persist any missing defaults to storage so config UI shows correct values
    const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => !(key in stored)));
    if (Object.keys(missing).length > 0) {
      browser.storage.sync.set(missing).catch(() => {});
    }

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        this.#data[key] = newValue;
      }
    });
  }

  get(key) {
    return this.#data?.[key];
  }

  getAll() {
    return { ...this.#data };
  }
}

export const settingsCache = new SettingsCache();
