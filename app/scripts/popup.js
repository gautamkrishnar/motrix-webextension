'use strict';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Grid, Paper, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import createThemed from './createThemed';
import PropTypes from 'prop-types';
import * as browser from 'webextension-polyfill';
import { useBrowserStorage } from './hooks/useBrowserStorage';
import DownloadProgress from './components/DownloadProgress';

function FolderButton({ element }) {
  if (element.status !== 'completed') return null;

  const onClick = element.downloader === 'browser' ? () => browser.downloads.show(element.gid) : () => browser.tabs.create({ url: 'motrix://' });

  return (
    <IconButton variant="outlined" onClick={onClick}>
      <FolderIcon />
    </IconButton>
  );
}

FolderButton.propTypes = {
  element: PropTypes.object,
};

function PopupView() {
  const { history: downloadHistory = [], motrixReachable = null } = useBrowserStorage('local', ['history', 'motrixReachable']);
  const { extensionStatus = false, showOnlyAria: showOnlyAriaDownloads = false } = useBrowserStorage('sync', ['extensionStatus', 'showOnlyAria']);

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'checkMotrixStatus' }).catch(() => {});
  }, []);

  const onExtensionStatusChange = (status) => {
    browser.storage.sync.set({ extensionStatus: status });
  };

  const parseName = (name) => {
    if (name == null) return browser.i18n.getMessage('unknownFilename');
    if (name.length < 52) return name;
    return `${name.slice(0, 52)}...`;
  };

  return (
    <Grid container justifyContent="center" spacing={2}>
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => onExtensionStatusChange(!extensionStatus)}>
          <PowerSettingsNewIcon color={extensionStatus ? 'success' : 'error'} />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => browser.tabs.create({ url: browser.runtime.getURL('pages/config.html') })}>
          <SettingsIcon />
        </IconButton>
      </Grid>
      <Grid item xs={1} />
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => browser.tabs.create({ url: browser.runtime.getURL('pages/history.html') })}>
          <HistoryIcon />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton
          variant="outlined"
          onClick={() => {
            browser.storage.local.set({ history: [], downloads: {} });
          }}
        >
          <ClearAllIcon />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => browser.downloads.showDefaultFolder()}>
          <FolderIcon />
        </IconButton>
      </Grid>
      {motrixReachable === false && (
        <Grid item xs={11}>
          <Paper
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              marginBottom: '8px',
              backgroundColor: '#fff3e0',
            }}
          >
            <span style={{ fontSize: '13px', color: '#e65100' }}>{browser.i18n.getMessage('motrixNotReachable')}</span>
            <IconButton size="small" onClick={() => browser.tabs.create({ url: 'motrix://' })} style={{ color: '#e65100' }}>
              <PowerSettingsNewIcon fontSize="small" />
            </IconButton>
          </Paper>
        </Grid>
      )}
      <Grid item xs={11}>
        {downloadHistory
          .filter((el) => !showOnlyAriaDownloads || el.downloader === 'aria')
          .slice(0, 4)
          .map((el) => (
            <Paper key={el.gid} style={{ display: 'flex', marginBottom: '8px' }}>
              <div
                style={{
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <img src={el.icon ?? ''} alt="icon" />
              </div>
              <div
                style={{
                  padding: '8px',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div className="text">{parseName(el.name)}</div>
                <DownloadProgress status={el.status} downloaded={el.downloaded} size={el.size} />
              </div>
              <div
                style={{
                  padding: '4px',
                  minWidth: '50px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <FolderButton element={el} />
              </div>
            </Paper>
          ))}
      </Grid>
    </Grid>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(createThemed(PopupView)), domContainer);
