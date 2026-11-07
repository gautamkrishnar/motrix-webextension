// Firefox's erase() only removes the list entry and leaves an in-progress transfer running
// (the browser then downloads the file a second time, or leaves a .part file). Cancel first so
// the transfer really stops, drop any partial file, and only then erase the entry.
export async function dropDownload(downloads, id) {
  await downloads.cancel(id).catch(() => {});
  if (downloads.removeFile) await downloads.removeFile(id).catch(() => {});
  await downloads.erase({ id }).catch(() => {});
}
