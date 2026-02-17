# Video stream host for WebXR

This folder runs a small **Node.js server** that serves your 360° video so the browser can **stream it in chunks** (Range requests) with **CORS** enabled. Use it for large files (e.g. 4+ hours, 500MB+) so the app doesn’t have to download the whole file at once.

---

## Option A: Use this Node.js server (local or VPS)

### 1. Put your video in place

- **Option 1:** Create a `videos` folder here and put your file inside:
  - `video-host/videos/panorama.mp4`
- **Option 2:** Put `panorama.mp4` in this folder (`video-host/`).
- **Option 3:** Set env var to any path:
  - `VIDEO_FILE=/path/to/your/video.mp4 node server.js`

### 2. Run the server

```bash
cd video-host
node server.js
```

Default port: **8765**.  
Stream URL: **http://localhost:8765/video**

### 3. Point your WebXR app at it

In `js/worlds/VideoWorld.js` set:

```js
const VIDEO_SRC = 'http://localhost:8765/video';
```

If the app runs on another machine (e.g. phone/VR), use this machine’s IP:

```js
const VIDEO_SRC = 'http://192.168.1.100:8765/video';
```

### 4. Deploy this server (optional)

To host it on the internet (so you can use it from GitHub Pages or any host):

- **Railway / Render / Fly.io:** Add this folder as a Node app, set `VIDEO_FILE` if the file is elsewhere, and use the public URL they give you (e.g. `https://your-app.railway.app/video`).
- **VPS (DigitalOcean, etc.):** Copy this folder + your video, run `node server.js` (or use PM2/systemd). Then use `http://YOUR_SERVER_IP:8765/video`.

---

## Option B: Cloudflare R2 (no server to run)

Good if you want to store the file in the cloud and stream from a URL (no Node process to maintain).

1. **Cloudflare dashboard** → R2 → Create bucket (e.g. `webxr-video`).
2. **Upload** your video (e.g. `panorama.mp4`) to the bucket.
3. **Enable public access** for the bucket (or create an R2 public bucket URL).
4. **CORS:** In R2 bucket settings, add a CORS policy, e.g.:
   - Allowed origins: `*` (or your site, e.g. `https://dhruv5262.github.io`)
   - Allowed methods: `GET`, `HEAD`
   - Allowed headers: `Range`
   - Expose headers: `Content-Range`, `Accept-Ranges`, `Content-Length`
5. Use the **public object URL** in your app, e.g.:
   - `https://pub-xxxx.r2.dev/panorama.mp4`

In `VideoWorld.js`:

```js
const VIDEO_SRC = 'https://pub-xxxx.r2.dev/panorama.mp4';
```

R2 supports Range requests by default, so the browser will stream in chunks.

---

## Summary

| Goal                         | What to use                          |
|-----------------------------|--------------------------------------|
| Test locally                | This Node server + `VIDEO_SRC` above |
| Host 500MB+ on the internet | This server on Railway/Render/VPS or R2 |
| No server to run            | Cloudflare R2 (or S3/R2 + public URL) |

The important part is that the video URL is served with **Range** and **CORS** so the browser can request chunks; this host does that.
