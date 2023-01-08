import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import * as browser from 'webextension-polyfill';
export default function createThemed(Child) {
  return function ThemedView() {
    const [mode, setMode] = React.useState('dark');

    const theme = React.useMemo(
      () =>
        createTheme({
          palette: {
            mode,
          },
        }),
      [mode]
    );

    React.useEffect(() => {
      browser.storage.sync.get(['darkMode']).then(({ darkMode }) => {
        setMode(darkMode ? 'dark' : 'light');
      });
    }, []);

    return (
      <ThemeProvider theme={theme}>
        <div style={{ backgroundColor: theme.palette.background.default }}>
          <Child />
        </div>
      </ThemeProvider>
    );
  };
}
