var setButton = document.getElementById('setbtn');
var keyInput = document.getElementById('motrixapikey');
// Gets value of key and sets it to input box
chrome.storage.sync.get(['motrixapikey'], (data)=> {
    keyInput.value = data.motrixapikey ? data.motrixapikey : '';
});

// Saves the key to the storage
setButton.addEventListener('click',()=>{
    chrome.storage.sync.set({motrixapikey: keyInput.value ? keyInput.value : null});
    window.close();
});
