/**
 * Simple video streaming server with Range support + CORS.
 * Sends data in chunks so the browser can stream/seek without downloading the whole file.
 *
 * Usage:
 *   1. Put your video (e.g. panorama.mp4) in the same folder as this file, or in ./videos
 *   2. npm install   (optional, no deps required)
 *   3. node server.js
 *   4. In VideoWorld.js set: VIDEO_SRC = 'http://localhost:8765/video'
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8765;

// Put your video file here (same folder as server.js) or in ./videos
const VIDEO_FILE = process.env.VIDEO_FILE || path.join(__dirname, 'videos', 'panorama.mp4');

// Fallback: if ./videos/panorama.mp4 doesn't exist, try ./panorama.mp4
function getVideoPath() {
  if (fs.existsSync(VIDEO_FILE)) return VIDEO_FILE;
  const alt = path.join(__dirname, 'panorama.mp4');
  if (fs.existsSync(alt)) return alt;
  return null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

function sendCorsPreflight(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
  res.end(message || 'Error');
}

function streamVideo(req, res, filePath, stat) {
  const total = stat.size;
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
      'Content-Length': total,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    sendError(res, 416, 'Invalid Range');
    return;
  }

  let start = parseInt(match[1], 10) || 0;
  let end = match[2] ? parseInt(match[2], 10) : total - 1;
  end = Math.min(end, total - 1);
  start = Math.min(start, end);
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    ...CORS_HEADERS,
    'Accept-Ranges': 'bytes',
    'Content-Type': 'video/mp4',
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Content-Length': chunkSize,
  });

  const stream = fs.createReadStream(filePath, { start, end });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const urlPath = req.url?.split('?')[0] || '/';
  if (urlPath !== '/video' && urlPath !== '/') {
    sendError(res, 404, 'Not Found. Use /video to stream.');
    return;
  }

  const filePath = getVideoPath();
  if (!filePath) {
    sendError(res, 503, 'No video file. Put panorama.mp4 in ./videos/ or set VIDEO_FILE.');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendError(res, 500, 'File error');
      return;
    }
    streamVideo(req, res, filePath, stat);
  });
});

server.listen(PORT, () => {
  const fp = getVideoPath();
  console.log(`Video stream server running at http://localhost:${PORT}`);
  console.log(`  Stream URL: http://localhost:${PORT}/video`);
  if (fp) {
    console.log(`  Serving: ${path.basename(fp)} (${(require('fs').statSync(fp).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('  No video found. Put panorama.mp4 in ./videos/ or set env VIDEO_FILE.');
  }
});
