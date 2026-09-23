# -*- coding: utf-8 -*-
"""Context variable for agent workspace directory.

This module provides a context variable to pass the agent's workspace
directory to tool functions, allowing them to resolve relative paths
correctly in a multi-agent environment.
"""
from contextvars import ContextVar
from pathlib import Path

# Context variable to store the current agent's workspace directory
current_workspace_dir: ContextVar[Path | None] = ContextVar(
    "current_workspace_dir",
    default=None,
)


def get_current_workspace_dir() -> Path | None:
    """Get the current agent's workspace directory from context.

    Returns:
        Path to the current agent's workspace directory, or None if not set.
    """
    return current_workspace_dir.get()


def set_current_workspace_dir(workspace_dir: Path | None) -> None:
    """Set the current agent's workspace directory in context.

    Args:
        workspace_dir: Path to the agent's workspace directory.
    """
    current_workspace_dir.set(workspace_dir)


# Context variable to store the user-selected output directory.
# When set, file tools (write_file, send_file_to_user, etc.) resolve
# relative paths from this directory instead of the agent workspace dir.
current_user_output_dir: ContextVar[Path | None] = ContextVar(
    "current_user_output_dir",
    default=None,
)


def get_current_user_output_dir() -> Path | None:
    """Get the user-selected output directory from context.

    Returns:
        Path to the user-selected output directory, or None if not set.
    """
    return current_user_output_dir.get()


def set_current_user_output_dir(output_dir: Path | None) -> None:
    """Set the user-selected output directory in context.

    Args:
        output_dir: Path to the user-selected output directory.
    """
    current_user_output_dir.set(output_dir)


# Context variable to store the recent_max_bytes limit
current_recent_max_bytes: ContextVar[int | None] = ContextVar(
    "current_recent_max_bytes",
    default=None,
)


def get_current_recent_max_bytes() -> int | None:
    """Get the current agent's recent_max_bytes limit from context.

    Returns:
        Byte limit for recent tool output truncation, or None if not set.
    """
    return current_recent_max_bytes.get()


def set_current_recent_max_bytes(max_bytes: int | None) -> None:
    """Set the current agent's recent_max_bytes limit in context.

    Args:
        max_bytes: Byte limit for recent tool output truncation.
    """
    current_recent_max_bytes.set(max_bytes)


# Context variable to store the configured shell command timeout
current_shell_command_timeout: ContextVar[float | None] = ContextVar(
    "current_shell_command_timeout",
    default=None,
)


def get_current_shell_command_timeout() -> float | None:
    """Get the configured default timeout for execute_shell_command.

    Returns:
        Timeout in seconds, or None if not configured.
    """
    return current_shell_command_timeout.get()


def set_current_shell_command_timeout(timeout: float | None) -> None:
    """Set the configured default timeout for execute_shell_command.

    Args:
        timeout: Timeout in seconds.
    """
    current_shell_command_timeout.set(timeout)
