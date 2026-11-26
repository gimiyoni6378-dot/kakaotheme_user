import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Sandbox } from '@vercel/sandbox';

const SITE_ORIGIN = 'https://gimiyoni6378-dot.github.io';
const REQUESTS = new Map();
const MINUTE = 60_000;

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin !== SITE_ORIGIN) return false;
  res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  return true;
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: '요청한 사이트에서만 빌드를 시작할 수 있습니다.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 지원합니다.' });

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const previous = REQUESTS.get(ip) || 0;
  if (now - previous < MINUTE) return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
  REQUESTS.set(ip, now);
  for (const [key, time] of REQUESTS) if (now - time > MINUTE * 5) REQUESTS.delete(key);

  let sandbox;
  try {
    const worker = await readFile(fileURLToPath(new URL('../worker.py', import.meta.url)));
    sandbox = await Sandbox.create({
      ports: [8765],
      timeout: 15 * 60 * 1000,
      resources: { vcpus: 2 },
      networkPolicy: {
        allow: [
          'dl.google.com', '*.googleapis.com', 'services.gradle.org', '*.gradle.org',
          'repo.maven.apache.org', '*.maven.apache.org', 'plugins.gradle.org', '*.github.com',
          '*.githubusercontent.com', 'api.adoptium.net', '*.eclipse.org',
          '*.ubuntu.com', 'archive.ubuntu.com', 'security.ubuntu.com'
        ]
      }
    });
    await sandbox.writeFiles([{ path: 'worker.py', content: worker }]);
    await sandbox.runCommand({ cmd: 'python3', args: ['worker.py'], detached: true });
    const baseUrl = sandbox.domain(8765);
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!ready) throw new Error('빌드 서버를 시작하지 못했습니다. 다시 시도해주세요.');
    return res.status(200).json({ builderUrl: baseUrl });
  } catch (error) {
    if (sandbox) await sandbox.stop().catch(() => {});
    console.error('Android build session initialization failed:', error);
    return res.status(503).json({ error: 'Android 빌드 서버를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
