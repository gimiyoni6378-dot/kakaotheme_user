import importlib.util
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker


class WorkerHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        worker.TOKEN = 'test-capability'
        worker.EXPIRES = int(time.time() + 300)
        cls.tmp = tempfile.TemporaryDirectory()
        apk = Path(cls.tmp.name) / 'theme.apk'
        apk.write_bytes(b'test-apk')
        worker.JOBS['test'] = {'done': True, 'stage': '완료', 'error': None, 'apk': str(apk)}
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), worker.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()
        worker.JOBS.clear()

    def request(self, path, headers=None, data=None):
        req = urllib.request.Request(self.base + path, headers=headers or {}, data=data)
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as error:
            return error

    def test_status_requires_capability(self):
        with self.request('/status/test') as res:
            self.assertEqual(res.status, 401)

    def test_status_with_capability(self):
        with self.request('/status/test', {'Authorization': 'Bearer test-capability'}) as res:
            self.assertEqual(json.load(res)['stage'], '완료')

    def test_foreign_origin_rejected(self):
        with self.request('/status/test', {'Authorization': 'Bearer test-capability', 'Origin': 'https://other.example'}) as res:
            self.assertEqual(res.status, 403)

    def test_navigation_download_and_headers(self):
        with self.request('/download/test?token=test-capability') as res:
            self.assertEqual(res.read(), b'test-apk')
            self.assertEqual(res.headers['Content-Type'], 'application/vnd.android.package-archive')
            self.assertEqual(res.headers['Cache-Control'], 'no-store')
            self.assertIn('attachment', res.headers['Content-Disposition'])

    def test_expired_session_rejected(self):
        original = worker.EXPIRES
        worker.EXPIRES = 0
        try:
            with self.request('/download/test?token=test-capability') as res:
                self.assertEqual(res.status, 410)
        finally:
            worker.EXPIRES = original

    def test_session_only_accepts_one_build(self):
        with self.request('/build', {'Authorization': 'Bearer test-capability', 'Content-Type': 'application/zip'}, b'zip') as res:
            self.assertEqual(res.status, 429)

    def test_non_numeric_length_returns_bad_request(self):
        with self.request('/build', {'Authorization': 'Bearer test-capability', 'Content-Length': 'bad'}, b'zip') as res:
            self.assertEqual(res.status, 400)


if __name__ == '__main__':
    unittest.main()
