"""Accept only resource edits to the bundled, trusted Android project."""
import re
import stat
import struct
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from bubbles import DESIGN_FILE, parse_design, apply_design

TEMPLATE = Path(__file__).with_name('template.zip')
MAX_UPLOAD = 10 * 1024 * 1024
MAX_EXPANDED = 24 * 1024 * 1024
PACKAGE = re.compile(r'com\.talktheme\.studio\.[a-z][a-z0-9]{0,31}')


def xml_values(data, tag):
    if len(data) > 32_000:
        raise ValueError('XML 파일이 너무 큽니다.')
    if b'<!' in data.replace(b'<!--', b''):
        # Template colors contain comments; ElementTree ignores them.
        cleaned = re.sub(rb'<!--.*?-->', b'', data, flags=re.S)
        if b'<!' in cleaned:
            raise ValueError('XML 선언은 허용되지 않습니다.')
    root = ET.fromstring(data)
    if root.tag != 'resources' or root.attrib:
        raise ValueError('잘못된 테마 XML입니다.')
    values = {}
    for item in root:
        if item.tag != tag or set(item.attrib) != {'name'} or len(item):
            raise ValueError('허용되지 않은 리소스입니다.')
        name = item.attrib['name']
        if name in values:
            raise ValueError('중복 리소스입니다.')
        values[name] = item.text or ''
    return values


def validate_resource(name, data, original):
    if name.endswith('.png') and name.startswith(('src/main/theme/', 'src/main/res/mipmap-')):
        if len(data) < 33 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
            raise ValueError('PNG 이미지가 올바르지 않습니다.')
        if data[16:24] != original[16:24]:
            raise ValueError('샘플과 이미지 크기가 다릅니다.')
        width, height = struct.unpack('>II', data[16:24])
        if width * height > 16_000_000:
            raise ValueError('이미지가 너무 큽니다.')
        return
    if re.fullmatch(r'src/main/theme/values(?:-[^/]+)?/strings.xml', name):
        values = xml_values(data, 'string')
        expected = xml_values(original, 'string')
        if values.keys() != expected.keys() or any(len(v) > 200 for v in values.values()):
            raise ValueError('잘못된 테마 이름입니다.')
        return
    if name in ('src/main/theme/values/colors.xml', 'src/main/res/values/colors.xml'):
        values = xml_values(data, 'color')
        expected = xml_values(original, 'color')
        if values.keys() != expected.keys() or any(not re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?', v.strip()) for v in values.values()):
            raise ValueError('잘못된 색상입니다.')
        return
    if data != original:
        raise ValueError('테마 빌드 코드 변경은 허용되지 않습니다: ' + name)


def prepare_project(archive_path, workdir):
    with zipfile.ZipFile(TEMPLATE) as template, zipfile.ZipFile(archive_path) as uploaded:
        infos = uploaded.infolist()
        names = [i.filename for i in infos]
        expected = set(template.namelist())
        if DESIGN_FILE in names:
            expected.add(DESIGN_FILE)
        if len(infos) != len(set(names)) or set(names) != expected:
            raise ValueError('공식 템플릿과 파일 구성이 다릅니다.')
        if sum(i.file_size for i in infos) > MAX_EXPANDED:
            raise ValueError('프로젝트 크기가 허용 범위를 넘었습니다.')
        # Validate everything before writing anything. Never extract user paths.
        files = {}
        package_id = None
        for info in infos:
            name = info.filename
            if info.is_dir() or name.startswith('/') or '\\' in name or '..' in Path(name).parts or stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError('잘못된 프로젝트 경로입니다.')
            if info.file_size > MAX_UPLOAD:
                raise ValueError('파일이 너무 큽니다.')
            data = uploaded.read(info)
            if name == DESIGN_FILE:
                design = parse_design(data)
                continue
            original = template.read(name)
            if name == 'build.gradle.kts':
                text = data.decode('utf-8')
                match = re.search(r'applicationId = "([^"]+)"', text)
                if not match or not PACKAGE.fullmatch(match[1]):
                    raise ValueError('잘못된 패키지 이름입니다.')
                package_id = match[1]
                trusted = re.sub(r'applicationId = "[^"]+"', 'applicationId = "' + package_id + '"', original.decode('utf-8'))
                if text != trusted:
                    raise ValueError('Gradle 코드 변경은 허용되지 않습니다.')
            else:
                validate_resource(name, data, original)
            files[name] = data
        if DESIGN_FILE in names:
            apply_design(files, design)
        workdir.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            destination = workdir / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        return package_id
