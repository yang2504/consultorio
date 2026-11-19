"""Smoke-check the native ARM64 app ZIP on a macOS ARM64 runner."""
import contextlib
import json
from pathlib import Path
import plistlib
import re
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile


archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='consultorio-app-check-') as temporary:
    work = Path(temporary)
    with zipfile.ZipFile(archive) as source:
        assert source.testzip() is None
        assert not any(re.search(r'\.(sqlite|db)(-|$)', name) for name in source.namelist())
        source.extractall(work)
        for entry in source.infolist():
            (work / entry.filename).chmod((entry.external_attr >> 16) & 0o777)
    bundle = work / 'Consultorio/Consultorio.app'
    metadata = plistlib.loads((bundle / 'Contents/Info.plist').read_bytes())
    assert metadata['LSMinimumSystemVersion'] == '12.4'
    executable = bundle / 'Contents/MacOS' / metadata['CFBundleExecutable']
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(bundle)], check=True)
    subprocess.run([str(executable), '--version'], check=True)
    root = bundle / 'Contents/Resources/app'
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    database = work / 'data/consultorio.sqlite'
    import os
    setup_code = 'ab' * 16
    environment = {**os.environ, 'CONSULTORIO_PORT': str(port), 'CONSULTORIO_DB': str(database), 'CONSULTORIO_SETUP_CODE': setup_code}
    process = subprocess.Popen([str(root / 'runtime/node'), str(root / 'backend/src/server.js'), '--desktop'], env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        address = f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:
                with urllib.request.urlopen(address + '/api/session', timeout=1) as response:
                    session = json.load(response)
                break
            except OSError:
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode())
                time.sleep(0.1)
        else:
            raise RuntimeError('El runtime ARM64 no arranco.')
        assert session == {'user': None, 'needsSetup': True, 'demo': False}, session
        with contextlib.closing(sqlite3.connect(database)) as connection:
            for table in ('staff', 'patients', 'appointments', 'entries'):
                assert connection.execute(f'SELECT count(*) FROM {table}').fetchone()[0] == 0
        with urllib.request.urlopen(address + '/', timeout=2) as response:
            assert response.status == 200
        body = json.dumps({'code': setup_code, 'name': 'Prueba', 'username': 'prueba', 'password': 'Abc12345'}).encode()
        request = urllib.request.Request(address + '/api/setup', data=body, headers={'Content-Type': 'application/json', 'X-Consultorio': 'local'})
        with urllib.request.urlopen(request, timeout=3) as response:
            assert json.load(response)['user']['username'] == 'PRUEBA'
    finally:
        process.terminate()
        stdout, stderr = process.communicate(timeout=15)
        assert process.returncode == 0, stderr.decode()
    with contextlib.closing(sqlite3.connect(database)) as connection:
        assert connection.execute('SELECT username FROM staff').fetchone()[0] == 'PRUEBA'
    print('OK: firma ad-hoc intacta al extraer, ejecutable ARM64, Node ARM64, base vacia, configuracion inicial, interfaz, apagado limpio y datos persistidos.')
