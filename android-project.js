(() => {
  // Android adapter: official XML and NinePatch resources only.
  // Android-only helpers. The iOS exporter and page layout stay independent.
  function androidStringValue(value) {
    const text = String(value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 60)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return "&quot;" + text + "&quot;";
  }

  async function androidCanvas(bytes, draw) {
    const image = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    await draw(canvas.getContext("2d"), canvas, image);
    image.close();
    return androidPngBytes(await canvasBlob(canvas));
  }

  function androidGlyph(bytes, glyph, color) {
    return androidCanvas(bytes, (ctx, c) => {
      ctx.fillStyle = color;
      ctx.font = `${Math.floor(Math.min(c.width, c.height) * 0.7)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, c.width / 2, c.height / 2, c.width * 0.9);
    });
  }

  function androidTabAsset(bytes, type, selected, v) {
    return androidCanvas(bytes, (ctx, c) => {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = selected ? v.ink : v.accent;
      ctx.font = `${Math.round(c.height * (type === "More" ? 0.34 : 0.52))}px sans-serif`;
      ctx.fillText(
        TAB_GLYPHS[type],
        c.width / 2,
        c.height * 0.31,
        c.width * 0.9,
      );
      ctx.fillStyle = v.ink;
      ctx.font = `500 ${Math.round(c.height * 0.25)}px -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif`;
      ctx.fillText(
        TAB_LABELS[type],
        c.width / 2,
        c.height * 0.81,
        c.width * 0.9,
      );
    });
  }

  function androidDot(bytes, color, checked) {
    return androidCanvas(bytes, (ctx, c) => {
      ctx.beginPath();
      ctx.arc(
        c.width / 2,
        c.height / 2,
        Math.min(c.width, c.height) * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = Math.max(2, c.width * 0.06);
      if (checked) ctx.fill();
      else ctx.stroke();
    });
  }

  function androidProfile(bytes, v) {
    return androidCanvas(bytes, (ctx, c) => {
      ctx.fillStyle = v.main;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = v.accent;
      ctx.beginPath();
      ctx.arc(c.width * 0.5, c.height * 0.35, c.width * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(
        c.width * 0.5,
        c.height * 0.85,
        c.width * 0.34,
        c.height * 0.3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }

  function androidNinePatchFill(bytes, color) {
    return androidCanvas(bytes, (ctx, c, image) => {
      // Keep the official 1-pixel stretch/content markers intact.
      ctx.drawImage(image, 0, 0);
      ctx.fillStyle = color;
      ctx.fillRect(1, 1, c.width - 2, c.height - 2);
    });
  }

  function androidBubbleCanvas(scale, fill, border, style) {
    const spec = THEME_DESIGN.spec.bubble,
      c = document.createElement("canvas");
    c.width = Math.round(spec.width * scale);
    c.height = Math.round(spec.height * scale);
    const x = c.getContext("2d"),
      stroke = spec.strokeWidth * scale,
      pad = stroke / 2;
    x.beginPath();
    x.roundRect(
      pad,
      pad,
      c.width - stroke,
      c.height - stroke,
      Math.max(0, spec.styles[style].radius * scale - stroke / 2),
    );
    x.fillStyle = fill;
    x.fill();
    x.lineWidth = stroke;
    x.strokeStyle = border;
    x.stroke();
    return c;
  }
  async function androidCommonBubble(path, v) {
    const scale = 3,
      spec = THEME_DESIGN.spec.bubble,
      role = path.includes("_me_") ? "send" : "receive",
      body = androidBubbleCanvas(scale, v[role], v.accent, v.bubbleStyle),
      c = document.createElement("canvas");
    c.width = body.width + 2;
    c.height = body.height + 2;
    const x = c.getContext("2d");
    x.drawImage(body, 1, 1);
    x.fillStyle = "#000000";
    x.fillRect(1 + spec.stretch.x * scale, 0, scale, 1);
    x.fillRect(0, 1 + spec.stretch.y * scale, 1, scale);
    const pad = spec.padding[role];
    x.fillRect(
      1 + pad.left * scale,
      c.height - 1,
      body.width - (pad.left + pad.right) * scale,
      1,
    );
    x.fillRect(
      c.width - 1,
      1 + pad.top * scale,
      1,
      body.height - (pad.top + pad.bottom) * scale,
    );
    return androidPngBytes(await canvasBlob(c));
  }
  async function unzipAndroidTemplate() {
    const r = await fetch("android-apk-service/template.zip");
    if (!r.ok) throw Error("Android 공식 샘플 ZIP 다운로드에 실패했습니다.");
    const b = new Uint8Array(await r.arrayBuffer());
    const v = new DataView(b.buffer);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
      if (v.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0)
      throw Error("Android 샘플 ZIP의 끝 레코드를 찾지 못했습니다.");
    const count = v.getUint16(eocd + 10, true);
    let offset = v.getUint32(eocd + 16, true);
    const files = new Map(),
      dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (v.getUint32(offset, true) !== 0x02014b50)
        throw Error("Android 샘플 중앙 디렉터리가 손상됐습니다.");
      const method = v.getUint16(offset + 10, true),
        crc = v.getUint32(offset + 16, true),
        packedSize = v.getUint32(offset + 20, true),
        nameLength = v.getUint16(offset + 28, true),
        extraLength = v.getUint16(offset + 30, true),
        commentLength = v.getUint16(offset + 32, true),
        localOffset = v.getUint32(offset + 42, true),
        name = dec.decode(b.subarray(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/")) continue;
      if (name.startsWith("/") || name.split("/").includes(".."))
        throw Error("Android 샘플에 안전하지 않은 경로가 있습니다.");
      if (v.getUint32(localOffset, true) !== 0x04034b50)
        throw Error("Android 샘플 로컬 헤더가 손상됐습니다: " + name);
      const localName = v.getUint16(localOffset + 26, true),
        localExtra = v.getUint16(localOffset + 28, true),
        start = localOffset + 30 + localName + localExtra,
        compressed = b.slice(start, start + packedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) {
        const stream = new Blob([compressed])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else
        throw Error(
          "Android 샘플에서 지원하지 않는 압축 방식입니다: " + method,
        );
      if (crc32(data) !== crc)
        throw Error("Android 샘플 체크섬이 맞지 않습니다: " + name);
      files.set(name, data);
    }
    for (const name of [
      "build.gradle.kts",
      "src/main/AndroidManifest.xml",
      "src/main/theme/values/colors.xml",
    ])
      if (!files.has(name))
        throw Error("Android 샘플 필수 파일이 없습니다: " + name);
    return files;
  }
  function androidPackageId(name) {
    let s =
        safeName(name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")
          .slice(0, 18) || "theme",
      h = 2166136261;
    for (const c of name) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return "com.talktheme.studio.t" + s + (h >>> 0).toString(36);
  }
  function androidPatchColors(xml, v) {
    for (const [key, value] of Object.entries(
      THEME_DESIGN.spec.android.colors,
    )) {
      const color = THEME_DESIGN.resolve(value, v),
        re = new RegExp(
          '(<color\\s+name="' + key + '">)[\\s\\S]*?(<\\/color>)',
        );
      if (re.test(xml))
        xml = xml.replace(re, "$1" + color.toUpperCase() + "$2");
    }
    return xml;
  }
  async function androidPngBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function androidSolid(bytes, color) {
    const im = await createImageBitmap(new Blob([bytes])),
      c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext("2d");
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    im.close();
    return androidPngBytes(await canvasBlob(c));
  }
  async function androidIcon(bytes, v) {
    const im = await createImageBitmap(new Blob([bytes])),
      c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext("2d");
    x.fillStyle = v.main;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = v.send;
    x.strokeStyle = v.accent;
    x.lineWidth = Math.max(2, c.width * 0.018);
    x.beginPath();
    x.roundRect(
      c.width * 0.16,
      c.height * 0.18,
      c.width * 0.66,
      c.height * 0.42,
      c.width * 0.1,
    );
    x.fill();
    x.stroke();
    x.fillStyle = v.receive;
    x.beginPath();
    x.roundRect(
      c.width * 0.36,
      c.height * 0.46,
      c.width * 0.48,
      c.height * 0.34,
      c.width * 0.1,
    );
    x.fill();
    x.stroke();
    im.close();
    return androidPngBytes(await canvasBlob(c));
  }
  async function androidResource(path, data, v) {
    if (/theme_chatroom_bubble_(me|you)_0[12]_image\.9\.png$/.test(path))
      return androidCommonBubble(path, v);
    if (path.endsWith("theme_chatroom_background_image.png"))
      return v.images?.chat?.data
        ? androidPngBytes(await commonBackground(v.images.chat.data))
        : androidSolid(data, v.bg);
    if (
      path.endsWith("theme_background_image.png") ||
      path.endsWith("theme_passcode_background_image.png") ||
      path.endsWith("theme_splash_image.png")
    )
      return androidSolid(
        data,
        path.endsWith("theme_background_image.png") ? v.main : v.bg,
      );
    const icon = path.match(
      /theme_maintab_ico_(friends|chats|local|now|piccoma|shopping|call|more)(_focused)?_image\.png$/,
    );
    if (icon) {
      const type = icon[1][0].toUpperCase() + icon[1].slice(1);
      return androidTabAsset(data, type, Boolean(icon[2]), v);
    }
    if (path.includes("theme_find_add_friend_button_"))
      return androidGlyph(data, "+", v.accent);
    if (path.endsWith("theme_profile_01_image.png"))
      return androidProfile(data, v);
    if (/theme_passcode_0[1-4](_checked)?_image\.png$/.test(path))
      return androidDot(data, v.accent, path.includes("_checked"));
    if (path.endsWith("theme_maintab_cell_image.9.png"))
      return androidNinePatchFill(data, v.main);
    return data;
  }
  async function makeAndroidProjectZip(v) {
    v = THEME_DESIGN.snapshot(v);
    const files = await unzipAndroidTemplate(),
      pkg = androidPackageId(v.name),
      enc = new TextEncoder(),
      dec = new TextDecoder();
    let gradle = dec
      .decode(files.get("build.gradle.kts"))
      .replace(/applicationId\s*=\s*"[^"]+"/, 'applicationId = "' + pkg + '"');
    if (!gradle.includes(pkg))
      throw Error("Gradle package 설정을 바꾸지 못했습니다.");
    files.set("build.gradle.kts", enc.encode(gradle));
    for (const [path, data] of [...files]) {
      if (/src\/main\/theme\/values(?:-[^/]+)?\/strings\.xml$/.test(path)) {
        const xml = dec
          .decode(data)
          .replace(
            /(<string\s+name="(?:theme_title|app_name)">)[\s\S]*?(<\/string>)/g,
            (_, open, close) => open + androidStringValue(v.name) + close,
          );
        files.set(path, enc.encode(xml));
      }
      if (path === "src/main/theme/values/colors.xml")
        files.set(path, enc.encode(androidPatchColors(dec.decode(data), v)));
      if (path === "src/main/res/values/colors.xml")
        files.set(
          path,
          enc.encode(
            dec
              .decode(data)
              .replace(
                /(<color\s+name="statusBarColor">)[\s\S]*?(<\/color>)/,
                "$1" + v.main + "$2",
              ),
          ),
        );
    }
    const jobs = [];
    for (const [path, data] of files) {
      if (!path.endsWith(".png")) continue;
      if (path.startsWith("src/main/theme/"))
        jobs.push([path, androidResource(path, data, v)]);
      else if (/src\/main\/res\/mipmap-[^/]+\/ic_launcher/.test(path))
        jobs.push([path, androidIcon(data, v)]);
    }
    const outputs = await Promise.all(jobs.map(async ([p, q]) => [p, await q]));
    for (const [p, d] of outputs) files.set(p, d);
    files.set(
      "talktheme-bubbles.json",
      enc.encode(
        JSON.stringify({
          version: 2,
          specVersion: THEME_DESIGN.spec.version,
          buildVersion: v.buildVersion,
          style: v.bubbleStyle,
          colors: Object.fromEntries(
            THEME_DESIGN.spec.colors.map(({ key }) => [key, v[key]]),
          ),
        }),
      ),
    );
    const entries = [...files].map(([name, data]) => ({
        name,
        data,
        executable: name === "gradlew",
      })),
      zip = await createZip(entries),
      check = await verifyZip(zip, entries);
    if (check.fileCount !== entries.length)
      throw Error("ZIP 검증에 실패했습니다.");
    return { zip, name: safeName(v.name), packageId: pkg };
  }
  window.ANDROID_THEME_EXPORTER = {
    features: [
      "color.bg",
      "color.main",
      "color.accent",
      "color.send",
      "color.receive",
      "color.ink",
      "bubble.square",
      "bubble.rounded",
      "chat.image",
    ],
    build: makeAndroidProjectZip,
  };
})();
