import * as browser from 'webextension-polyfill';

const MAX_HISTORY = 100;
const ACTIVE_STATUSES = new Set(['downloading', 'intercepting']);

class DownloadStore {
  #map = new Map();

  async init() {
    const { downloads = {} } = await browser.storage.local.get('downloads');
    for (const [id, item] of Object.entries(downloads)) {
      this.#map.set(Number(id), item);
    }
  }

  get(id) {
    return this.#map.get(id);
  }

  getAll() {
    return [...this.#map.values()];
  }

  async upsert(id, fields) {
    const existing = this.#map.get(id) ?? {};
    this.#map.set(id, { ...existing, ...fields });
    await this.#persist();
  }

  async delete(id) {
    this.#map.delete(id);
    await this.#persist();
  }

  async #persist() {
    const all = [...this.#map.entries()].sort(([, a], [, b]) => new Date(b.startTime) - new Date(a.startTime));

    const active = all.filter(([, item]) => ACTIVE_STATUSES.has(item.status));
    const inactive = all.filter(([, item]) => !ACTIVE_STATUSES.has(item.status));

    // Keep all active + the most recent completed/errored up to MAX_HISTORY
    const toKeep = [...active, ...inactive.slice(0, MAX_HISTORY)];
    const keepIds = new Set(toKeep.map(([id]) => id));

    // Trim the in-memory map to prevent unbounded growth
    for (const id of this.#map.keys()) {
      if (!keepIds.has(id)) this.#map.delete(id);
    }

    const history = toKeep.slice(0, MAX_HISTORY).map(([, item]) => item);

    await browser.storage.local.set({
      downloads: Object.fromEntries(this.#map),
      history,
    });
  }
}

export const downloadStore = new DownloadStore();
