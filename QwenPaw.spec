# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

# Project root (where this .spec file lives)
repo_root = SPECPATH

datas = []
binaries = []
hiddenimports = [
    'qwenpaw.cli.main',
    'chromadb.telemetry.product.posthog',
    'chromadb.api.rust',
    'chromadb.api.rust_client',
    'chromadb.api.segment',
    'chromadb.api.segment_client',
]

# Collect Python packages
tmp_ret = collect_all('qwenpaw')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('chromadb')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('fastmcp')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('reme')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('uvicorn')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('fastapi')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Explicitly include console frontend assets (editable install may miss these)
console_src = os.path.join(repo_root, 'src', 'qwenpaw', 'console')
if os.path.isdir(console_src):
    datas.append((console_src, 'qwenpaw/console'))

a = Analysis(
    ['app.py'],
    pathex=[
        repo_root,
        os.path.join(repo_root, 'src'),
    ],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CrecPaw',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CrecPaw',
)
