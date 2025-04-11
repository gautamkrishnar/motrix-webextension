// Function to save history as a string
// Sorts by date from the latest and trunctates to 100 elements
export function historyToArray(historyMap) {
  return [...historyMap.values()]
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 100);
}

export function parsePath(path) {
  const filename = path.replace(/^.*[\\/]/, '');
  const directory = path.match(/(.*)[/\\]/)?.[1] ?? '';

  return {
    dir: directory,
    out: filename,
  };
}
export const isFirefox  = navigator.userAgent.includes('Firefox') ;
