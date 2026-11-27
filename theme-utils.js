// Format-neutral image and ZIP utilities. No platform resource paths belong here.
function safeName(v) {
  return (
    (v || "내 테마")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim()
      .slice(0, 30) || "내 테마"
  );
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
let backgroundCacheKey = null,
  backgroundCachePromise = null;
async function commonBackground(imageData) {
  if (backgroundCacheKey === imageData && backgroundCachePromise)
    return backgroundCachePromise;
  backgroundCacheKey = imageData;
  backgroundCachePromise = (async () => {
    const spec = THEME_DESIGN.spec.background,
      source = new Image();
    source.src = imageData;
    await source.decode();
    const c = document.createElement("canvas");
    c.width = spec.width;
    c.height = spec.height;
    const x = c.getContext("2d"),
      scale = Math.max(
        c.width / source.naturalWidth,
        c.height / source.naturalHeight,
      ),
      sw = c.width / scale,
      sh = c.height / scale;
    x.drawImage(
      source,
      (source.naturalWidth - sw) / 2,
      (source.naturalHeight - sh) / 2,
      sw,
      sh,
      0,
      0,
      c.width,
      c.height,
    );
    return canvasBlob(c);
  })();
  return backgroundCachePromise;
}
function rgba(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function canvasBlob(c) {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("PNG 생성 실패"))),
      "image/png",
    ),
  );
}
const TAB_GLYPHS = {
  Friends: "●",
  Chats: "▤",
  Now: "◉",
  Local: "⌖",
  Piccoma: "▣",
  Shopping: "◇",
  Call: "☎",
  More: "•••",
};
const TAB_LABELS = {
  Friends: "친구",
  Chats: "채팅",
  Now: "지금",
  Local: "로컬",
  Piccoma: "만화",
  Shopping: "쇼핑",
  Call: "통화",
  More: "더보기",
};
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d) {
  let c = 0xffffffff;
  for (const b of d) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16(n) {
  return [n & 255, (n >>> 8) & 255];
}
function u32(n) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}
function cat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function createZip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name),
      data =
        e.data instanceof Blob
          ? new Uint8Array(await e.data.arrayBuffer())
          : e.data,
      crc = crc32(data),
      head = cat([
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(0x0800)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u16(name.length)),
        new Uint8Array(u16(0)),
        name,
        data,
      ]);
    local.push(head);
    central.push(
      cat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(0x0800)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u16(name.length)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u32(0)),
        new Uint8Array(u32(offset)),
        name,
      ]),
    );
    offset += head.length;
  }
  const cdir = cat(central),
    end = cat([
      new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(entries.length)),
      new Uint8Array(u16(entries.length)),
      new Uint8Array(u32(cdir.length)),
      new Uint8Array(u32(offset)),
      new Uint8Array(u16(0)),
    ]);
  return new Blob([...local, cdir, end], { type: "application/octet-stream" });
}
async function verifyZip(blob, expected) {
  const bytes = new Uint8Array(await blob.arrayBuffer()),
    map = new Map();
  let offset = 0;
  while (
    offset + 4 <= bytes.length &&
    bytes[offset] === 0x50 &&
    bytes[offset + 1] === 0x4b &&
    bytes[offset + 2] === 0x03 &&
    bytes[offset + 3] === 0x04
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset),
      method = view.getUint16(8, true),
      crc = view.getUint32(14, true),
      size = view.getUint32(22, true),
      nameLen = view.getUint16(26, true),
      extraLen = view.getUint16(28, true),
      nameStart = offset + 30,
      name = new TextDecoder().decode(
        bytes.subarray(nameStart, nameStart + nameLen),
      ),
      start = nameStart + nameLen + extraLen,
      end = start + size;
    if (method !== 0 || end > bytes.length)
      throw Error("압축 파일 항목의 형식이 올바르지 않습니다: " + name);
    const data = bytes.slice(start, end);
    if (crc32(data) !== crc) throw Error("ZIP 체크섬 불일치: " + name);
    map.set(name, data);
    offset = end;
  }
  if (
    bytes[offset] !== 0x50 ||
    bytes[offset + 1] !== 0x4b ||
    bytes[offset + 2] !== 0x01 ||
    bytes[offset + 3] !== 0x02
  )
    throw Error("ZIP 중앙 디렉터리가 없습니다.");
  if (map.size !== expected.length)
    throw Error("ZIP 내부 파일 개수가 예상과 다릅니다.");
  for (const e of expected) {
    const got = map.get(e.name);
    if (!got) throw Error("ZIP에서 파일을 찾지 못했습니다: " + e.name);
    const raw =
      e.data instanceof Blob
        ? new Uint8Array(await e.data.arrayBuffer())
        : e.data;
    if (got.length !== raw.length || got.some((n, i) => n !== raw[i]))
      throw Error("ZIP 내부 파일이 패키지 원본과 다릅니다: " + e.name);
  }
  return { fileCount: map.size, verifiedBytes: bytes.length };
}
