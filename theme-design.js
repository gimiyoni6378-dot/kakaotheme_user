// One design contract for the preview, iOS archive, and Android build service.
(() => {
  let spec;
  let lastBuildVersion = 100;
  const ready = fetch('android-apk-service/theme-spec.json?v=20261127-platform1')
    .then(response => {
      if (!response.ok) throw Error('공통 테마 설정을 불러오지 못했습니다.');
      return response.json();
    }).then(value => {
      if (value.version !== 1 || !value.bubble?.styles?.square || !value.bubble?.styles?.rounded || value.colors?.length !== 6) {
        throw Error('지원하지 않는 공통 테마 설정입니다.');
      }
      spec = value;
      return spec;
    });
  const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  function normalize(value = {}) {
    if (!spec) throw Error('공통 테마 설정이 아직 준비되지 않았습니다.');
    if (!value || typeof value !== 'object') value = {};
    const result = {...spec.defaults};
    for (const {key} of spec.colors) if (isColor(value[key])) result[key] = value[key].toUpperCase();
    if (typeof value.name === 'string' && value.name.trim()) result.name = value.name.slice(0, 30);
    if (Object.hasOwn(spec.bubble.styles, value.bubbleStyle)) result.bubbleStyle = value.bubbleStyle;
    result.images = {chat: structuredClone(value.images?.chat || null)};
    return result;
  }
  function snapshot(value) {
    if (!spec || !Object.hasOwn(spec.bubble.styles, value.bubbleStyle)) {
      throw Error('아이폰·안드로이드 공통 템플릿을 선택해주세요.');
    }
    for (const {key} of spec.colors) if (!isColor(value[key])) throw Error('올바르지 않은 색상 설정입니다: ' + key);
    const result = normalize(value);
    // A fresh package version also prevents an older same-name design being reused.
    result.buildVersion = Math.max(lastBuildVersion + 1, Math.floor(Date.now() / 1000));
    if (result.buildVersion > 2100000000) throw Error('기기 날짜·시간 설정을 확인해주세요.');
    lastBuildVersion = result.buildVersion;
    return result;
  }
  function resolve(value, design) {
    return typeof value === 'string' && value.startsWith('$') ? design[value.slice(1)] : value;
  }
  function padding(role, unit = 'px', order = ['top', 'right', 'bottom', 'left'], inset = 0) {
    return order.map(side => Math.max(0, spec.bubble.padding[role][side] - inset) + unit).join(' ');
  }
  function assertSupport(platform, adapter) {
    const missing = spec.commonFeatures.filter(feature => !adapter.features.includes(feature));
    if (missing.length) {
      const error = Error(platform + '용으로 아직 준비되지 않은 설정이 있습니다. 페이지를 새로고침해주세요.');
      error.unsupportedFeatures = missing;
      throw error;
    }
  }
  window.THEME_DESIGN = {ready, get spec() { return spec; }, normalize, snapshot, resolve, padding, assertSupport};
})();
