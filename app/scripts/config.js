'use strict';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  Button,
  Container,
  FormLabel,
  Grid,
  Switch,
  TextField,
} from '@mui/material';
import { Box } from '@mui/system';
import createThemed from './createThemed';
import * as browser from 'webextension-polyfill';

const DEFAULTS = {
  motrixAPIkey: '',
  extensionStatus: true,
  enableNotifications: true,
  downloadFallback: true,
  minFileSize: 0,
  blacklist: [],
  darkMode: false,
  showOnlyAria: false,
  hideChromeBar: true,
  showContextOption: true,
  motrixPort: 16800,
  promptBeforeDownload: false,
};

function save(patch) {
  return browser.storage.sync.set(patch).catch((err) => {
    console.error('Motrix WebExtension: failed to save settings:', err);
  });
}

function ConfigView() {
  const [motrixAPIkey, setMotrixAPIkey] = useState(DEFAULTS.motrixAPIkey);
  const [extensionStatus, setExtensionStatus] = useState(DEFAULTS.extensionStatus);
  const [enableNotifications, setEnableNotifications] = useState(DEFAULTS.enableNotifications);
  const [downloadFallback, setDownloadFallback] = useState(DEFAULTS.downloadFallback);
  const [minFileSize, setMinFileSize] = useState('');
  const [blacklist, setBlacklist] = useState(DEFAULTS.blacklist);
  const [darkMode, setDarkMode] = useState(DEFAULTS.darkMode);
  const [showOnlyAriaDownloads, setShowOnlyAriaDownloads] = useState(DEFAULTS.showOnlyAria);
  const [hideChromeBar, setHideChromeBar] = useState(DEFAULTS.hideChromeBar);
  const [showContextOption, setShowContextOption] = useState(DEFAULTS.showContextOption);
  const [motrixPort, setMotrixPort] = useState(DEFAULTS.motrixPort);
  const [promptBeforeDownload, setPromptBeforeDownload] = useState(DEFAULTS.promptBeforeDownload);

  useEffect(() => {
    browser.storage.sync
      .get(Object.keys(DEFAULTS))
      .then(async (result) => {
        const r = { ...DEFAULTS, ...result };
        setMotrixAPIkey(r.motrixAPIkey);
        setMinFileSize(r.minFileSize === 0 ? '' : String(r.minFileSize));
        setExtensionStatus(r.extensionStatus);
        setDownloadFallback(r.downloadFallback);
        setEnableNotifications(r.enableNotifications);
        setBlacklist(r.blacklist);
        setDarkMode(r.darkMode);
        setShowOnlyAriaDownloads(r.showOnlyAria);
        setHideChromeBar(r.hideChromeBar);
        setShowContextOption(r.showContextOption);
        setMotrixPort(r.motrixPort);
        setPromptBeforeDownload(r.promptBeforeDownload);

        // Persist defaults only for keys that were actually missing from storage
        const missing = Object.fromEntries(
          Object.entries(DEFAULTS).filter(([key]) => !(key in result))
        );
        if (Object.keys(missing).length > 0) {
          await browser.storage.sync.set(missing).catch(() => {});
        }
      })
      .catch((err) => console.error('Motrix WebExtension: failed to load settings:', err));
  }, []);

  return (
    <Container style={{ minHeight: '100vh' }}>
      <Grid container justifyContent="center" spacing={2} padding={2}>
        {/* Motrix API key */}
        <Grid item xs={6}>
          <TextField
            id="motrix-key"
            label="__MSG_setKey__"
            variant="outlined"
            fullWidth
            value={motrixAPIkey}
            onChange={(e) => setMotrixAPIkey(e.target.value)}
          />
        </Grid>
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '100%' }}
            onClick={() => save({ motrixAPIkey })}
          >
            __MSG_setKey__
          </Button>
        </Grid>

        {/* Motrix port */}
        <Grid item xs={6}>
          <TextField
            id="motrix-port"
            label="__MSG_setPort__"
            variant="outlined"
            type="number"
            fullWidth
            value={motrixPort}
            onChange={(e) => setMotrixPort(Number(e.target.value))}
          />
        </Grid>
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '100%' }}
            onClick={() => save({ motrixPort })}
          >
            __MSG_setPort__
          </Button>
        </Grid>

        {/* Minimum file size */}
        <Grid item xs={6}>
          <TextField
            id="minimum-size"
            label="__MSG_setMinSize__"
            variant="outlined"
            type="number"
            fullWidth
            value={minFileSize}
            onChange={(e) => setMinFileSize(e.target.value)}
          />
        </Grid>
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '100%' }}
            onClick={() => save({ minFileSize: minFileSize === '' ? 0 : Number(minFileSize) })}
          >
            __MSG_setSize__
          </Button>
        </Grid>

        {/* Extension status */}
        <Grid item xs={6}>
          <FormLabel>__MSG_extensionStatus__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={extensionStatus}
              onClick={() => {
                const next = !extensionStatus;
                save({ extensionStatus: next });
                setExtensionStatus(next);
              }}
            />
          </Box>
        </Grid>

        {/* Download fallback */}
        <Grid item xs={6}>
          <FormLabel>__MSG_downloadFallback__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={downloadFallback}
              onClick={() => {
                const next = !downloadFallback;
                save({ downloadFallback: next });
                setDownloadFallback(next);
              }}
            />
          </Box>
        </Grid>

        {/* Notifications */}
        <Grid item xs={6}>
          <FormLabel>__MSG_enableNotifications__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={enableNotifications}
              onClick={() => {
                const next = !enableNotifications;
                save({ enableNotifications: next });
                setEnableNotifications(next);
              }}
            />
          </Box>
        </Grid>

        {/* Dark mode */}
        <Grid item xs={6}>
          <FormLabel>__MSG_darkMode__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={darkMode}
              onClick={() => {
                const next = !darkMode;
                save({ darkMode: next });
                setDarkMode(next);
                window.location.reload(false);
              }}
            />
          </Box>
        </Grid>

        {/* Show only aria downloads */}
        <Grid item xs={6}>
          <FormLabel>__MSG_showOnlyAria__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={showOnlyAriaDownloads}
              onClick={() => {
                const next = !showOnlyAriaDownloads;
                save({ showOnlyAria: next });
                setShowOnlyAriaDownloads(next);
              }}
            />
          </Box>
        </Grid>

        {/* Hide Chrome download bar */}
        <Grid item xs={6}>
          <FormLabel>__MSG_hideChromeBar__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={hideChromeBar}
              onClick={() => {
                const next = !hideChromeBar;
                if (browser.downloads.setShelfEnabled && extensionStatus) {
                  browser.downloads.setShelfEnabled(!next);
                }
                save({ hideChromeBar: next });
                setHideChromeBar(next);
              }}
            />
          </Box>
        </Grid>

        {/* Prompt before download */}
        <Grid item xs={6}>
          <FormLabel>__MSG_promptBeforeDownload__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={promptBeforeDownload}
              onClick={() => {
                const next = !promptBeforeDownload;
                save({ promptBeforeDownload: next });
                setPromptBeforeDownload(next);
              }}
            />
          </Box>
        </Grid>

        {/* Show context menu option */}
        <Grid item xs={6}>
          <FormLabel>__MSG_showContextOption__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={showContextOption}
              onClick={() => {
                const next = !showContextOption;
                browser.contextMenus.update(
                  'motrix-webextension-download-context-menu-option',
                  { visible: next }
                );
                save({ showContextOption: next });
                setShowContextOption(next);
              }}
            />
          </Box>
        </Grid>

        {/* Blacklist */}
        <Grid item xs={8}>
          <TextField
            label="__MSG_blacklist__"
            helperText='Both URLs and extensions are valid. For file extensions, only include the extension text (e.g. "pdf"). One entry per line.'
            multiline
            fullWidth
            rows={4}
            value={blacklist.join('\n')}
            onChange={(e) => setBlacklist(e.target.value.split('\n'))}
          />
        </Grid>
        <Grid item xs={6} />
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '56px' }}
            onClick={() => save({ blacklist: blacklist.filter((x) => x !== '') })}
          >
            __MSG_saveBlacklist__
          </Button>
        </Grid>
      </Grid>
    </Container>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(createThemed(ConfigView)), domContainer);
