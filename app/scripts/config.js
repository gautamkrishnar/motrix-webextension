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

function ConfigView() {
  const [motrixAPIkey, setMotrixAPIkey] = useState('');
  const [extensionStatus, setExtensionStatus] = useState(false);
  const [enableNotifications, setEnableNotifications] = useState(false);
  const [enableDownloadPrompt, setEnableDownloadPrompt] = useState(false);
  const [minFileSize, setMinFileSize] = useState('');
  const [blacklist, setBlacklist] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showOnlyAriaDownloads, setShowOnlyAriaDownloads] = useState(false);
  const [hideChromeBar, setHideChromeBar] = useState(true);
  const [showContextOption, setShowContextOption] = useState(true);
  const [motrixPort, setMotrixPort] = useState(16800);

  useEffect(() => {
    browser.storage.sync
      .get([
        'motrixAPIkey',
        'extensionStatus',
        'enableNotifications',
        'enableDownloadPrompt',
        'minFileSize',
        'blacklist',
        'darkMode',
        'showOnlyAria',
        'hideChromeBar',
        'showContextOption',
        'motrixPort',
      ])
      .then(
        (result) => {
          if (!result.motrixAPIkey) {
            browser.storage.sync.set({ motrixAPIkey: null });
            setMotrixAPIkey('');
          } else {
            setMotrixAPIkey(result.motrixAPIkey);
          }

          if (typeof result.minFileSize === 'undefined') {
            browser.storage.sync.set({ minFileSize: 0 });
            setMinFileSize('');
          } else {
            setMinFileSize(
              result.minFileSize === 0 ? '' : result.minFileSize.toString()
            );
          }

          if (typeof result.extensionStatus === 'undefined') {
            browser.storage.sync.set({ extensionStatus: true });
            setExtensionStatus(true);
          } else {
            setExtensionStatus(result.extensionStatus);
          }

          if (typeof result.enableNotifications === 'undefined') {
            browser.storage.sync.set({ enableNotifications: true });
            setEnableNotifications(true);
          } else {
            setEnableNotifications(result.enableNotifications);
          }

          if (typeof result.enableDownloadPrompt === 'undefined') {
            browser.storage.sync.set({ enableDownloadPrompt: false });
            setEnableDownloadPrompt(false);
          } else {
            setEnableDownloadPrompt(result.enableDownloadPrompt);
          }

          if (typeof result.blacklist === 'undefined') {
            browser.storage.sync.set({ blacklist: [] });
            setBlacklist([]);
          } else {
            setBlacklist(result.blacklist);
          }

          if (typeof result.darkMode === 'undefined') {
            browser.storage.sync.set({ darkMode: false });
            setDarkMode(false);
          } else {
            setDarkMode(result.darkMode);
          }

          if (typeof result.showOnlyAria === 'undefined') {
            browser.storage.sync.set({ showOnlyAria: false });
            setShowOnlyAriaDownloads(false);
          } else {
            setShowOnlyAriaDownloads(result.showOnlyAria);
          }

          if (typeof result.hideChromeBar === 'undefined') {
            browser.storage.sync.set({ hideChromeBar: true });
            setHideChromeBar(true);
          } else {
            setHideChromeBar(result.hideChromeBar);
          }
          if (typeof result.showContextOption === 'undefined') {
            browser.storage.sync.set({ showContextOption: true });
            setShowContextOption(true);
          } else {
            setShowContextOption(result.showContextOption);
          }
          if (typeof result.motrixPort === 'undefined') {
            browser.storage.sync.set({ motrixPort: 16800 });
            setMotrixPort(16800);
          } else {
            setMotrixPort(result.motrixPort);
          }
        },
        (error) => {
          console.error(`Error: ${error}`);
        }
      );
  }, []);

  return (
    <Container style={{ minHeight: '100vh' }}>
      <Grid container justifyContent="center" spacing={2} padding={2}>
        {/* Motrix key input */}
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
            onClick={() => browser.storage.sync.set({ motrixAPIkey })}
          >
            __MSG_setKey__
          </Button>
        </Grid>
        {/* Motrix port input */}
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
            onClick={() => browser.storage.sync.set({ motrixPort })}
          >
            __MSG_setPort__
          </Button>
        </Grid>
        {/* Minimum file size input */}
        <Grid item xs={6}>
          <TextField
            id="minimum-size"
            label="__MSG_setMinSize__"
            variant="outlined"
            type="number"
            max="1000000"
            fullWidth
            value={minFileSize}
            onChange={(e) => setMinFileSize(e.target.value)}
          />
        </Grid>
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '100%' }}
            onClick={() => browser.storage.sync.set({ minFileSize })}
          >
            __MSG_setSize__
          </Button>
        </Grid>

        {/* Extension status switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_extensionStatus__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={extensionStatus}
              onClick={() => {
                browser.storage.sync.set({ extensionStatus: !extensionStatus });
                setExtensionStatus((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Notifications status switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_enableNotifications__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={enableNotifications}
              onClick={() => {
                browser.storage.sync.set({
                  enableNotifications: !enableNotifications,
                });
                setEnableNotifications((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Prompt status switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_promptBeforeDownload__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={enableDownloadPrompt}
              onClick={() => {
                browser.storage.sync.set({
                  enableDownloadPrompt: !enableDownloadPrompt,
                });
                setEnableDownloadPrompt((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Dark mode switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_darkMode__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={darkMode}
              onClick={() => {
                browser.storage.sync.set({
                  darkMode: !darkMode,
                });
                setDarkMode((x) => !x);
                window.location.reload(false);
              }}
            />
          </Box>
        </Grid>

        {/* Show only aria switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_showOnlyAria__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={showOnlyAriaDownloads}
              onClick={() => {
                browser.storage.sync.set({
                  showOnlyAria: !showOnlyAriaDownloads,
                });
                setShowOnlyAriaDownloads((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Show hide chrome bar switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_hideChromeBar__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={hideChromeBar}
              onClick={() => {
                if (browser.downloads.setShelfEnabled) {
                  browser.downloads.setShelfEnabled(!!hideChromeBar);
                }
                browser.storage.sync.set({
                  hideChromeBar: !hideChromeBar,
                });
                setHideChromeBar((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Show context option switch */}
        <Grid item xs={6}>
          <FormLabel>__MSG_showContextOption__</FormLabel>
        </Grid>
        <Grid item xs={2}>
          <Box display="flex" justifyContent="center">
            <Switch
              checked={showContextOption}
              onClick={() => {
                browser.contextMenus.update(
                  'motrix-webextension-download-context-menu-option',
                  {
                    visible: !showContextOption,
                  }
                );
                browser.storage.sync.set({
                  showContextOption: !showContextOption,
                });
                setShowContextOption((x) => !x);
              }}
            />
          </Box>
        </Grid>

        {/* Blacklist */}
        <Grid item xs={8}>
          <TextField
            label="__MSG_blacklist__"
            helperText='Both URLS and extensions are valid. For file extensions, only include the text of the extension itself (e.g. "pdf"). Entries should be their own lines.'
            multiline
            fullWidth
            rows={4}
            value={blacklist.join('\n')}
            onChange={(e) => setBlacklist(e.target.value.split('\n'))}
          />
        </Grid>
        {/* Save blacklist button */}
        <Grid item xs={6} />
        <Grid item xs={2}>
          <Button
            variant="outlined"
            style={{ width: '100%', height: '56px' }}
            onClick={() =>
              browser.storage.sync.set({
                blacklist: blacklist.filter((x) => x !== ''),
              })
            }
          >
            __MSG_saveBlacklist__
          </Button>
        </Grid>

        {/* End of grid */}
      </Grid>
    </Container>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(createThemed(ConfigView)), domContainer);
