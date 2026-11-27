const DEFAULTS = {};
const palettes = [
  ["라벤더", "#F2EFF8", "#FBFAFE", "#A899C8", "#DDD3EF", "#FFFFFF", "#3F3A4A"],
  [
    "소프트 모닝",
    "#F4F0E8",
    "#FCFAF6",
    "#B7C8B3",
    "#D8E6D3",
    "#FFFFFF",
    "#31352F",
  ],
  [
    "블루 아워",
    "#EAF1F6",
    "#F8FBFD",
    "#8EAFC8",
    "#C8DCEB",
    "#FFFFFF",
    "#2F3E4B",
  ],
  ["피치 티", "#FFF0E7", "#FFFAF6", "#D89678", "#F8D2BE", "#FFFFFF", "#523B35"],
  [
    "말차 크림",
    "#EEF1E5",
    "#FAFBF5",
    "#8B9D6A",
    "#D9E4C0",
    "#FFFFFF",
    "#35402D",
  ],
  [
    "체리 소다",
    "#FCEEF0",
    "#FFFAFB",
    "#CF7C8C",
    "#F6CED4",
    "#FFFFFF",
    "#4A343A",
  ],
];
let defs = [];
const swatches = [
  "#FFFFFF",
  "#FFFDF8",
  "#F8F5EE",
  "#F4F0E8",
  "#E9E2D7",
  "#D5CCBD",
  "#B7AA98",
  "#807462",
  "#FCEEF0",
  "#F6CED4",
  "#E7A2AC",
  "#CF7C8C",
  "#FFF0E7",
  "#F8D2BE",
  "#E7A989",
  "#D89678",
  "#F2EFF8",
  "#DDD3EF",
  "#A899C8",
  "#74658F",
  "#EAF1F6",
  "#C8DCEB",
  "#8EAFC8",
  "#5A7791",
  "#EEF1E5",
  "#D9E4C0",
  "#A8BD83",
  "#70814F",
  "#E8F3E8",
  "#CDE6D0",
  "#8FBE9A",
  "#50775B",
  "#F7E8D5",
  "#EBC99F",
  "#BD9666",
  "#775C3C",
  "#F4E8EA",
  "#D9BFC4",
  "#A77D86",
  "#694B55",
];
let stored = {};
try {
  stored = JSON.parse(localStorage.getItem("talktheme") || "{}");
} catch {}
let s = { images: { chat: null } };
let activeKey = null,
  stagedColor = null,
  stagedPalette = null;
const $ = (q) => document.querySelector(q),
  hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000");
function persist() {
  localStorage.setItem("talktheme", JSON.stringify(s));
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2800);
}
function current() {
  let v = { ...s };
  if (stagedPalette) {
    [v.bg, v.main, v.accent, v.send, v.receive, v.ink] = stagedPalette.slice(1);
  }
  if (activeKey && stagedColor) v[activeKey] = stagedColor;
  return v;
}
function openPicker(key) {
  activeKey = key;
  stagedColor = s[key];
  stagedPalette = null;
  drawPicker();
  preview();
}
function drawPicker() {
  const p = $("#color-picker-panel");
  if (!activeKey) {
    p.hidden = true;
    return;
  }
  p.innerHTML =
    '<div class="picker-head"><b>' +
    defs.find((x) => x[1] === activeKey)[0] +
    ' 색상</b><input type="color" id="staged-color" value="' +
    stagedColor +
    '"><code>' +
    stagedColor +
    '</code></div><div class="swatches">' +
    swatches
      .map(
        (c) =>
          '<button type="button" data-swatch="' +
          c +
          '" title="' +
          c +
          '" style="background:' +
          c +
          '"></button>',
      )
      .join("") +
    '</div><div class="picker-actions"><button type="button" data-cancel>취소</button><button type="button" class="apply" data-apply>적용</button></div>';
  p.hidden = false;
}
function paintImageControls() {
  const image = s.images?.chat,
    preview = $("#chat-image-preview"),
    label = $("#chat-image-name");
  if (!preview || !label) return;
  preview.style.backgroundImage = image?.data
    ? 'url("' + image.data + '")'
    : "none";
  preview.classList.toggle("has-image", Boolean(image?.data));
  label.textContent = image?.name || "이미지를 선택해주세요";
}
function render() {
  $("#name").value = s.name;
  $("#colors").innerHTML = defs
    .map(
      ([label, key]) =>
        '<div class="color-row"><span>' +
        label +
        '</span><button type="button" class="color-open" data-color="' +
        key +
        '"><i style="background:' +
        s[key] +
        '"></i><code>' +
        s[key] +
        "</code><span>색 선택</span></button></div>",
    )
    .join("");
  $("#bubble-templates").innerHTML = Object.entries(
    THEME_DESIGN.spec.bubble.styles,
  )
    .map(
      ([id, style]) =>
        '<button type="button" class="bubble-template ' +
        (s.bubbleStyle === id ? "selected" : "") +
        '" data-bubble-style="' +
        id +
        '" aria-pressed="' +
        (s.bubbleStyle === id) +
        '"><span class="bubble-sample ' +
        id +
        '" style="--template-radius:' +
        style.radius +
        'px"><span>가나다</span></span><b>' +
        style.label +
        "</b><small>" +
        style.description +
        "</small></button>",
    )
    .join("");
  $("#presets").innerHTML = palettes
    .map(
      (p) =>
        '<div class="preset-line"><div class="preset ' +
        (stagedPalette?.[0] === p[0] ? "selected" : "") +
        '" data-preset-preview="' +
        p[0] +
        '"><small>' +
        p[0] +
        "</small>" +
        p
          .slice(1, 6)
          .map((c) => '<i style="background:' + c + '"></i>')
          .join("") +
        '<button type="button" data-preset-apply="' +
        p[0] +
        '">적용</button></div></div>',
    )
    .join("");
  drawPicker();
  paintImageControls();
  preview();
}
function preview() {
  androidInvalidateDownload();
  const v = current(),
    chat = $("#chat-preview"),
    friends = $("#friends-preview");
  chat.innerHTML =
    '<div class="chat-screen" data-bubble-style="' +
    v.bubbleStyle +
    '"><div class="chat-nav"><span>‹</span><b>오후의 작은 대화</b><span>⌕　☰</span></div><div class="day-pill">오늘 · 오후 2:41</div><div class="message-row"><div class="avatar profile-placeholder" aria-hidden="true"></div><div><small>민지</small><div class="bubble incoming"><span>오늘 날씨 너무 좋다 ☁️<br>산책 갈래?</span></div><time>오후 2:41</time></div></div><div class="message-row mine"><div><div class="bubble outgoing"><span>좋아! 좋아하는 카페도<br>들러가자 🌿</span></div><time>오후 2:42</time></div></div><div class="message-row"><div class="avatar profile-placeholder" aria-hidden="true"></div><div><small>민지</small><div class="bubble incoming"><span>완전 좋아 🤍<br>금방 준비하고 나갈게!</span></div></div></div><div class="chat-spacer"></div><div class="inputbar"><span>＋</span><div>메시지를 입력하세요</div><span>☺</span></div></div>';
  friends.innerHTML =
    '<div class="friends-screen"><div class="friends-nav"><b>친구</b><span>⌕　＋　☰</span></div><div class="friend-search">친구 이름 검색</div><div class="friend-caption">내 프로필</div>' +
    [
      ["나", "오늘도 좋은 하루"],
      ["민지", "오늘도 좋은 하루"],
      ["서연", "산책 갈까요?"],
      ["지우", "오늘도 좋은 하루"],
    ]
      .map(
        (x, i) =>
          '<div class="friend-item"><div class="friend-avatar profile-placeholder" aria-hidden="true"></div><div><b>' +
          x[0] +
          "</b><small>" +
          x[1] +
          "</small></div></div>",
      )
      .join("") +
    '<nav class="fake-tab">' +
    [
      ["●", "친구"],
      ["▤", "채팅"],
      ["◉", "지금"],
      ["◇", "쇼핑"],
      ["•••", "더보기"],
    ]
      .map(
        (x, i) =>
          '<span style="color:' +
          (i === 0 ? v.ink : v.accent) +
          '"><b>' +
          x[0] +
          '</b><small style="color:' +
          v.ink +
          '">' +
          x[1] +
          "</small></span>",
      )
      .join("") +
    "</nav></div>";
  for (const el of [
    chat.querySelector(".chat-screen"),
    friends.querySelector(".friends-screen"),
    $("#bubble-templates"),
  ]) {
    el.style.setProperty("--bg", v.bg);
    el.style.setProperty("--main", v.main);
    el.style.setProperty("--accent", v.accent);
    el.style.setProperty("--send", v.send);
    el.style.setProperty("--receive", v.receive);
    el.style.setProperty("--ink", v.ink);
  }
  const chatScreen = chat.querySelector(".chat-screen"),
    friendsScreen = friends.querySelector(".friends-screen");
  window.PREVIEW_READY = paintPreviewPhoto(chatScreen, v.images?.chat?.data);
  document.querySelectorAll(".color-open").forEach((b) => {
    const k = b.dataset.color;
    b.querySelector("i").style.background = v[k];
    b.querySelector("code").textContent = v[k];
  });
  for (const el of [chatScreen, friendsScreen, $("#bubble-templates")]) {
    el.style.setProperty(
      "--bubble-stroke",
      THEME_DESIGN.spec.bubble.strokeWidth + "px",
    );
    el.style.setProperty(
      "--bubble-min-width",
      THEME_DESIGN.spec.bubble.width + "px",
    );
    el.style.setProperty(
      "--bubble-min-height",
      THEME_DESIGN.spec.bubble.height + "px",
    );
    el.style.setProperty(
      "--bubble-radius",
      THEME_DESIGN.spec.bubble.styles[v.bubbleStyle].radius + "px",
    );
    el.style.setProperty(
      "--bubble-pad-send",
      THEME_DESIGN.padding(
        "send",
        "px",
        undefined,
        THEME_DESIGN.spec.bubble.strokeWidth,
      ),
    );
    el.style.setProperty(
      "--bubble-pad-receive",
      THEME_DESIGN.padding(
        "receive",
        "px",
        undefined,
        THEME_DESIGN.spec.bubble.strokeWidth,
      ),
    );
  }
  const note = document.querySelector(".bubble-note");
  if (note)
    note.textContent =
      "각진·둥근 모서리는 아이폰·안드로이드 공통 설정으로 생성해요.";
}

let previewPhotoRevision = 0,
  previewPhotoUrl = null;
async function paintPreviewPhoto(screen, imageData) {
  const revision = ++previewPhotoRevision;
  if (previewPhotoUrl) {
    URL.revokeObjectURL(previewPhotoUrl);
    previewPhotoUrl = null;
  }
  if (!imageData) return;
  try {
    const blob = await commonBackground(imageData);
    if (revision !== previewPhotoRevision || !screen.isConnected) return;
    previewPhotoUrl = URL.createObjectURL(blob);
    screen.style.backgroundImage = 'url("' + previewPhotoUrl + '")';
  } catch (error) {
    if (revision === previewPhotoRevision)
      toast("배경 이미지를 미리볼 수 없어요: " + error.message);
  }
}

document.addEventListener("click", (e) => {
  const bubbleChoice = e.target.closest("[data-bubble-style]");
  if (bubbleChoice) {
    s.bubbleStyle = bubbleChoice.dataset.bubbleStyle;
    persist();
    render();
    return;
  }
  const color = e.target.closest("[data-color]");
  if (color) {
    openPicker(color.dataset.color);
    return;
  }
  const sw = e.target.closest("[data-swatch]");
  if (sw && activeKey) {
    stagedColor = sw.dataset.swatch;
    drawPicker();
    preview();
    return;
  }
  if (e.target.closest("[data-apply]") && activeKey) {
    const finalColor = $("#staged-color");
    if (finalColor) stagedColor = hex(finalColor.value);
    s[activeKey] = stagedColor;
    activeKey = null;
    stagedColor = null;
    stagedPalette = null;
    persist();
    render();
    return;
  }
  if (e.target.closest("[data-cancel]")) {
    activeKey = null;
    stagedColor = null;
    stagedPalette = null;
    render();
    return;
  }
  const pv = e.target.closest("[data-preset-preview]");
  if (pv && !e.target.closest("[data-preset-apply]")) {
    activeKey = null;
    stagedColor = null;
    stagedPalette = palettes.find((p) => p[0] === pv.dataset.presetPreview);
    render();
    return;
  }
  const ap = e.target.closest("[data-preset-apply]");
  if (ap) {
    const p = palettes.find((x) => x[0] === ap.dataset.presetApply);
    [s.bg, s.main, s.accent, s.send, s.receive, s.ink] = p.slice(1);
    activeKey = null;
    stagedColor = null;
    stagedPalette = null;
    persist();
    render();
    return;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "name") {
    s.name = e.target.value;
    persist();
  }
  if (e.target.id === "staged-color" && activeKey) {
    stagedColor = hex(e.target.value);
    $("#color-picker-panel code").textContent = stagedColor;
    preview();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "staged-color" && activeKey) {
    stagedColor = hex(e.target.value);
    const code = $("#color-picker-panel code");
    if (code) code.textContent = stagedColor;
    preview();
  }
});
async function normalizeUserImage(file) {
  if (!file.type.startsWith("image/"))
    throw Error("이미지 파일을 선택해주세요.");
  if (file.size > 20 * 1024 * 1024)
    throw Error("이미지 파일은 20MB 이하로 선택해주세요.");
  const bitmap = await createImageBitmap(file);
  try {
    const max = 1440,
      scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)),
      c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.84), name: file.name };
  } finally {
    bitmap.close();
  }
}
$('[data-image-input="chat"]').addEventListener("change", async (e) => {
  const file = e.currentTarget.files?.[0];
  if (!file) return;
  try {
    s.images.chat = await normalizeUserImage(file);
    persist();
    render();
    toast("채팅 배경을 적용했어요.");
  } catch (err) {
    toast("이미지를 불러오지 못했어요: " + err.message);
  }
  e.currentTarget.value = "";
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-remove-image]");
  if (!button) return;
  const key = button.dataset.removeImage;
  if (key !== "chat") return;
  s.images.chat = null;
  const input = $('[data-image-input="chat"]');
  if (input) input.value = "";
  persist();
  render();
  toast("업로드 이미지를 제거했어요.");
});
$("#installGuide").onclick = () => $("#install-modal").showModal();
$("#install-modal .modal-close").onclick = () => $("#install-modal").close();
$("#install-modal").addEventListener("click", (e) => {
  if (e.target === $("#install-modal")) $("#install-modal").close();
});
document.querySelectorAll("[data-guide-tab]").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-guide-tab]").forEach((b) => {
      b.classList.toggle("active", b === tab);
      b.setAttribute("aria-selected", b === tab ? "true" : "false");
    });
    document
      .querySelectorAll("[data-guide-panel]")
      .forEach(
        (panel) =>
          (panel.hidden = panel.dataset.guidePanel !== tab.dataset.guideTab),
      );
  }),
);
$("#export").onclick = async () => {
  const b = $("#export");
  b.disabled = true;
  try {
    const result = await IOS_THEME_EXPORTER.build(current());
    download(result.zip, result.name + ".ktheme");
    toast(
      `패키지 확인 완료 · ${result.report.images}개 이미지 · ZIP ${result.archiveCheck.fileCount}개 파일 검증`,
    );
  } catch (err) {
    console.error(err);
    toast("내보내기 실패: " + err.message);
  } finally {
    b.disabled = false;
  }
};
$("#exportAndroid").onclick = exportAndroidApk;
$("#reset").onclick = () => {
  s = { ...DEFAULTS, images: { chat: null } };
  activeKey = null;
  stagedColor = null;
  stagedPalette = null;
  persist();
  render();
  toast("컬러 초안을 초기화했어요.");
};
window.THEME_READY = THEME_DESIGN.ready
  .then((spec) => {
    THEME_DESIGN.assertSupport("아이폰", IOS_THEME_EXPORTER);
    THEME_DESIGN.assertSupport("안드로이드", ANDROID_THEME_EXPORTER);
    Object.assign(DEFAULTS, spec.defaults);
    defs = spec.colors.map(({ label, key }) => [label, key]);
    s = THEME_DESIGN.normalize(stored);
    const migrated =
      stored.bubbleStyle &&
      !Object.hasOwn(spec.bubble.styles, stored.bubbleStyle);
    if (migrated) persist();
    render();
    for (const id of ["export", "exportAndroid", "reset"])
      $("#" + id).disabled = false;
    if (migrated)
      toast(
        "두 기기 공통 템플릿을 적용했어요. 이전 점선·물결은 둥근 모서리로 변경됐습니다.",
      );
    return spec;
  })
  .catch((error) => {
    console.error(error);
    toast(error.message + " 페이지를 새로고침해주세요.");
  });
