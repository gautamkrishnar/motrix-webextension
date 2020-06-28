const setButton = document.getElementById('setbtn');
const keyInput = document.getElementById('motrixapikey');
const extensionStatus = document.getElementById('extensionstatus');

function onGot(result) {
    console.log(result);
    if (!result.motrixapikey) {
        browser.storage.sync.set({ motrixapikey: null });
        keyInput.value = '';
    } else {
        keyInput.value = result.motrixapikey;
    }
    if (result.extensionstatus === undefined) {
        browser.storage.sync.set({ extensionstatus: true });
        extensionStatus.checked = true;
    } else {
        extensionStatus.checked = result.extensionstatus;
    }
}

function onError(error) {
    console.log(`Error: ${error}`);
}
// Sets API key to null if it is not found else gets value of key and sets it to input box
// Gets extension status and sets default value: true
let getResult = browser.storage.sync.get(['motrixapikey', 'extensionstatus']);
getResult.then(onGot, onError);

// Saves the key to the storage
setButton.addEventListener('click', () => {
    browser.storage.sync.set({ motrixapikey: keyInput.value ? keyInput.value : null });
    window.close();
});

extensionstatus.addEventListener('click', function (e) {
    browser.storage.sync.set({ extensionstatus: e.target.checked });
});
