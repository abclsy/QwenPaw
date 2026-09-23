# patch_fastmcp.py - 保存到项目根目录
import importlib.metadata

original_version = importlib.metadata.version

def patched_version(distribution_name):
    if distribution_name == 'fastmcp':
        return '1.0.0'  # mock 版本号
    return original_version(distribution_name)

importlib.metadata.version = patched_version