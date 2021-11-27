'use strict';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, Grid, Paper, IconButton, LinearProgress } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderIcon from '@mui/icons-material/Folder';

function PopupView() {
  const [downloadHistory, setDownloadHistory] = useState([]);
  useEffect(() => {
    const updateHistory = () => {
      const history = JSON.parse(localStorage.getItem('history'));
      setDownloadHistory(history ?? []);
    };
    const inter = setInterval(updateHistory, 1000);
    updateHistory();

    return () => {
      clearInterval(inter);
    };
  }, [setDownloadHistory]);

  const parseName = (name) => {
    if (name == null) return 'unknown';
    if (name.length < 52) return name;

    return `${name.slice(0, 52)}...`;
  };

  return (
    <Grid container justifyContent="center" spacing={2}>
      <Grid item xs={11}>
        {downloadHistory.slice(0, 4).map((el) => (
          <Paper key={el.gid} style={{ display: 'flex', marginBottom: '8px' }}>
            <div
              style={{
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <img src={el.icon ?? ''} />
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
              <div>{parseName(el.name)}</div>
              {el.status === 'downloading' ? (
                el.size ? (
                  <LinearProgress
                    style={{ margin: '4px' }}
                    variant="determinate"
                    value={Math.min((el.downloaded * 100) / el.size, 100)}
                  />
                ) : (
                  <LinearProgress style={{ margin: '4px' }} />
                )
              ) : null}
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
                <IconButton
                  variant="outlined"
                  // onClick={() => browser.tabs.create({ url: el.path })}
                  onClick={() => browser.tabs.create({ url: 'motrix://' })}
                >
                  <FolderIcon />
                </IconButton>
              ) : null}
            </div>
          </Paper>
        ))}
      </Grid>

      <Grid item xs={2}>
        <IconButton variant="outlined" onClick={() => open('./config.html')}>
          <SettingsIcon />
        </IconButton>
      </Grid>

      <Grid item xs={9} style={{ alignItems: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={() => open('./history.html')}
          style={{
            width: downloadHistory.length ? '50%' : '100%',
            height: '100%',
            margin: 'auto',
            fontSize: '12px',
            padding: '4px',
          }}
        >
          See entire history
        </Button>
        {downloadHistory.length ? (
          <Button
            variant="outlined"
            onClick={() => {
              if (
                confirm(
                  'Are you sure want to remove all of your download history?'
                )
              ) {
                setDownloadHistory([]);
                localStorage.removeItem('history');
              }
            }}
            style={{
              width: '50%',
              height: '100%',
              margin: 'auto',
              fontSize: '12px',
              padding: '4px',
            }}
          >
            Remove History
          </Button>
        ) : null}
      </Grid>
    </Grid>
  );
}

const domContainer = document.querySelector('#react-root');
ReactDOM.render(React.createElement(PopupView), domContainer);
