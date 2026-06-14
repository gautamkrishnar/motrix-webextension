import * as browser from 'webextension-polyfill';

const MAX_HISTORY = 100;
const ACTIVE_STATUSES = new Set(['downloading', 'intercepting']);
const TERMINAL_STATUSES = new Set(['completed', 'error', 'stop']);
const PERSIST_THROTTLE_MS = 500;

class DownloadStore {
  #map = new Map();
  #persistTimer = null;
  #persistPromise = null;

  async init() {
    const { downloads = {} } = await browser.storage.local.get('downloads');
    for (const [id, item] of Object.entries(downloads)) {
      this.#map.set(Number(id), item);
    }
  }

  async cleanupStale() {
    let changed = false;
    for (const [id, item] of this.#map) {
      if (ACTIVE_STATUSES.has(item.status)) {
        this.#map.set(id, { ...item, status: 'error' });
        changed = true;
      }
    }
    if (changed) await this.#flushPersist();
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

    if (fields.status && TERMINAL_STATUSES.has(fields.status)) {
      await this.#flushPersist();
    } else {
      this.#schedulePersist();
    }
  }

  async delete(id) {
    this.#map.delete(id);
    await this.#flushPersist();
  }

  #schedulePersist() {
    if (this.#persistTimer != null) return;
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = null;
      this.#flushPersist();
    }, PERSIST_THROTTLE_MS);
  }

  async #flushPersist() {
    clearTimeout(this.#persistTimer);
    this.#persistTimer = null;
    this.#persistPromise = this.#doPersist();
    await this.#persistPromise;
  }

  async #doPersist() {
    const all = [...this.#map.entries()].sort(([, a], [, b]) => new Date(b.startTime) - new Date(a.startTime));

    const active = all.filter(([, item]) => ACTIVE_STATUSES.has(item.status));
    const inactive = all.filter(([, item]) => !ACTIVE_STATUSES.has(item.status));

    const toKeep = [...active, ...inactive.slice(0, MAX_HISTORY)];
    const keepIds = new Set(toKeep.map(([id]) => id));

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
