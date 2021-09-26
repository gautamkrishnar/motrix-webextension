const setButton = document.getElementById('setbtn');
const keyInput = document.getElementById('motrixapikey');
const extensionStatus = document.getElementById('extensionstatus');
const enablenotifications = document.getElementById('enablenotifications');

// Sets API key to null if it is not found else gets value of key and sets it to input box
// Gets extension status and sets default value: true
browser.storage.sync
  .get(['motrixapikey', 'extensionstatus', 'enablenotifications'])
  .then(
    (result) => {
      if (!result.motrixapikey) {
        browser.storage.sync.set({ motrixapikey: null });
        keyInput.value = '';
      } else {
        keyInput.value = result.motrixapikey;
      }
      if (typeof result.extensionstatus === 'undefined') {
        browser.storage.sync.set({ extensionstatus: true });
        extensionStatus.checked = true;
      } else {
        extensionStatus.checked = result.extensionstatus;
      }
      if (typeof result.enablenotifications === 'undefined') {
        browser.storage.sync.set({ enablenotifications: true });
        enablenotifications.checked = true;
      } else {
        enablenotifications.checked = result.enablenotifications;
      }
    },
    (error) => {
      console.error(`Error: ${error}`);
    }
  );

// Saves the key to the storage
setButton.addEventListener('click', () => {
  browser.storage.sync.set({
    motrixapikey: keyInput.value ? keyInput.value : null,
  });
  window.close();
});

extensionStatus.addEventListener('click', function (e) {
  browser.storage.sync.set({ extensionstatus: e.target.checked });
});

enablenotifications.addEventListener('click', function (e) {
  browser.storage.sync.set({ enablenotifications: e.target.checked });
});
