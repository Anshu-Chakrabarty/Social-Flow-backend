const API = 'https://social-flow-backend.onrender.com';
const WEB = 'https://social-flow-5lf5.onrender.com';

async function req(method, url, body, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      status: res.status,
      location: res.headers.get('location') || '',
      json,
      snippet: text.slice(0, 220).replace(/\s+/g, ' '),
    };
  } catch (err) {
    return { status: 0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function ok(item) {
  return item.status >= 200 && item.status < 400 && !item.error;
}

const results = [];
function add(name, item, extra = {}) {
  results.push({ name, status: item.status, ok: extra.ok ?? ok(item), ...extra, error: item.error, snippet: extra.snippet || item.snippet });
}

const health = await req('GET', `${API}/api/health`, null, 90000);
add('health', health, {
  ok: health.json?.status === 'online',
  version: health.json?.version,
  gemini: health.json?.geminiConfigured,
  media: health.json?.geminiMediaEnabled,
  google: health.json?.googleOauthConfigured,
  meta: health.json?.oauth?.metaAppId,
  frontend: health.json?.oauth?.frontendUrl,
});

const aiStatus = await req('GET', `${API}/api/ai/status`);
add('ai.status', aiStatus, { configured: aiStatus.json?.configured, model: aiStatus.json?.model });

const caption = await req('POST', `${API}/api/ai/captions/generate`, {
  topic: 'Morning stretch routine',
  platform: 'instagram',
  tone: 'friendly',
}, 60000);
add('ai.caption', caption, {
  ok: Boolean(caption.json?.success && (caption.json?.caption || caption.json?.data?.caption || caption.json?.hook)),
});

const enhance = await req('POST', `${API}/api/ai/enhance-post`, {
  text: 'Try this 5 minute stretch before work.',
  platform: 'instagram',
}, 60000);
add('ai.enhance', enhance, {
  ok: Boolean(enhance.json?.success && enhance.json?.data?.improved_caption),
});

const video = await req('POST', `${API}/api/ai/video/generate`, {
  topic: 'Desk stretch in 30 seconds',
  prompt: 'Desk stretch in 30 seconds',
  script: 'Open with a tired desk worker. Show three 10-second stretches. Close with a smile.',
  platform: 'instagram',
}, 30000);
add('ai.video.start', video, { ok: Boolean(video.json?.jobId), jobId: video.json?.jobId });

let videoDone = null;
if (video.json?.jobId) {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    videoDone = await req('GET', `${API}/api/ai/video/jobs/${video.json.jobId}`);
    if (videoDone.json?.status === 'done' || videoDone.json?.status === 'error' || videoDone.json?.success === false) break;
  }
  add('ai.video.job', videoDone || { status: 0 }, {
    ok: videoDone?.json?.status === 'done',
    jobStatus: videoDone?.json?.status,
    mediaType: videoDone?.json?.storyboard ? 'storyboard' : videoDone?.json?.videoUrl ? 'video' : null,
    error: videoDone?.json?.error,
  });
}

const media = await req('GET', `${API}/api/media`);
add('media.list', media, { ok: media.json?.success === true });

const driveStatus = await req('GET', `${API}/api/platforms/drive/status`);
add('drive.status', driveStatus, { mode: driveStatus.json?.mode });

for (const [name, path] of [
  ['oauth.drive', '/api/platforms/drive/oauth'],
  ['oauth.youtube', '/api/platforms/youtube/oauth'],
  ['oauth.facebook', '/api/platforms/facebook/oauth'],
  ['oauth.instagram', '/api/platforms/instagram/oauth'],
]) {
  const item = await req('GET', `${API}${path}`);
  add(name, item, {
    ok: item.status === 302 && /accounts\.google|facebook\.com|instagram\.com/.test(item.location),
    locationHost: item.location ? new URL(item.location, API).host : '',
  });
}

for (const path of ['/', '/drive', '/content-studio', '/compose', '/accounts', '/login', '/ai-marketing', '/dashboard']) {
  const item = await req('GET', `${WEB}${path}`, null, 40000);
  add(`web${path === '/' ? '/home' : path}`, item, { ok: item.status === 200 });
}

console.log(JSON.stringify({ health: health.json, results }, null, 2));
