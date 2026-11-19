"""Build a self-contained Apple Silicon ZIP from Windows or macOS (Python 3)."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parent.parent
NODE_VERSION = 'v22.23.5'


def package():
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    output = ROOT / f'Consultorio-macOS-arm64-v{version}.zip'
    if output.exists():
        raise FileExistsError(f'El ZIP ya existe: {output}')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise RuntimeError('La máquina de desarrollo necesita npm para compilar.')
    subprocess.run([npm, 'run', 'build'], cwd=ROOT, check=True)
    with tempfile.TemporaryDirectory(prefix='consultorio-macos-') as temporary:
        work = Path(temporary)
        stage = work / 'Consultorio'
        stage.mkdir()
        for name in ('package.json', 'package-lock.json', 'README.md'):
            shutil.copy2(ROOT / name, stage / name)
        shutil.copytree(ROOT / 'backend/src', stage / 'backend/src')
        shutil.copytree(ROOT / 'frontend/dist', stage / 'frontend/dist')
        for name in ('Iniciar-Consultorio.command', 'LEEME-Mac.txt'):
            text = (ROOT / 'scripts' / name).read_text(encoding='utf-8')
            (stage / name).write_bytes(text.replace('\r\n', '\n').encode('utf-8'))
        subprocess.run([npm, 'ci', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], cwd=stage, check=True)
        archive = f'node-{NODE_VERSION}-darwin-arm64.tar.gz'
        origin = f'https://nodejs.org/dist/{NODE_VERSION}'
        print(f'Descargando Node.js {NODE_VERSION} para Mac ARM64...', flush=True)
        with urllib.request.urlopen(f'{origin}/SHASUMS256.txt', timeout=60) as response:
            checksums = dict((name.lstrip('*'), digest) for digest, name in
                             (line.split() for line in response.read().decode().splitlines() if line.strip()))
        download = work / archive
        with urllib.request.urlopen(f'{origin}/{archive}', timeout=120) as response, download.open('wb') as target:
            shutil.copyfileobj(response, target)
        actual_hash = hashlib.sha256(download.read_bytes()).hexdigest()
        if checksums.get(archive) != actual_hash:
            raise RuntimeError('El runtime no coincide con el SHA-256 oficial.')
        runtime = stage / 'runtime'
        runtime.mkdir()
        with tarfile.open(download, 'r:gz') as source:
            prefix = f'node-{NODE_VERSION}-darwin-arm64/'
            for member, destination in (('bin/node', 'node'), ('LICENSE', 'LICENSE')):
                entry = source.getmember(prefix + member)
                if not entry.isfile():
                    raise RuntimeError('Contenido inesperado en el runtime.')
                with source.extractfile(entry) as content:
                    (runtime / destination).write_bytes(content.read())
        # Verify the binary architecture and deployment target without running Mac code on Windows.
        binary = (runtime / 'node').read_bytes()
        magic, cpu, _, _, count = struct.unpack_from('<5I', binary)
        if magic != 0xFEEDFACF or cpu != 0x0100000C:
            raise RuntimeError('El ejecutable no es Mach-O ARM64.')
        offset = 32
        minimum = None
        for _ in range(count):
            command, size = struct.unpack_from('<2I', binary, offset)
            if command == 0x32:  # LC_BUILD_VERSION
                platform, minimum = struct.unpack_from('<2I', binary, offset + 8)
                if platform != 1:
                    raise RuntimeError('El ejecutable no es para macOS.')
            elif command == 0x24:  # LC_VERSION_MIN_MACOSX
                minimum = struct.unpack_from('<I', binary, offset + 8)[0]
            offset += size
        if minimum is None or minimum > (12 << 16 | 4 << 8):
            raise RuntimeError('El runtime no declara compatibilidad con macOS 12.4.')
        executable_paths = {'Consultorio/runtime/node', 'Consultorio/Iniciar-Consultorio.command'}
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
            for path in sorted(stage.rglob('*')):
                if not path.is_file():
                    continue
                name = path.relative_to(work).as_posix()
                if path.suffix in ('.node', '.dll', '.exe', '.sqlite', '.db') or '.sqlite-' in name:
                    raise RuntimeError(f'Archivo no permitido en el paquete: {name}')
                entry = zipfile.ZipInfo(name)
                entry.create_system = 3  # Preserve Unix execution bits when extracted by macOS.
                entry.external_attr = (stat.S_IFREG | (0o755 if name in executable_paths else 0o644)) << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                target.writestr(entry, path.read_bytes())
        with zipfile.ZipFile(output) as result:
            if result.testzip() is not None:
                raise RuntimeError('El ZIP está dañado.')
            for name in executable_paths:
                if not (result.getinfo(name).external_attr >> 16) & stat.S_IXUSR:
                    raise RuntimeError(f'Falta permiso de ejecución: {name}')
        print(f'Runtime verificado: ARM64, macOS mínimo {minimum >> 16}.{(minimum >> 8) & 255}')
        print(f'ZIP listo: {output} ({output.stat().st_size / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    package()
