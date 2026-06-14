import React from 'react';
import { LinearProgress, Box, Typography } from '@mui/material';

export default function DownloadProgress({ status, downloaded, size }) {
  if (status !== 'downloading') return null;

  const validSize = typeof size === 'number' && size > 0 && Number.isFinite(size);
  const validDownloaded = typeof downloaded === 'number' && Number.isFinite(downloaded) && downloaded >= 0;

  if (!validSize || !validDownloaded) {
    return <LinearProgress sx={{ my: '4px' }} />;
  }

  const pct = Math.min((downloaded / size) * 100, 100);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: '4px' }}>
      <LinearProgress variant="determinate" value={pct} sx={{ flex: 1 }} />
      <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {Math.round(pct)}%
      </Typography>
    </Box>
  );
}
