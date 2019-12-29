const setButton = document.getElementById('setbtn');
const keyInput = document.getElementById('motrixapikey');
const extensionStatus = document.getElementById('extensionstatus');

// Sets API key to null if it is not found else gets value of key and sets it to input box
// Gets extension status and sets default value: true
chrome.storage.sync.get(['motrixapikey', 'extensionstatus'], function (result) {
    console.log(result);
    if (!result.motrixapikey) {
        chrome.storage.sync.set({motrixapikey: null});
        keyInput.value = '';
    } else {
        keyInput.value = result.motrixapikey;
    }
    if (result.extensionstatus === undefined) {
        chrome.storage.sync.set({extensionstatus: true});
        extensionStatus.checked = true;
    } else {
        extensionStatus.checked = result.extensionstatus;
    }
});

// Saves the key to the storage
setButton.addEventListener('click', () => {
    chrome.storage.sync.set({motrixapikey: keyInput.value ? keyInput.value : null});
    window.close();
});

extensionstatus.addEventListener('click', function (e) {
    chrome.storage.sync.set({extensionstatus: e.target.checked});
});
