# -*- mode: python ; coding: utf-8 -*-
import os
import re

from PyInstaller.utils.hooks import collect_all

repo_root = SPECPATH

# Read the version from the package source so the bundle Info.plist
# always matches src/qwenpaw/__version__.py.
with open(os.path.join(repo_root, 'src', 'qwenpaw', '__version__.py')) as _vf:
    _app_version = re.search(
        r'__version__\s*=\s*["\']([^"\']+)', _vf.read()
    ).group(1)

datas = []
binaries = []
hiddenimports = [
    'qwenpaw.cli.main',
    'chromadb.telemetry.product.posthog',
    'chromadb.api.rust',
    'chromadb.api.rust_client',
    'chromadb.api.segment',
    'chromadb.api.segment_client',
    'modelscope',
    'modelscope.hub',
    'modelscope.hub.api',
    'modelscope.hub.snapshot_download',
]

tmp_ret = collect_all('qwenpaw')
# Filter out console data from the installed package — we use the local
# src/qwenpaw/console instead (the installed copy may be stale).
# collect_all returns (datas, binaries, hiddenimports) where datas is a
# list of (source_path, dest_dir) tuples.
tmp_datas = [
    (src, dst) for src, dst in tmp_ret[0]
    if not dst.replace('\\', '/').startswith('qwenpaw/console')
]
datas += tmp_datas; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
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
# Collect modelscope manually instead of collect_all to avoid importing
# torch (which causes OOM on 16GB machines). We only need hub submodule.
from PyInstaller.utils.hooks import collect_submodules as _cs
_modelscope_hidden = _cs('modelscope.hub') + _cs('modelscope.utils') + _cs('modelscope.metrics')
hiddenimports += _modelscope_hidden

def _add_dir_recursive(datas_list, src_dir, dst_prefix):
    """Recursively add all files in src_dir to datas_list."""
    for root, dirs, files in os.walk(src_dir):
        # Skip stale 'dist' subdirectory — the built files are at the
        # top level of console/, not in console/dist/
        dirs[:] = [d for d in dirs if d != 'dist']
        rel = os.path.relpath(root, src_dir)
        if rel == '.':
            dst_dir = dst_prefix
        else:
            dst_dir = os.path.join(dst_prefix, rel).replace('\\', '/')
        for f in files:
            datas_list.append((os.path.join(root, f), dst_dir))


console_src = os.path.join(repo_root, 'src', 'qwenpaw', 'console')
if os.path.isdir(console_src):
    _add_dir_recursive(datas, console_src, 'qwenpaw/console')

# Add local updater module (not in the installed package).
updater_src = os.path.join(repo_root, 'src', 'qwenpaw', 'updater')
if os.path.isdir(updater_src):
    _add_dir_recursive(datas, updater_src, 'qwenpaw/updater')
    hiddenimports.append('qwenpaw.updater')
    hiddenimports.append('qwenpaw.updater.api')
    hiddenimports.append('qwenpaw.updater.checker')
    hiddenimports.append('qwenpaw.updater.downloader')
    hiddenimports.append('qwenpaw.updater.applier')

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
    excludes=[
        # torch / transformers / onnxruntime 被 chromadb 间接拉入，但源码不直接使用
        # chromadb 会 fallback 到 local backend，功能不受影响
        'torch', 'torchvision', 'torchaudio',
        'transformers', 'tokenizers', 'safetensors',
        'onnxruntime',
        'tensorflow', 'tensorboard', 'keras',
        'numba', 'llvmlite',
        'matplotlib', 'matplotlib.pyplot',
        'PyQt5', 'PyQt6', 'PySide2', 'PySide6',
        'IPython', 'notebook', 'jupyter',
        'pytest', '_pytest',
        'win32com', 'win32api', 'win32clipboard',
        # modelscope 的数据文件不需要打包（只需要 hub 子模块的 Python 代码）
        'modelscope.models', 'modelscope.pipelines', 'modelscope.preprocessors',
        'modelscope.trainers', 'modelscope.exporters', 'modelscope.msdatasets',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Xiaotiezhiyou',
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
    name='Xiaotiezhiyou',
)

app = BUNDLE(
    coll,
    name='小铁智友.app',
    icon=os.path.join(repo_root, 'CrecPaw.icns'),
    bundle_identifier='com.crec.crecpaw',
    info_plist={
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '12.0',
        'CFBundleName': '小铁智友',
        'CFBundleDisplayName': '小铁智友',
        'CFBundleShortVersionString': _app_version,
    },
)
