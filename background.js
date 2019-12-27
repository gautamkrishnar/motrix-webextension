'use strict';

console.log('hhsy');
chrome.runtime.onInstalled.addListener(function() {
  // Sets key to null if it is not found
  chrome.storage.sync.get(['motrixapikey'], function(result) {
    if (!result.motrixapikey){
      chrome.storage.sync.set({motrixapikey: null});
    }
  });

});
