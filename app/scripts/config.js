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

function ConfigView() {
  const [motrixAPIkey, setMotrixAPIkey] = useState('');
  const [extensionStatus, setExtensionStatus] = useState(false);
  const [enableNotifications, setEnableNotifications] = useState(false);
  const [enableDownloadPrompt, setEnableDownloadPrompt] = useState(false);
  const [minFileSize, setMinFileSize] = useState('');

  useEffect(() => {
    browser.storage.sync
      .get([
        'motrixAPIkey',
        'extensionStatus',
        'enableNotifications',
        'enableDownloadPrompt',
        'minFileSize',
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
        },
        (error) => {
          console.error(`Error: ${error}`);
        }
      );
  }, []);

  return (
    <Container>
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

        {/* Minimum file size input */}
        <Grid item xs={6}>
          <TextField
            id="minimum-size"
            label="__MSG_setMinSize__"
            variant="outlined"
            type="number"
            id="minSize"
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
      </Grid>
    </Container>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(ConfigView), domContainer);
