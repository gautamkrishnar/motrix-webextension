import { useEffect, useState } from 'react';
import * as browser from 'webextension-polyfill';

/**
 * Subscribe to browser.storage values and re-render on changes.
 *
 * @param {'local'|'sync'} area   - Storage area to read from.
 * @param {string[]}       keys   - Keys to read from that area.
 * @returns {object}               - Plain object with the requested keys.
 */
export function useBrowserStorage(area, keys) {
  const [values, setValues] = useState({});

  useEffect(() => {
    const storage = browser.storage[area];

    storage.get(keys).then((result) => setValues(result));

    const listener = (changes, changedArea) => {
      if (changedArea !== area) return;
      const relevant = keys.filter((k) => k in changes);
      if (relevant.length === 0) return;
      setValues((prev) => {
        const next = { ...prev };
        for (const k of relevant) next[k] = changes[k].newValue;
        return next;
      });
    };

    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [area]);

  return values;
}
