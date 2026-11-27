// Node DOM/graphics unit tests only. This does not open or validate a browser.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".test-output");
function canvas(width = 300, height = 150) {
  const c = createCanvas(width, height),
    ctx = c.getContext("2d");
  const proxy = new Proxy(ctx, {
    get(t, k) {
      if (k === "drawImage")
        return (image, ...args) => t.drawImage(image.native || image, ...args);
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  c.getContext = () => proxy;
  c.toBlob = (callback) =>
    c.encode("png").then((buffer) => callback(new Blob([buffer])));
  return c;
}
class UnitImage {
  set src(data) {
    this.loaded = loadImage(data).then((image) => {
      this.native = image;
      this.naturalWidth = image.width;
      this.naturalHeight = image.height;
    });
  }
  decode() {
    return this.loaded;
  }
}
function unzip(blob) {
  return blob.arrayBuffer().then((ab) => {
    const b = Buffer.from(ab),
      files = new Map();
    let o = 0;
    while (b.readUInt32LE(o) === 0x04034b50) {
      const size = b.readUInt32LE(o + 22),
        nl = b.readUInt16LE(o + 26),
        el = b.readUInt16LE(o + 28),
        start = o + 30 + nl + el;
      files.set(
        b.toString("utf8", o + 30, o + 30 + nl),
        b.subarray(start, start + size),
      );
      o = start + size;
    }
    return files;
  });
}
async function image(bytes) {
  const im = await loadImage(bytes),
    c = canvas(im.width, im.height);
  c.getContext("2d").drawImage(im, 0, 0);
  return c;
}
function stretch(image, trim, band, width, height, point = [60, 51]) {
  const c = canvas(width, height),
    ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const w = image.width - trim * 2,
    h = image.height - trim * 2,
    x = point[0],
    y = point[1],
    sx = [0, x, x + band, w],
    sy = [0, y, y + band, h],
    dx = [0, x, width - (w - x - band), width],
    dy = [0, y, height - (h - y - band), height];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++)
      ctx.drawImage(
        image,
        trim + sx[i],
        trim + sy[j],
        sx[i + 1] - sx[i],
        sy[j + 1] - sy[j],
        dx[i],
        dy[j],
        dx[i + 1] - dx[i],
        dy[j + 1] - dy[j],
      );
  return c;
}
function maxDelta(a, b) {
  assert.equal(a.length, b.length);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}
require("node:test")(
  "separate platform files match common colors, geometry, photos and stretch references (Node/Skia only)",
  async () => {
    await fs.mkdir(output, { recursive: true });
    let blockAndroidTemplate = false;
    const html = await fs.readFile(path.join(root, "index.html"), "utf8"),
      dom = new JSDOM(html, {
        url: "https://unit.test/",
        runScripts: "outside-only",
      }),
      w = dom.window,
      context = dom.getInternalVMContext();
    Object.assign(w, {
      Blob,
      Response,
      TextEncoder,
      TextDecoder,
      DecompressionStream,
      structuredClone,
      Image: UnitImage,
      URL,
      createImageBitmap: async (blob) => {
        const im = await loadImage(Buffer.from(await blob.arrayBuffer()));
        im.close = () => {};
        return im;
      },
      fetch: async (input) => {
        if (String(input).startsWith("data:")) return fetch(input);
        const url = new URL(input, "https://unit.test/");
        if (url.origin !== "https://unit.test")
          throw Error("No external network is allowed in file tests");
        if (blockAndroidTemplate && url.pathname.endsWith("/template.zip"))
          throw Error("iOS must not read the Android template");
        return new Response(
          await fs.readFile(
            path.join(root, decodeURIComponent(url.pathname).slice(1)),
          ),
          { status: 200 },
        );
      },
    });
    const create = w.document.createElement.bind(w.document);
    w.document.createElement = (tag, ...args) =>
      tag === "canvas" ? canvas() : create(tag, ...args);
    w.localStorage.setItem(
      "talktheme",
      JSON.stringify({ bubbleStyle: "dashed" }),
    );
    for (const script of w.document.querySelectorAll("script[src]")) {
      const name = script.getAttribute("src").split("?")[0];
      vm.runInContext(
        await fs.readFile(path.join(root, name), "utf8"),
        context,
        { filename: name },
      );
    }
    await w.THEME_READY;
    assert.equal(w.current().bubbleStyle, "rounded");
    assert.equal(
      w.document.querySelectorAll("button[data-bubble-style]").length,
      2,
    );
    assert.equal(w.document.querySelector("#export").disabled, false);
    assert.equal(w.document.querySelector("#exportAndroid").disabled, false);
    const v = {
      ...w.THEME_DESIGN.spec.defaults,
      name: "공통 검증",
      bg: "#E8F4F8",
      main: "#FAF2DE",
      accent: "#B13A60",
      send: "#C6E6BC",
      receive: "#FFE1C6",
      ink: "#24364A",
      images: { chat: null },
    };
    const photoCanvas = canvas(180, 300),
      px = photoCanvas.getContext("2d");
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        px.fillStyle = [
          "#f44336",
          "#ffeb3b",
          "#2196f3",
          "#4caf50",
          "#9c27b0",
          "#ff9800",
          "#80cbc4",
          "#b39ddb",
          "#222222",
        ][y * 3 + x];
        px.fillRect(x * 60, y * 100, 60, 100);
      }
    const photo = photoCanvas.toDataURL(),
      results = [];
    for (const style of ["square", "rounded"])
      for (const withPhoto of [false, true]) {
        const key = style + "-" + (withPhoto ? "photo" : "plain"),
          theme = {
            ...v,
            bubbleStyle: style,
            images: {
              chat: withPhoto ? { data: photo, name: "검증용 도형.png" } : null,
            },
          };
        w.unitDesign = theme;
        vm.runInContext("s=structuredClone(unitDesign);render()", context);
        await w.PREVIEW_READY;
        const chat = w.document.querySelector("#chat-preview .chat-screen");
        for (const { key } of w.THEME_DESIGN.spec.colors)
          assert.equal(chat.style.getPropertyValue("--" + key), theme[key]);
        assert.equal(
          chat.style.getPropertyValue("--bubble-radius"),
          w.THEME_DESIGN.spec.bubble.styles[style].radius + "px",
        );
        assert.equal(
          chat.style.getPropertyValue("--bubble-pad-send"),
          "13px 16px 9px 10px",
        );
        const savedAndroid = w.ANDROID_THEME_EXPORTER;
        delete w.ANDROID_THEME_EXPORTER;
        blockAndroidTemplate = true;
        const ios = await w.IOS_THEME_EXPORTER.build(theme);
        w.ANDROID_THEME_EXPORTER = savedAndroid;
        blockAndroidTemplate = false;
        const savedIos = w.IOS_THEME_EXPORTER,
          savedImages = w.THEME_FILES,
          savedCss = w.SAMPLE_THEME_CSS;
        delete w.IOS_THEME_EXPORTER;
        delete w.THEME_FILES;
        delete w.SAMPLE_THEME_CSS;
        const android = await w.ANDROID_THEME_EXPORTER.build(theme);
        Object.assign(w, {
          IOS_THEME_EXPORTER: savedIos,
          THEME_FILES: savedImages,
          SAMPLE_THEME_CSS: savedCss,
        });
        const im = await unzip(ios.zip),
          am = await unzip(android.zip);
        assert(
          [...im.keys()].every(
            (n) => n === "KakaoTalkTheme.css" || n.startsWith("Images/"),
          ),
        );
        assert(
          !am.has("KakaoTalkTheme.css") &&
            ![...am.keys()].some((n) => n.startsWith("Images/")),
        );
        const css = im.get("KakaoTalkTheme.css").toString(),
          design = JSON.parse(am.get("talktheme-bubbles.json"));
        assert.equal(design.version, 2);
        assert.equal(design.style, style);
        for (const { key } of w.THEME_DESIGN.spec.colors)
          assert.equal(design.colors[key], theme[key]);
        assert.equal(
          [...css.matchAll(/'chatroomBubble[^']+\.png'\s+20px\s+17px/g)].length,
          8,
        );
        let delta = 0,
          scaledDelta = 0;
        for (const [role, ir, ar] of [
          ["send", "Send", "me"],
          ["receive", "Receive", "you"],
        ]) {
          const a = await image(
              im.get("Images/chatroomBubble" + ir + "01@3x.png"),
            ),
            b = await image(
              am.get(
                "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_" +
                  ar +
                  "_01_image.9.png",
              ),
            );
          assert.equal(a.width, 120);
          assert.equal(a.height, 105);
          assert.equal(b.width, 122);
          assert.equal(b.height, 107);
          const block = css.match(
            new RegExp("MessageCellStyle-" + ir + "\\s*\\{([\\s\\S]*?)\\}"),
          )[1];
          const pad = [
            ...block.match(
              /-ios-title-edgeinsets:\s*(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/,
            ),
          ]
            .slice(1)
            .map(Number);
          const point = [
            ...block.match(/-ios-background-image:[^;]*?\s(\d+)px\s+(\d+)px/),
          ]
            .slice(1)
            .map(Number);
          const ctx = b.getContext("2d"),
            black = (x, y) => {
              const p = ctx.getImageData(x, y, 1, 1).data;
              if (!p[3]) return false;
              assert.deepEqual(Array.from(p), [0, 0, 0, 255]);
              return true;
            };
          const top = Array.from({ length: b.width }, (_, i) => i).filter((i) =>
              black(i, 0),
            ),
            left = Array.from({ length: b.height }, (_, i) => i).filter((i) =>
              black(0, i),
            );
          assert.deepEqual(top, [
            1 + point[0] * 3,
            2 + point[0] * 3,
            3 + point[0] * 3,
          ]);
          assert.deepEqual(left, [
            1 + point[1] * 3,
            2 + point[1] * 3,
            3 + point[1] * 3,
          ]);
          const bottom = Array.from({ length: b.width }, (_, i) => i).filter(
              (i) => black(i, b.height - 1),
            ),
            right = Array.from({ length: b.height }, (_, i) => i).filter((i) =>
              black(b.width - 1, i),
            );
          assert.equal(bottom[0], 1 + pad[1] * 3);
          assert.equal(bottom.at(-1), a.width - pad[3] * 3);
          assert.equal(right[0], 1 + pad[0] * 3);
          assert.equal(right.at(-1), a.height - pad[2] * 3);
          const border = a
            .getContext("2d")
            .getImageData(a.width / 2, 1, 1, 1).data;
          assert.deepEqual(Array.from(border), [
            parseInt(v.accent.slice(1, 3), 16),
            parseInt(v.accent.slice(3, 5), 16),
            parseInt(v.accent.slice(5, 7), 16),
            255,
          ]);

          delta = Math.max(
            delta,
            maxDelta(
              a.getContext("2d").getImageData(0, 0, 120, 105).data,
              b.getContext("2d").getImageData(1, 1, 120, 105).data,
            ),
          );
          for (const [width, height] of [
            [180, 126],
            [720, 180],
            [720, 450],
          ]) {
            const ai = stretch(
                a,
                0,
                1,
                width,
                height,
                point.map((v) => v * 3),
              ),
              bi = stretch(b, 1, top.length, width, height, [
                top[0] - 1,
                left[0] - 1,
              ]);
            scaledDelta = Math.max(
              scaledDelta,
              maxDelta(
                ai.getContext("2d").getImageData(0, 0, width, height).data,
                bi.getContext("2d").getImageData(0, 0, width, height).data,
              ),
            );
          }
        }
        assert(
          delta <= 1 && scaledDelta <= 1,
          `Bubble pixel mismatch: ${key} ${delta}/${scaledDelta}`,
        );
        for (const [name, bytes] of am)
          if (
            name.endsWith("/theme_background_image.png") ||
            (!withPhoto &&
              name.endsWith("/theme_chatroom_background_image.png"))
          ) {
            const made = await image(bytes),
              expected = name.endsWith("/theme_background_image.png")
                ? v.main
                : v.bg,
              rgba = [
                parseInt(expected.slice(1, 3), 16),
                parseInt(expected.slice(3, 5), 16),
                parseInt(expected.slice(5, 7), 16),
                255,
              ];
            for (const xf of [0.1, 0.5, 0.9])
              for (const yf of [0.1, 0.5, 0.9])
                assert.deepEqual(
                  Array.from(
                    made
                      .getContext("2d")
                      .getImageData(
                        Math.floor(made.width * xf),
                        Math.floor(made.height * yf),
                        1,
                        1,
                      ).data,
                  ),
                  rgba,
                );
          }
        if (withPhoto) {
          const expected = Buffer.from(
            await (await w.commonBackground(photo)).arrayBuffer(),
          );
          assert(im.get("Images/chatroomBgImage@3x.png").equals(expected));
          for (const [name, bytes] of am)
            if (name.endsWith("/theme_chatroom_background_image.png"))
              assert(bytes.equals(expected));
        }
        await fs.writeFile(
          path.join(output, "common-" + key + ".ktheme"),
          Buffer.from(await ios.zip.arrayBuffer()),
        );
        await fs.writeFile(
          path.join(output, "common-" + key + ".zip"),
          Buffer.from(await android.zip.arrayBuffer()),
        );
        results.push({
          key,
          iosFiles: im.size,
          androidFiles: am.size,
          pixelDelta: delta,
          stretchDelta: scaledDelta,
          environment: "Node DOM/Skia; browser and devices not verified",
        });
        console.log(
          "PASS",
          key,
          "separate files, colors, photo, bubble pixels and stretch reference",
        );
      }
    await fs.writeFile(
      path.join(output, "common-results.json"),
      JSON.stringify(results, null, 2),
    );
    // Exercise the page download handlers without opening a browser or a build session.
    const downloads = [];
    w.download = (blob, name) => downloads.push({ blob, name });
    w.IOS_THEME_EXPORTER.build = async (theme) => {
      assert.equal(theme.name, v.name);
      return {
        zip: new Blob(["test-ios"]),
        name: "test-ios",
        report: { images: 66 },
        archiveCheck: { fileCount: 67 },
      };
    };
    await w.document.querySelector("#export").onclick();
    assert.equal(downloads[0].name, "test-ios.ktheme");
    assert.equal(w.document.querySelector("#export").disabled, false);

    w.ANDROID_THEME_EXPORTER.build = async (theme) => {
      assert.equal(theme.name, v.name);
      return { zip: new Blob(["test-android"]), name: "test-android" };
    };
    w.fetch = async (input, options) => {
      const url = new URL(input);
      if (url.pathname === "/api/session") {
        assert.equal(options.method, "POST");
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(options.body), { designSpecVersion: 1 });
        return new Response(
          JSON.stringify({
            builderUrl: "https://build.unit.test",
            token: "test-capability",
            expiresAt: Date.now() + 60_000,
            bubbleRendererVersion: 2,
            designSpecVersion: 1,
          }),
        );
      }
      assert.equal(url.origin, "https://build.unit.test");
      assert.equal(options.headers.Authorization, "Bearer test-capability");
      if (url.pathname === "/build") {
        assert.equal(await options.body.text(), "test-android");
        return new Response(JSON.stringify({ jobId: "unit" }));
      }
      assert.equal(url.pathname, "/status/unit");
      return new Response(JSON.stringify({ done: true }));
    };
    w.HTMLAnchorElement.prototype.click = function () {
      downloads.push({ name: this.download, href: this.href });
    };
    const androidButton = w.document.querySelector("#exportAndroid");
    await androidButton.onclick();
    assert.match(androidButton.textContent, /저장 준비 완료/);
    assert.equal(androidButton.disabled, false);
    await androidButton.onclick();
    assert.equal(downloads[1].name, "test-android.apk");
    assert.equal(new URL(downloads[1].href).pathname, "/download/unit");
    dom.window.close();
  },
);
