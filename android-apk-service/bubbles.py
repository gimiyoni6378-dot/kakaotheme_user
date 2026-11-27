"""Validate theme settings and apply Android colors and package versions.

Only a validated design is accepted; uploaded XML or code is never executed.
"""
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

DESIGN_FILE = 'talktheme-bubbles.json'
BASE = 'src/main/theme/'
SPEC = json.loads(Path(__file__).with_name('theme-spec.json').read_text(encoding='utf-8'))


def parse_design(data):
    if len(data) > 1024:
        raise ValueError('말풍선 설정이 너무 큽니다.')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('중복 말풍선 설정입니다.')
            result[key] = value
        return result
    value = json.loads(data, object_pairs_hook=unique)
    if not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] != 2:
        raise ValueError('지원하지 않는 테마 설정입니다. 페이지를 새로고침해주세요.')
    if set(value) != {'version', 'specVersion', 'buildVersion', 'style', 'colors'}:
        raise ValueError('잘못된 공통 테마 설정입니다.')
    keys = {item['key'] for item in SPEC['colors']}
    colors = value['colors']
    if (type(value['specVersion']) is not int or value['specVersion'] != SPEC['version']
            or not isinstance(value['style'], str) or value['style'] not in SPEC['bubble']['styles']
            or type(value['buildVersion']) is not int or not 101 <= value['buildVersion'] <= 2100000000
            or not isinstance(colors, dict) or set(colors) != keys):
        raise ValueError('지원하지 않는 공통 테마 설정입니다. 페이지를 새로고침해주세요.')
    if any(not isinstance(c, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', c) for c in colors.values()):
        raise ValueError('잘못된 공통 테마 색상입니다.')
    return value


def apply_design(files, design):
    """Apply validated colors and versions; keep the uploaded official NinePatch paths."""
    colors = design['colors']
    for path, bindings in [(BASE + 'values/colors.xml', SPEC['android']['colors']),
                           ('src/main/res/values/colors.xml', SPEC['android']['appColors'])]:
        root = ET.fromstring(files[path])
        for item in root:
            value = bindings.get(item.get('name'))
            if value:
                item.text = colors[value.removeprefix('$')]
        files[path] = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    # Same-name downloads receive a new package version, instead of stale resources.
    gradle = files['build.gradle.kts'].decode('utf-8')
    revision = design['buildVersion']
    gradle, codes = re.subn(r'versionCode\s*=\s*\d+', f'versionCode = {revision}', gradle)
    gradle, names = re.subn(r'versionName\s*=\s*"[^"]+"',
                           f'versionName = "{SPEC["version"]}.0.{revision}"', gradle)
    if codes != 1 or names != 1:
        raise ValueError('공식 버전 설정 구성이 다릅니다.')
    files['build.gradle.kts'] = gradle.encode('utf-8')
    # Common exports keep the official .9.png resources. The browser puts
    # the very same raster body into the iOS PNG and the Android NinePatch.
