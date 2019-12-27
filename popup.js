document.getElementById('setbtn').addEventListener('click',()=>{
    chrome.storage.sync.set({motrixapikey: document.getElementById('motrixapikey').value ? document.getElementById('motrixapikey').value : null});
});
