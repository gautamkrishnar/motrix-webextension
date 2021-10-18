import ReactDOMServer from 'react-dom/server';
import React from 'react';

export function getIconPath(Icon) {
  const iconString = ReactDOMServer.renderToString(<Icon />);
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(iconString, 'image/svg+xml');
  const iconPath = svgDoc.querySelector('path')?.getAttribute('d');

  return iconPath;
}
