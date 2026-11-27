// Android-only helpers. The iOS exporter and page layout stay independent.
function androidStringValue(value) {
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '&quot;' + text + '&quot;';
}

async function androidCanvas(bytes, draw) {
  const image = await createImageBitmap(new Blob([bytes]));
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  await draw(canvas.getContext('2d'), canvas, image);
  image.close();
  return androidPngBytes(await canvasBlob(canvas));
}

function androidGlyph(bytes, glyph, color) {
  return androidCanvas(bytes, (ctx, c) => {
    ctx.fillStyle = color;
    ctx.font = `${Math.floor(Math.min(c.width, c.height) * .70)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, c.width / 2, c.height / 2, c.width * .90);
  });
}

function androidDot(bytes, color, checked) {
  return androidCanvas(bytes, (ctx, c) => {
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) * .30, 0, Math.PI * 2);
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, c.width * .06);
    if (checked) ctx.fill(); else ctx.stroke();
  });
}

function androidProfile(bytes, v) {
  return androidCanvas(bytes, (ctx, c) => {
    ctx.fillStyle = v.main;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = v.accent;
    ctx.beginPath();
    ctx.arc(c.width * .5, c.height * .35, c.width * .17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.width * .5, c.height * .85, c.width * .34, c.height * .30, 0, 0, Math.PI * 2);
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

let androidReadyDownload = null;
let androidReadyTimer = null;

function androidInvalidateDownload() {
  if (androidReadyDownload && androidReadyDownload.design !== JSON.stringify(current())) {
    androidReadyDownload = null;
    clearTimeout(androidReadyTimer);
    androidButton('안드로이드 저장', '변경한 테마 APK 생성');
  }
}

function androidButton(label, detail) {
  const button = document.querySelector('#exportAndroid');
  button.replaceChildren(document.createTextNode(label + ' '));
  const small = document.createElement('small');
  small.textContent = detail;
  button.append(small);
  button.setAttribute('aria-label', label + ' · ' + detail);
}

async function androidRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(65_000) });
  } catch {
    throw Error('빌드 서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
  }
  let data;
  try { data = await response.json(); } catch { throw Error('빌드 서버 응답을 읽지 못했어요. 다시 시도해주세요.'); }
  if (!response.ok) throw Error(data.error || 'APK 생성 요청에 실패했어요.');
  return data;
}

async function exportAndroidApk() {
  const button = document.querySelector('#exportAndroid');
  androidInvalidateDownload();
  if (androidReadyDownload && Date.now() < androidReadyDownload.expires) {
    const link = document.createElement('a');
    link.href = androidReadyDownload.url;
    link.download = androidReadyDownload.name + '.apk';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    toast('APK를 저장한 뒤 열어서 설치해주세요.');
    return;
  }
  androidReadyDownload = null;
  const service = String(window.ANDROID_APK_SERVICE || '').replace(/\/$/, '');
  if (!/^https:\/\/[^/]+$/.test(service) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(service)) {
    toast('APK 서버 연결이 아직 준비되지 않았어요. 운영자에게 문의해주세요.');
    return;
  }
  const theme = current();
  const design = JSON.stringify(theme);
  // Freeze the uploaded photo as well as the colors at the click.
  theme.images = structuredClone(s.images);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    androidButton('APK 준비 중', '테마 이미지 생성');
    const project = await makeAndroidProjectZip(theme);
    androidButton('APK 준비 중', '빌드 서버 연결');
    const session = await androidRequest(service + '/api/session', { method: 'POST' });
    const base = new URL(session.builderUrl);
    if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1') throw Error('올바르지 않은 빌드 서버 주소입니다.');
    const expires = Number(session.expiresAt);
    if (!session.token || !Number.isFinite(expires)) throw Error('빌드 세션 정보가 올바르지 않습니다.');
    const headers = { Authorization: 'Bearer ' + session.token };
    const job = await androidRequest(base.origin + '/build', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: project.zip
    });
    const deadline = Math.min(expires - 30_000, Date.now() + 23 * 60_000);
    while (Date.now() < deadline) {
      const status = await androidRequest(base.origin + '/status/' + encodeURIComponent(job.jobId), { headers });
      if (status.error) throw Error(status.error);
      if (status.done) {
        const url = new URL('/download/' + encodeURIComponent(job.jobId), base);
        url.searchParams.set('token', session.token);
        androidReadyDownload = { url: url.href, name: project.name, expires, design };
        androidButton('APK 다운로드', project.name + ' · 완료');
        toast('APK가 완성됐어요. APK 다운로드 버튼을 눌러 저장해주세요.');
        clearTimeout(androidReadyTimer);
        androidReadyTimer = setTimeout(() => {
          androidReadyDownload = null;
          androidButton('안드로이드 저장', 'APK 다시 생성');
        }, Math.max(0, expires - Date.now()));
        return;
      }
      androidButton('APK 생성 중', status.stage || '빌드 진행 중');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw Error('APK 생성 시간이 초과됐어요. 다시 시도해주세요.');
  } catch (error) {
    console.error('Android export:', error);
    androidButton('안드로이드 저장', 'APK 다시 시도');
    toast(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
