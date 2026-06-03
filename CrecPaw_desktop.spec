# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

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

console_src = os.path.join(repo_root, 'src', 'qwenpaw', 'console')
if os.path.isdir(console_src):
    datas.append((console_src, 'qwenpaw/console'))

a = Analysis(
    ['crec_desktop.py'],
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
    console=False,
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

app = BUNDLE(
    coll,
    name='CrecPaw.app',
    icon=os.path.join(repo_root, 'CrecPaw.icns'),
    bundle_identifier='com.crec.crecpaw',
    info_plist={
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '12.0',
        'CFBundleName': 'CrecPaw',
        'CFBundleDisplayName': 'CrecPaw',
        'CFBundleShortVersionString': '1.0',
    },
)
