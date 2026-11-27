import io
import sys
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project import TEMPLATE, prepare_project


class ProjectValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        with zipfile.ZipFile(TEMPLATE) as archive:
            self.files = {n: archive.read(n) for n in archive.namelist()}
        self.files['build.gradle.kts'] = self.files['build.gradle.kts'].replace(
            b'com.kakao.talk.theme.template', b'com.talktheme.studio.test123')

    def tearDown(self):
        self.tmp.cleanup()

    def prepare(self, duplicate=False):
        archive = self.root / 'input.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            for name, data in self.files.items():
                output.writestr(name, data)
            if duplicate:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    output.writestr('gradlew', self.files['gradlew'])
        return prepare_project(archive, self.root / 'project')

    def test_official_project_accepts_new_application_id(self):
        self.assertEqual(self.prepare(), 'com.talktheme.studio.test123')
        self.assertIn(b'namespace = "com.kakao.talk.theme.apeach"',
                      (self.root / 'project/build.gradle.kts').read_bytes())

    def test_gradle_injection_rejected_before_any_write(self):
        self.files['build.gradle.kts'] += b'\nprintln("untrusted")'
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse((self.root / 'project').exists())

    def test_wrapper_changes_rejected(self):
        self.files['gradlew'] = b'#!/bin/sh\nexit 0'
        with self.assertRaises(ValueError):
            self.prepare()

    def test_manifest_permission_injection_rejected(self):
        self.files['src/main/AndroidManifest.xml'] += b'<uses-permission/>'
        with self.assertRaises(ValueError):
            self.prepare()

    def test_path_traversal_rejected(self):
        self.files['../escape'] = b'evil'
        with self.assertRaises(ValueError):
            self.prepare()

    def test_duplicate_paths_rejected(self):
        with self.assertRaises(ValueError):
            self.prepare(duplicate=True)

    def test_invalid_color_reference_rejected(self):
        name = 'src/main/theme/values/colors.xml'
        self.files[name] = self.files[name].replace(b'#664242', b'@string/app_name')
        with self.assertRaises(ValueError):
            self.prepare()

    def test_xml_entity_rejected(self):
        name = 'src/main/theme/values/strings.xml'
        self.files[name] = b'<!DOCTYPE resources [<!ENTITY x "bad">]><resources/>'
        with self.assertRaises(ValueError):
            self.prepare()

    def test_png_dimensions_rejected(self):
        name = next(n for n in self.files if n.endswith('.png'))
        data = bytearray(self.files[name])
        data[16:20] = (999999).to_bytes(4, 'big')
        self.files[name] = bytes(data)
        with self.assertRaises(ValueError):
            self.prepare()


if __name__ == '__main__':
    unittest.main()
