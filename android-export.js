// Android APK session and download flow. Resource generation is in android-project.js.
let androidReadyDownload = null;
let androidReadyTimer = null;

function androidInvalidateDownload() {
  if (
    androidReadyDownload &&
    androidReadyDownload.design !== JSON.stringify(current())
  ) {
    androidReadyDownload = null;
    clearTimeout(androidReadyTimer);
    androidButton("안드로이드 저장", "변경한 테마 APK 생성");
  }
}

function androidButton(label, detail) {
  const button = document.querySelector("#exportAndroid");
  button.replaceChildren(document.createTextNode(label + " "));
  const small = document.createElement("small");
  small.textContent = detail;
  button.append(small);
  button.setAttribute("aria-label", label + " · " + detail);
}

async function androidRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(65_000),
    });
  } catch {
    throw Error(
      "빌드 서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("빌드 서버 응답을 읽지 못했어요. 다시 시도해주세요.");
  }
  if (!response.ok) throw Error(data.error || "APK 생성 요청에 실패했어요.");
  return data;
}

async function exportAndroidApk() {
  const button = document.querySelector("#exportAndroid");
  androidInvalidateDownload();
  if (androidReadyDownload && Date.now() < androidReadyDownload.expires) {
    const link = document.createElement("a");
    link.href = androidReadyDownload.url;
    link.download = androidReadyDownload.name + ".apk";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    toast("APK를 저장한 뒤 열어서 설치해주세요.");
    return;
  }
  androidReadyDownload = null;
  const service = String(window.ANDROID_APK_SERVICE || "").replace(/\/$/, "");
  if (
    !/^https:\/\/[^/]+$/.test(service) &&
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(service)
  ) {
    toast("APK 서버 연결이 아직 준비되지 않았어요. 운영자에게 문의해주세요.");
    return;
  }
  const theme = current();
  const design = JSON.stringify(theme);
  // Freeze the uploaded photo as well as the colors at the click.
  theme.images = structuredClone(theme.images);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    androidButton("안드로이드 저장", "테마 이미지 생성 중");
    const project = await ANDROID_THEME_EXPORTER.build(theme);
    androidButton("안드로이드 저장", "빌드 서버 연결 중");
    const session = await androidRequest(service + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designSpecVersion: THEME_DESIGN.spec.version }),
    });
    if (
      session.bubbleRendererVersion !== 2 ||
      session.designSpecVersion !== THEME_DESIGN.spec.version
    )
      throw Error(
        "말풍선 빌드 서버가 업데이트 중이에요. 잠시 뒤 다시 저장해주세요.",
      );
    const base = new URL(session.builderUrl);
    if (base.protocol !== "https:" && base.hostname !== "127.0.0.1")
      throw Error("올바르지 않은 빌드 서버 주소입니다.");
    const expires = Number(session.expiresAt);
    if (!session.token || !Number.isFinite(expires))
      throw Error("빌드 세션 정보가 올바르지 않습니다.");
    const headers = { Authorization: "Bearer " + session.token };
    const job = await androidRequest(base.origin + "/build", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/zip" },
      body: project.zip,
    });
    const deadline = Math.min(expires - 30_000, Date.now() + 23 * 60_000);
    while (Date.now() < deadline) {
      const status = await androidRequest(
        base.origin + "/status/" + encodeURIComponent(job.jobId),
        { headers },
      );
      if (status.error) throw Error(status.error);
      if (status.done) {
        const url = new URL("/download/" + encodeURIComponent(job.jobId), base);
        url.searchParams.set("token", session.token);
        androidReadyDownload = {
          url: url.href,
          name: project.name,
          expires,
          design,
        };
        androidButton("안드로이드 저장", "저장 준비 완료");
        toast(
          "테마가 완성됐어요. 안드로이드 저장을 한 번 더 눌러 APK 파일을 저장해주세요.",
        );
        clearTimeout(androidReadyTimer);
        androidReadyTimer = setTimeout(
          () => {
            androidReadyDownload = null;
            androidButton("안드로이드 저장", "APK 다시 생성");
          },
          Math.max(0, expires - Date.now()),
        );
        return;
      }
      androidButton("안드로이드 저장", status.stage || "빌드 진행 중");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw Error("APK 생성 시간이 초과됐어요. 다시 시도해주세요.");
  } catch (error) {
    console.error("Android export:", error);
    androidButton("안드로이드 저장", "APK 다시 시도");
    toast(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
