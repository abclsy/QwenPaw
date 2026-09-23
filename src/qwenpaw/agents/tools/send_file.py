# -*- coding: utf-8 -*-
# flake8: noqa: E501
# pylint: disable=line-too-long,too-many-return-statements
import os
import mimetypes
import unicodedata
from urllib.parse import quote

from agentscope.tool import ToolResponse
from agentscope.message import (
    TextBlock,
    ImageBlock,
    AudioBlock,
    VideoBlock,
)

from ..schema import FileBlock
from .file_io import _resolve_file_path


def _path_to_api_url(path: str) -> str:
    """Convert a local file path to a relative API preview URL.

    Works cross-platform: returns an API endpoint URL that the browser
    can fetch to preview/download the file.

    Examples:
        /Users/xxx/output/doc.html  →  /api/files/preview/Users/xxx/output/doc.html
        C:\\temp\\file.pdf           →  /api/files/preview/C:/temp/file.pdf
    """
    # Normalize to absolute path
    abs_path = os.path.abspath(path)

    # Convert backslashes to forward slashes (Windows)
    if os.name == "nt":
        abs_path = abs_path.replace("\\", "/")

    # Percent-encode non-ASCII and special characters except common safe chars.
    encoded = quote(abs_path, safe="/:@")

    return f"/api/files/preview/{encoded}"


def _auto_as_type(mt: str) -> str:
    if mt.startswith("image/"):
        return "image"
    if mt.startswith("audio/"):
        return "audio"
    if mt.startswith("video/"):
        return "video"
    return "file"


async def send_file_to_user(
    file_path: str,
) -> ToolResponse:
    """Send a file to the user.

    Args:
        file_path (`str`):
            Path to the file to send.

    Returns:
        `ToolResponse`:
            The tool response containing the file or an error message.
    """

    # Normalize the path: expand ~ and fix Unicode normalization differences
    # (e.g. macOS stores filenames as NFD but paths from the LLM arrive as NFC,
    # causing os.path.exists to return False for files that do exist).
    file_path = os.path.expanduser(unicodedata.normalize("NFC", file_path))

    # Resolve relative paths to absolute paths based on workspace directory
    file_path = _resolve_file_path(file_path)

    if not os.path.exists(file_path):
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Error: The file {file_path} does not exist.",
                ),
            ],
        )

    if not os.path.isfile(file_path):
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Error: The path {file_path} is not a file.",
                ),
            ],
        )

    # Detect MIME type
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        # Default to application/octet-stream for unknown types
        mime_type = "application/octet-stream"
    as_type = _auto_as_type(mime_type)

    try:
        # Use API-relative URL so the browser/WKWebView can render HTML inline
        # via the /api/files/preview/ endpoint.  Non-HTML files will trigger
        # a download through the same endpoint (Content-Disposition: attachment).
        file_url = _path_to_api_url(file_path)
        source = {"type": "url", "url": file_url}

        if as_type == "image":
            return ToolResponse(
                content=[
                    ImageBlock(type="image", source=source),
                    TextBlock(type="text", text="File sent successfully."),
                ],
            )
        if as_type == "audio":
            return ToolResponse(
                content=[
                    AudioBlock(type="audio", source=source),
                    TextBlock(type="text", text="File sent successfully."),
                ],
            )
        if as_type == "video":
            return ToolResponse(
                content=[
                    VideoBlock(type="video", source=source),
                    TextBlock(type="text", text="File sent successfully."),
                ],
            )

        basename = os.path.basename(file_path)
        is_html = basename.lower().endswith((".html", ".htm"))

        if is_html:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=(
                            f"✅ HTML 文件已生成：**{basename}**\n"
                            f"预览链接：{file_url}"
                        ),
                    ),
                    FileBlock(
                        type="file",
                        source=source,
                        filename=basename,
                    ),
                    TextBlock(
                        type="text",
                        text="> 预览后点击页面顶部的「← 返回」回到对话",
                    ),
                ],
            )

        return ToolResponse(
            content=[
                FileBlock(
                    type="file",
                    source=source,
                    filename=basename,
                ),
                TextBlock(type="text", text="File sent successfully."),
            ],
        )

    except Exception as e:
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=f"Error: Send file failed due to \n{e}",
                ),
            ],
        )
