import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/session.mjs";

test("deployment bundle loads without require(ESM) and refuses unconfigured builds", async () => {
  delete process.env.APK_BUILDS_ENABLED;
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { origin: "https://gimiyoni6378-dot.github.io" },
    },
    res,
  );
  assert.equal(res.code, 503);
  assert.ok(res.body.error);
  assert.equal(res.headers["Cache-Control"], "no-store");
});
