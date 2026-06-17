'use strict';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Grid, Paper, IconButton, Container } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import createThemed from './createThemed';
import * as browser from 'webextension-polyfill';
import DownloadProgress from './components/DownloadProgress';

function HistoryView() {
  const [downloadHistory, setDownloadHistory] = useState([]);

  useEffect(() => {
    browser.storage.local.get(['history']).then(({ history = [] }) => {
      setDownloadHistory(history);
    });

    const listener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.history) setDownloadHistory(changes.history.newValue ?? []);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <Container style={{ marginTop: '8px', minHeight: '100vh' }}>
      <Grid container justifyContent="center" spacing={2}>
        <Grid item xs={11}>
          {downloadHistory.map((el) => (
            <Paper key={el.gid} style={{ display: 'flex', marginBottom: '8px' }}>
              <div
                style={{
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                {el.icon ? <img src={el.icon} alt="icon" /> : <InsertDriveFileIcon />}
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
                <div>{el.name ?? browser.i18n.getMessage('unknownFilename')}</div>
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
                {el.status === 'completed' ? (
                  <IconButton variant="outlined" onClick={() => (el.downloader === 'browser' ? browser.downloads.show(el.gid) : browser.tabs.create({ url: 'motrix://' }))}>
                    <FolderIcon />
                  </IconButton>
                ) : null}
              </div>
            </Paper>
          ))}
        </Grid>
      </Grid>
    </Container>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(createThemed(HistoryView)), domContainer);
