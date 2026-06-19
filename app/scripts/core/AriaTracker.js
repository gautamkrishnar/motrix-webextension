import * as browser from 'webextension-polyfill';

function setExtensionIcon(filename) {
  const path = browser.runtime.getURL(`images/${filename}`);
  browser.action.setIcon({ path });
}

const MAX_POLL_FAILURES = 3;

export function trackWithAria2(gid, browserDownloadId, store, aria2Service) {
  let cancelled = false;
  let polling = false;
  let progressInterval = null;
  let consecutiveFailures = 0;

  const cleanup = () => {
    cancelled = true;
    clearInterval(progressInterval);
    aria2Service.unregister(gid);
  };

  // aria2 has no progress event — poll only for bytes downloaded.
  // The polling lock prevents concurrent calls if getStatus takes >1s.
  progressInterval = setInterval(async () => {
    if (cancelled || polling) return;
    polling = true;
    try {
      const status = await aria2Service.getStatus(gid);
      consecutiveFailures = 0;
      if (!cancelled) {
        const downloaded = parseInt(status.completedLength, 10);
        const size = parseInt(status.totalLength, 10);
        const update = {};
        if (Number.isFinite(downloaded)) update.downloaded = downloaded;
        if (Number.isFinite(size) && size > 0) update.size = size;
        if (Object.keys(update).length > 0) {
          await store.upsert(browserDownloadId, update);
        }
      }
    } catch {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_POLL_FAILURES) {
        cleanup();
        await store.upsert(browserDownloadId, { status: 'error' });
      }
    } finally {
      polling = false;
    }
  }, 1000);

  aria2Service.register(gid, {
    onStart: async () => {
      setExtensionIcon('dwld.png');
      await store.upsert(browserDownloadId, { status: 'downloading' });
    },
    onComplete: async () => {
      cleanup();
      await store.upsert(browserDownloadId, { status: 'completed' });
      if (!store.getAll().some((d) => d.status === 'downloading')) {
        setTimeout(() => {
          if (!store.getAll().some((d) => d.status === 'downloading')) {
            setExtensionIcon('32.png');
          }
        }, 1000);
      }
    },
    onStop: async () => {
      cleanup();
      await store.upsert(browserDownloadId, { status: 'stop' });
    },
    onError: async () => {
      cleanup();
      await store.upsert(browserDownloadId, { status: 'error' });
    },
  });
}
