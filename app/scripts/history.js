'use strict';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Grid, Paper, IconButton, LinearProgress, Container } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import createThemed from './createThemed';
import * as browser from 'webextension-polyfill';

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
                <div>{el.name ?? browser.i18n.getMessage('unknownFilename')}</div>
                {el.status === 'downloading' ? el.downloaded != null && el.size > 0 ? <LinearProgress style={{ margin: '4px' }} variant="determinate" value={Math.min((el.downloaded * 100) / el.size, 100)} /> : <LinearProgress style={{ margin: '4px' }} /> : null}
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
