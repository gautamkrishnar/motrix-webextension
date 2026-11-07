'use strict';

const { test, expect } = require('@playwright/test');

function fakeDownloads({ removeFile = true, failRemoveFile = false } = {}) {
  const calls = [];
  const op = (name, fail) => async () => {
    await new Promise((r) => setTimeout(r, 5));
    calls.push(name);
    if (fail) throw new Error(`${name} failed`);
  };
  const api = { cancel: op('cancel'), erase: op('erase') };
  if (removeFile) api.removeFile = op('removeFile', failRemoveFile);
  return { api, calls };
}

test.describe('dropDownload', () => {
  test('cancels, then removes the partial file, then erases', async () => {
    const { dropDownload } = await import('../../../app/scripts/core/dropDownload.mjs');
    const { api, calls } = fakeDownloads();
    await dropDownload(api, 1);
    expect(calls).toEqual(['cancel', 'removeFile', 'erase']);
  });

  test('still erases when removeFile is missing', async () => {
    const { dropDownload } = await import('../../../app/scripts/core/dropDownload.mjs');
    const { api, calls } = fakeDownloads({ removeFile: false });
    await dropDownload(api, 1);
    expect(calls).toEqual(['cancel', 'erase']);
  });

  test('still erases when removeFile rejects', async () => {
    const { dropDownload } = await import('../../../app/scripts/core/dropDownload.mjs');
    const { api, calls } = fakeDownloads({ failRemoveFile: true });
    await dropDownload(api, 1);
    expect(calls).toEqual(['cancel', 'removeFile', 'erase']);
  });
});
