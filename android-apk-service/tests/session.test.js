import test from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '@vercel/sandbox';
import handler from '../src/session.mjs';

function response() {
  return { headers: {}, statusCode: 200, payload: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; },
    json(v) { this.payload = v; return this; }, end() { return this; } };
}
const origin = 'https://gimiyoni6378-dot.github.io';
test('origin, preflight, method, missing configuration and sandbox lifecycle', async () => {
  const originalCreate = Sandbox.create;
  const originalFetch = globalThis.fetch;
  try {
    let res = response();
    await handler({ method: 'POST', headers: { origin: 'https://other.example' } }, res);
    assert.equal(res.statusCode, 403);
    res = response();
    await handler({ method: 'OPTIONS', headers: { origin } }, res);
    assert.equal(res.statusCode, 204);
    res = response();
    await handler({ method: 'GET', headers: { origin } }, res);
    assert.equal(res.statusCode, 405);
    delete process.env.APK_BUILDS_ENABLED;
    Sandbox.create = () => { throw Error('must not allocate'); };
    res = response();
    await handler({ method: 'POST', headers: { origin } }, res);
    assert.equal(res.statusCode, 503);
    process.env.APK_BUILDS_ENABLED = 'true';
    process.env.APK_KEYSTORE_BASE64 = Buffer.from('test keystore').toString('base64');
    process.env.APK_KEYSTORE_PASSWORD = 'test password';
    let stopped = false;
    Sandbox.create = async options => {
      assert.equal(options.persistent, false);
      assert.equal(options.timeout, 25 * 60_000);
      assert.equal(options.image, 'vercel/sandbox/universal');
      return {
        writeFiles: async files => { assert.equal(files.length, 6); },
        runCommand: async cmd => { assert.ok(cmd.env.SESSION_TOKEN); },
        domain: () => 'https://test.example',
        stop: async () => { stopped = true; }
      };
    };
    globalThis.fetch = async () => ({ ok: true });
    res = response();
    await handler({ method: 'POST', headers: { origin, 'x-forwarded-for': '192.0.2.1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.token.length > 30);
    assert.equal(res.payload.bubbleRendererVersion, 2);
    assert.equal(res.payload.designSpecVersion, 1);
    assert.ok(res.payload.expiresAt > Date.now());
    assert.equal(stopped, false, 'keep the download server alive');
    res = response();
    await handler({ method: 'POST', headers: { origin, 'x-forwarded-for': '192.0.2.1' } }, res);
    assert.equal(res.statusCode, 429);
    Sandbox.create = async () => ({ writeFiles: async () => { throw Error('test'); }, stop: async () => { stopped = true; } });
    res = response();
    await handler({ method: 'POST', headers: { origin, 'x-forwarded-for': '192.0.2.2' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(stopped, true);
  } finally {
    Sandbox.create = originalCreate;
    globalThis.fetch = originalFetch;
    delete process.env.APK_BUILDS_ENABLED;
    delete process.env.APK_KEYSTORE_BASE64;
    delete process.env.APK_KEYSTORE_PASSWORD;
  }
});
