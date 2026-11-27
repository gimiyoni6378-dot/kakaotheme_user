import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bubbles import DESIGN_FILE, SPEC, parse_design
from project import TEMPLATE, prepare_project

class BubbleResourcesTests(unittest.TestCase):
    def design(self, style):
        return dict(version=2, specVersion=SPEC['version'], buildVersion=1795750000, style=style,
                    colors={item['key']: '#123456' for item in SPEC['colors']})

    def test_retired_protocol_rejected_before_any_project_write(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / 'project.zip'
            with zipfile.ZipFile(TEMPLATE) as source, zipfile.ZipFile(archive, 'w') as out:
                for name in source.namelist():
                    data = source.read(name)
                    if name == 'build.gradle.kts':
                        data = data.replace(b'com.kakao.talk.theme.template', b'com.talktheme.studio.test123')
                    out.writestr(name, data)
                out.writestr(DESIGN_FILE, json.dumps(dict(version=1, style='dashed',
                    send='#123456', receive='#abcdef', border='#789012')))
            project = root / 'project'
            with self.assertRaisesRegex(ValueError, '새로고침'):
                prepare_project(archive, project)
            self.assertFalse(project.exists())

    def test_untrusted_design_rejected(self):
        cases = [b'{}', b'{"version":1,"version":1}', b'[]', b'x' * 1025]
        for key, value in [('style', 'xml'), ('colors', {'send': '@drawable/private'}),
                           ('colors', {item['key']: '#00123456' for item in SPEC['colors']}), ('version', True)]:
            bad = self.design('rounded'); bad[key] = value
            cases.append(json.dumps(bad).encode())
        for data in cases:
            with self.subTest(data=data[:100]), self.assertRaises((ValueError, TypeError)):
                parse_design(data)

    def test_common_design_rejects_patterns_and_invalid_revision(self):
        design = dict(version=2, specVersion=SPEC['version'], buildVersion=1795750000, style='rounded',
                      colors={item['key']: '#123456' for item in SPEC['colors']})
        self.assertEqual(parse_design(json.dumps(design).encode())['colors']['send'], '#123456')
        for field, value in [('style', 'dashed'), ('style', 'wave'), ('style', []),
                             ('buildVersion', True), ('buildVersion', 2100000001), ('specVersion', 999)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                parse_design(json.dumps({**design, field: value}).encode())

    def test_common_snapshot_controls_colors_version_and_preserves_official_ninepatches(self):
        from bubbles import apply_design
        from project import xml_values
        colors = dict(bg='#E8F4F8', main='#FAF2DE', accent='#B13A60', send='#C6E6BC', receive='#FFE1C6', ink='#24364A')
        for style in SPEC['bubble']['styles']:
            with self.subTest(style=style), zipfile.ZipFile(TEMPLATE) as source:
                files = {n: source.read(n) for n in source.namelist()}
                design = parse_design(json.dumps(dict(version=2, specVersion=SPEC['version'],
                    buildVersion=1795750000, style=style, colors=colors)).encode())
                apply_design(files, design)
                actual = xml_values(files['src/main/theme/values/colors.xml'], 'color')
                for key, binding in SPEC['android']['colors'].items():
                    self.assertEqual(actual[key], colors[binding.removeprefix('$')])
                self.assertIn(b'versionCode = 1795750000', files['build.gradle.kts'])
                self.assertIn(b'versionName = "1.0.1795750000"', files['build.gradle.kts'])
                for role in ('me', 'you'):
                    for sequence in ('01', '02'):
                        image=f'src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_{role}_{sequence}_image.9.png'
                        self.assertIn(image, files)
                        self.assertEqual(files[image], source.read(image))
                        self.assertNotIn(f'src/main/theme/drawable/theme_chatroom_bubble_{role}_{sequence}_image.xml', files)


if __name__ == '__main__':
    unittest.main()
