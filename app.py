# app.py - 修改后的完整版本
import patch_fastmcp  # 必须在最开头！

import sys
import os
import logging
import socket
from datetime import datetime

# 配置日志
log_file = os.path.join(os.path.expanduser("~"), "Desktop", "qwenpaw_debug.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return False
        except socket.error:
            return True

def find_free_port(start_port=8088):
    port = start_port
    while is_port_in_use(port) and port < start_port + 100:
        port += 1
    return port

def main():
    logging.info("=== QwenPaw Launcher Started ===")
    
    if is_port_in_use(8088):
        free_port = find_free_port(8089)
        logging.info(f"Port 8088 busy, using port {free_port}")
        os.environ["QWENPAW_PORT"] = str(free_port)
    
    try:
        from qwenpaw.cli.main import cli
        sys.argv = ["qwenpaw", "app"]
        logging.info("Starting QwenPaw...")
        cli()
    except Exception as e:
        logging.error(f"Failed: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")

if __name__ == "__main__":
    if os.environ.get("QWENPAW_ALREADY_RUNNING") == "1":
        sys.exit(0)
    os.environ["QWENPAW_ALREADY_RUNNING"] = "1"
    main()