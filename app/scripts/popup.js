const setButton = document.getElementById('setBtn');
const keyInput = document.getElementById('motrixAPIkey');
const extensionStatus = document.getElementById('extensionStatus');
const enableNotifications = document.getElementById('enableNotifications');
const enableDownloadPrompt = document.getElementById('enableDownloadPrompt');

// Sets API key to null if it is not found else gets value of key and sets it to input box
// Gets extension status and sets default value: true
browser.storage.sync
  .get([
    'motrixAPIkey',
    'extensionStatus',
    'enableNotifications',
    'enableDownloadPrompt',
  ])
  .then(
    (result) => {
      if (!result.motrixAPIkey) {
        browser.storage.sync.set({ motrixAPIkey: null });
        keyInput.value = '';
      } else {
        keyInput.value = result.motrixAPIkey;
      }

      if (typeof result.extensionStatus === 'undefined') {
        browser.storage.sync.set({ extensionStatus: true });
        extensionStatus.checked = true;
      } else {
        extensionStatus.checked = result.extensionStatus;
      }

      if (typeof result.enableNotifications === 'undefined') {
        browser.storage.sync.set({ enableNotifications: true });
        enableNotifications.checked = true;
      } else {
        enableNotifications.checked = result.enableNotifications;
      }

      if (typeof result.enableDownloadPrompt === 'undefined') {
        browser.storage.sync.set({ enableDownloadPrompt: false });
        enableDownloadPrompt.checked = false;
      } else {
        enableDownloadPrompt.checked = result.enableDownloadPrompt;
      }
    },
    (error) => {
      console.error(`Error: ${error}`);
    }
  );

// Saves the key to the storage
setButton.addEventListener('click', () => {
  browser.storage.sync.set({
    motrixAPIkey: keyInput.value ? keyInput.value : null,
  });
  window.close();
});

extensionStatus.addEventListener('click', function (e) {
  browser.storage.sync.set({ extensionStatus: e.target.checked });
});

enableNotifications.addEventListener('click', function (e) {
  browser.storage.sync.set({ enableNotifications: e.target.checked });
});

enableDownloadPrompt.addEventListener('click', function (e) {
  browser.storage.sync.set({ enableDownloadPrompt: e.target.checked });
});

// Re-enabling the UI
window.addEventListener(
  'DOMContentLoaded',
  () => {
    document.documentElement.classList.add('initialized');
  },
  { once: true }
);
