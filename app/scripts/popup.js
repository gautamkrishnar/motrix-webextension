'use strict';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Grid, Paper, IconButton, LinearProgress } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import createThemed from './createThemed';
import PropTypes from 'prop-types';
import * as browser from 'webextension-polyfill';

function OptProgress({ status, downloaded, size }) {
  console.log(status, downloaded, size);
  if (status !== 'downloading') return null;
  if (downloaded != null && size != null && size > 0) {
    return (
      <LinearProgress
        style={{ margin: '4px' }}
        variant="determinate"
        value={Math.min((downloaded * 100) / size, 100)}
      />
    );
  }
  return <LinearProgress style={{ margin: '4px' }} />;
}

OptProgress.propTypes = {
  status: PropTypes.string,
  downloaded: PropTypes.number,
  size: PropTypes.number,
};

function FolderButton({ element }) {
  console.log(element);
  if (element.status !== 'completed') return null;

  let onClick;

  if (element.manager === 'browser') {
    onClick = () => {
      browser.downloads.show(element.gid);
    };
  } else {
    onClick = () => {
      browser.tabs.create({ url: 'motrix://' });
    };
  }

  return (
    <IconButton
      variant="outlined"
      // onClick={() => browser.tabs.create({ url: el.path })}
      onClick={onClick}
    >
      <FolderIcon />
    </IconButton>
  );
}

FolderButton.propTypes = {
  element: PropTypes.object,
};

function PopupView() {
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [extensionStatus, setExtensionStatus] = useState(false);
  const [showOnlyAriaDownloads, setShowOnlyAriaDownloads] = useState(true);

  useEffect(() => {
    const updateHistory = async () => {
      const { history = [] } = await browser.storage.local.get(['history']);
      setDownloadHistory(history ?? []);
    };
    const inter = setInterval(updateHistory, 1000);
    updateHistory();

    return () => {
      clearInterval(inter);
    };
  }, [setDownloadHistory]);

  useEffect(() => {
    const updateStatus = () => {
      browser.storage.sync
        .get(['extensionStatus', 'showOnlyAria'])
        .then((r) => {
          setExtensionStatus(r.extensionStatus);
          setShowOnlyAriaDownloads(r.showOnlyAria ?? false);
        });
    };
    const inter = setInterval(updateStatus, 1000);
    updateStatus();

    return () => {
      clearInterval(inter);
    };
  }, [setDownloadHistory]);

  const onExtensionStatusChange = (status) => {
    browser.storage.sync.set({ extensionStatus: status });
    setExtensionStatus(status);
  };

  const parseName = (name) => {
    if (name == null) return 'unknown';
    if (name.length < 52) return name;

    return `${name.slice(0, 52)}...`;
  };

  return (
    <Grid container justifyContent="center" spacing={2}>
      <Grid item xs={2}>
        <IconButton
          variant="outlined"
          onClick={() => onExtensionStatusChange(!extensionStatus)}
        >
          <PowerSettingsNewIcon color={extensionStatus ? 'success' : 'error'} />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => open('./config.html')}>
          <SettingsIcon />
        </IconButton>
      </Grid>
      <Grid item xs={1} />
      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => open('./history.html')}>
          <HistoryIcon />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton
          variant="outlined"
          onClick={() => {
            if (
              confirm(
                'Are you sure want to remove all of your download history?'
              )
            ) {
              setDownloadHistory([]);
              browser.storage.local.set({ history: [] });
            }
          }}
        >
          <ClearAllIcon />
        </IconButton>
      </Grid>
      <Grid item xs={2}>
        <IconButton
          variant="outlined"
          onClick={() => browser.downloads.showDefaultFolder()}
        >
          <FolderIcon />
        </IconButton>
      </Grid>
      <Grid item xs={11}>
        {downloadHistory &&
          downloadHistory
            .filter((el) => !showOnlyAriaDownloads || el.downloader === 'aria')
            .slice(0, 4)
            .map((el) => (
              <Paper
                key={el.gid}
                style={{ display: 'flex', marginBottom: '8px' }}
              >
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

                  <OptProgress
                    status={el.status}
                    downloaded={el.downloaded}
                    size={el.size}
                  />
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
