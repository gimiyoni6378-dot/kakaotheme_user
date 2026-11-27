const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'android-apk-service/theme-spec.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'theme-design.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

async function model() {
  const window = {};
  const context = vm.createContext({window, structuredClone, Date,
    fetch: async () => ({ok: true, json: async () => structuredClone(spec)})});
  vm.runInContext(source, context);
  await window.THEME_DESIGN.ready;
  return window.THEME_DESIGN;
}

test('common templates, six colors and role padding come from one specification', async () => {
  const m = await model();
  assert.deepEqual(Object.keys(m.spec.bubble.styles), ['square', 'rounded']);
  assert.equal(m.spec.colors.length, 6);
  assert.equal(m.padding('send'), '14px 17px 10px 11px');
  assert.equal(m.padding('receive', 'px', ['top', 'left', 'bottom', 'right']), '14px 17px 10px 11px');
  const input = {...spec.defaults, bg: '#aBcDeF', images: {chat: {data: 'test-photo', name: 'photo'}}};
  const snapshot = m.snapshot(input);
  assert.equal(snapshot.bg, '#ABCDEF');
  assert(snapshot.buildVersion >= 101 && snapshot.buildVersion <= 2100000000);
  assert(m.snapshot(input).buildVersion > snapshot.buildVersion);
  input.images.chat.data = 'changed-after-click';
  assert.equal(snapshot.images.chat.data, 'test-photo');
  for (const {key} of spec.colors) assert.equal(m.resolve('$' + key, snapshot), snapshot[key]);
});

test('legacy patterns migrate explicitly, while exports reject unsupported patterns', async () => {
  const m = await model();
  for (const bubbleStyle of ['dashed', 'wave', 'cloud', '__proto__']) {
    assert.equal(m.normalize({...spec.defaults, bubbleStyle}).bubbleStyle, 'rounded');
    assert.throws(() => m.snapshot({...spec.defaults, bubbleStyle}));
  }
  assert.throws(() => m.snapshot({...spec.defaults, ink: 'rgba(0,0,0,0)'}));
  assert.deepEqual(plain(m.normalize(null)), {...spec.defaults, images: {chat: null}});
});

test('iOS and Android adapters declare support independently before common features are enabled', async () => {
  const m = await model();
  const window = {};
  const context = vm.createContext({window});
  vm.runInContext(fs.readFileSync(path.join(root, 'ios-export.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'android-project.js'), 'utf8'), context);
  m.assertSupport('iOS', window.IOS_THEME_EXPORTER);
  m.assertSupport('Android', window.ANDROID_THEME_EXPORTER);
  const incomplete = {features: window.ANDROID_THEME_EXPORTER.features.filter(f => f !== 'chat.image')};
  assert.throws(() => m.assertSupport('Android', incomplete), error => {
    assert.deepEqual(plain(error.unsupportedFeatures), ['chat.image']);
    return true;
  });
  assert(!fs.readFileSync(path.join(root, 'ios-export.js'), 'utf8').includes('src/main/'));
  assert(!fs.readFileSync(path.join(root, 'android-project.js'), 'utf8').includes('KakaoTalkTheme.css'));
  assert.equal(m.padding('send', 'px', undefined, spec.bubble.strokeWidth), '13px 16px 9px 10px');
});
