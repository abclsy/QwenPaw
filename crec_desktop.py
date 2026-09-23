# crec_desktop.py - 小铁智友 桌面版入口（PyInstaller 专用）
# 双重模式：
#   1. 无参数 / desktop → 启动 qwenpaw desktop
#   2. 含 app → 子进程模式，启动 qwenpaw app（供 desktop 内部用）
import patch_fastmcp  # 必须在最开头
import multiprocessing
import os
import sys

# PyInstaller frozen apps using multiprocessing.spawn MUST call
# freeze_support() before anything else runs. Without it, child
# processes crash silently on re-import, which is the root cause of
# "Download process exited unexpectedly" errors for llama.cpp downloads.
multiprocessing.freeze_support()


def main():
    os.environ["QWENPAW_DESKTOP_APP"] = "1"
    from qwenpaw.cli.main import cli

    args = sys.argv[1:]

    if "app" in args:
        # 子进程模式：过滤掉 PyInstaller 不认识的 -m qwenpaw
        clean_args = [a for a in args if a not in ("-m", "qwenpaw")]
        sys.argv = ["qwenpaw"] + clean_args
    else:
        # 桌面模式
        sys.argv = ["qwenpaw", "desktop"] + args

    cli()


if __name__ == "__main__":
    main()
