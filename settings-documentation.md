# Settings for Motrix WebExtension

The settings page for the extension allows a user to set up the extension for use with the Motrix desktop client, and to modify behaviors to be more convenient.

## Notes for initial configuration:
After first installing the extension, the RPC API Key must be set in order to work with the desktop client. This key can be generated in the Motrix desktop client under Preferences > Advanced > RPC Secret.

Additionally, for Firefox, `Prompt before download` must be disabled due to a WebExtension API issue.

### Set Key
Allows the user to set the private RPC API key being used by the Motrix desktop client. This key can be found/generated in the Motrix desktop client under Preferences > Advanced > RPC Secret.

### Set minimum file size (mb)
Allows the user to specify a minimum size of file in order for the extension to handle downloading. Files smaller than this threshold will download with the browser's built-in download manager.

### Extension status
Allows the user to "disable" the extension (without having to fully disable in the browser). When turned off, the extension will defer to the built-in browser download manager for all downloads.

### Prompt before download
**(Currently only recommended for Chromium browsers)** Allows the user to turn on/off the use of confirmation dialogs for downloads. E.g. when the user initiates a download, a popup window will ask to confirm or cancel the download.

### Dark Mode
Allows the user to turn on/off Dark mode theming 

### Show only Motrix downloads in the popup
Allows the user to include/exclude downloads from the built-in download manager in the extension's download history that is shown in its popup pane.

### Hide chrome download bar
**(Only for Chromium browsers)** Allows the user to keep the built-in download bar hidden (e.g. the bar that shows at the bottom of the screen for a typical download in Chrome)

### Show "Download with Motrix" context option
Allows the user to enable a context menu option that will send the download directly to Motrix (bypassing file size or blacklist filters).

### Blacklist
Allows the user to specify filters to defer downloads to the browser's built-in download manager. To format:
 * The Blacklist uses line breaks (`\n`, specifically) to define separate entries (as opposed to how some other extensions use space- or comma-separated entries)
  * Thus for multiple entries, ensure that each is given its own line.
 * The Blacklist is able to handle a mix of full URLs and file extensions (some other extensions define these with different/separate settings)
 * To specify a file extension, only include the text of the extension itself (e.g. "pdf" or "PDF")
  * Do not include a period (`.`) or wildcard (`*`), or the entry will fail to process.
