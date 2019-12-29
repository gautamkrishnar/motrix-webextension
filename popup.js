const setButton = document.getElementById('setbtn');
const keyInput = document.getElementById('motrixapikey');

// Sets key to null if it is not found else gets value of key and sets it to input box
chrome.storage.sync.get(['motrixapikey'], function(result) {
    if (!result.motrixapikey){
        chrome.storage.sync.set({motrixapikey: null});
        keyInput.value = '';
    } else {
        keyInput.value = result.motrixapikey;
    }
});

// Saves the key to the storage
setButton.addEventListener('click',()=>{
    chrome.storage.sync.set({motrixapikey: keyInput.value ? keyInput.value : null});
    window.close();
});
