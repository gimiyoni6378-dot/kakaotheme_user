import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

const SITE_ORIGIN =
  process.env.SITE_ORIGIN || "https://gimiyoni6378-dot.github.io";
const REQUESTS = new Map();
const MINUTE = 60_000;

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin !== SITE_ORIGIN) return false;
  res.setHeader("Access-Control-Allow-Origin", SITE_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!cors(req, res))
    return res
      .status(403)
      .json({ error: "요청한 사이트에서만 빌드를 시작할 수 있습니다." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  // Disabled until a stable signing identity and firewall budget controls exist.
  if (
    process.env.APK_BUILDS_ENABLED !== "true" ||
    !process.env.APK_KEYSTORE_BASE64 ||
    !process.env.APK_KEYSTORE_PASSWORD
  ) {
    return res.status(503).json({
      error: "APK 서버 설정이 아직 완료되지 않았어요. 운영자에게 문의해주세요.",
    });
  }

  let sandbox;
  try {
    const [worker, project, template, bubbles, themeSpec] = await Promise.all(
      [
        "worker.py",
        "project.py",
        "template.zip",
        "bubbles.py",
        "theme-spec.json",
      ].map((name) =>
        readFile(fileURLToPath(new URL("../" + name, import.meta.url))),
      ),
    );
    const designSpecVersion = JSON.parse(themeSpec.toString()).version;
    if (req.body?.designSpecVersion !== designSpecVersion) {
      return res.status(409).json({
        error:
          "테마 제작 페이지가 업데이트됐어요. 페이지를 새로고침한 뒤 다시 저장해주세요.",
      });
    }
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (
      Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown"
    )
      .split(",")[0]
      .trim();
    const now = Date.now();
    const previous = REQUESTS.get(ip) || 0;
    if (now - previous < MINUTE)
      return res.status(429).json({ error: "잠시 후 다시 시도해주세요." });
    REQUESTS.set(ip, now);
    for (const [key, time] of REQUESTS)
      if (now - time > MINUTE * 5) REQUESTS.delete(key);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 25 * 60 * 1000;
    sandbox = await Sandbox.create({
      image: "vercel/sandbox/universal",
      persistent: false,
      ports: [8765],
      timeout: 25 * 60 * 1000,
      resources: { vcpus: 2 },
      networkPolicy: {
        allow: [
          "dl.google.com",
          "*.googleapis.com",
          "services.gradle.org",
          "*.gradle.org",
          "repo.maven.apache.org",
          "*.maven.apache.org",
          "plugins.gradle.org",
          "github.com",
          "*.github.com",
          "*.githubusercontent.com",
          "api.adoptium.net",
          "*.eclipse.org",
          "*.ubuntu.com",
          "archive.ubuntu.com",
          "security.ubuntu.com",
          "packages.adoptium.net",
          "download.java.net",
          "dl-cdn.alpinelinux.org",
          "cdn.amazonlinux.com",
          "*.amazonaws.com",
        ],
      },
    });
    await sandbox.writeFiles([
      { path: "/vercel/sandbox/worker.py", content: worker },
      { path: "/vercel/sandbox/project.py", content: project },
      { path: "/vercel/sandbox/bubbles.py", content: bubbles },
      { path: "/vercel/sandbox/theme-spec.json", content: themeSpec },
      { path: "/vercel/sandbox/template.zip", content: template },
      {
        path: "/vercel/sandbox/signing.jks",
        content: Buffer.from(process.env.APK_KEYSTORE_BASE64, "base64"),
      },
    ]);
    await sandbox.runCommand({
      cmd: "python3",
      args: ["/vercel/sandbox/worker.py"],
      detached: true,
      env: {
        SESSION_TOKEN: token,
        SESSION_EXPIRES: String(Math.floor(expiresAt / 1000)),
        SITE_ORIGIN,
        KEYSTORE_PASSWORD: process.env.APK_KEYSTORE_PASSWORD,
      },
    });
    const baseUrl = sandbox.domain(8765);
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!ready)
      throw new Error("빌드 서버를 시작하지 못했습니다. 다시 시도해주세요.");
    return res.status(200).json({
      builderUrl: baseUrl,
      token,
      expiresAt,
      bubbleRendererVersion: 2,
      designSpecVersion,
    });
  } catch (error) {
    if (sandbox) await sandbox.stop().catch(() => {});
    console.error("Android build session initialization failed:", error);
    return res.status(503).json({
      error:
        "Android 빌드 서버를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
}
