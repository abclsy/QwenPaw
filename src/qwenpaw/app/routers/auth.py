# -*- coding: utf-8 -*-
"""Authentication API endpoints."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ...constant import EnvVarLoader
from ..auth import (
    authenticate,
    create_token,
    has_registered_users,
    is_auth_enabled,
    register_user,
    revoke_all_tokens,
    revoke_token,
    update_credentials,
    verify_token,
)

# ── OAuth2 config for 中铁统一认证 ────────────────────────────────────────
# 详见文档《一体化工作平台入驻标准》第7章
_OAUTH_CLIENT_ID = EnvVarLoader.get_str("CREC_OAUTH_CLIENT_ID", "tyyfjsgk")
_OAUTH_CLIENT_SECRET = EnvVarLoader.get_str(
    "CREC_OAUTH_CLIENT_SECRET",
    "7d5ad42624cf439aab4d526fd9495030",
)
_OAUTH_BASE_URL = EnvVarLoader.get_str(
    "CREC_OAUTH_BASE_URL",
    "https://tyrz.crec.cn",
)
_OAUTH_TOKEN_URL = f"{_OAUTH_BASE_URL}/idp/oauth2/getToken"
_OAUTH_USERINFO_URL = f"{_OAUTH_BASE_URL}/idp/oauth2/getUserInfo"

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str
    expires_in: int | None = (
        None  # Token expiry in seconds, -1/0 for permanent
    )


class LoginResponse(BaseModel):
    token: str
    username: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    expires_in: int | None = (
        None  # Token expiry in seconds, -1/0 for permanent
    )


class AuthStatusResponse(BaseModel):
    enabled: bool
    has_users: bool
    oauth_enabled: bool = False


class OAuthLoginRequest(BaseModel):
    code: str
    redirect_uri: str
    expires_in: int | None = None



@router.post("/login")
async def login(req: LoginRequest):
    """Authenticate with username and password.

    Optional `expires_in` field:
    - Positive integer: token expires in N seconds
    - 0 or -1: permanent token (100 years)
    - None/omitted: default 7 days
    """
    if not is_auth_enabled():
        return LoginResponse(token="", username="")

    token = authenticate(req.username, req.password, req.expires_in)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return LoginResponse(token=token, username=req.username)


@router.post("/register")
async def register(req: RegisterRequest):
    """Register the single user account (only allowed once).

    Optional `expires_in` field:
    - Positive integer: token expires in N seconds
    - 0 or -1: permanent token (100 years)
    - None/omitted: default 7 days
    """
    env_flag = EnvVarLoader.get_str("QWENPAW_AUTH_ENABLED", "").strip().lower()
    if env_flag not in ("true", "1", "yes"):
        raise HTTPException(
            status_code=403,
            detail="Authentication is not enabled",
        )

    if has_registered_users():
        raise HTTPException(
            status_code=403,
            detail="User already registered",
        )

    if not req.username.strip() or not req.password.strip():
        raise HTTPException(
            status_code=400,
            detail="Username and password are required",
        )

    token = register_user(req.username.strip(), req.password, req.expires_in)
    if token is None:
        raise HTTPException(
            status_code=409,
            detail="Registration failed",
        )

    return LoginResponse(token=token, username=req.username.strip())


@router.get("/status")
async def auth_status():
    """Check if authentication is enabled and whether a user exists."""
    oauth_enabled = bool(_OAUTH_CLIENT_ID)
    return AuthStatusResponse(
        enabled=is_auth_enabled() or oauth_enabled,
        has_users=has_registered_users(),
        oauth_enabled=oauth_enabled,
    )


@router.post("/oauth/login")
async def oauth_login(req: OAuthLoginRequest):
    """OAuth2 统一认证登录 — 中铁 小铁智友.

    对接中铁一体化工作平台统一身份认证标准：
    1. POST /idp/oauth2/getToken 换取 access_token
    2. GET  /idp/oauth2/getUserInfo?access_token=...&client_id=...&uid=... 获取用户信息
    3. 生成内部 JWT token 返回
    """
    if not _OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="OAuth2 client_id is not configured",
        )
    if not _OAUTH_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="OAuth2 client_secret is not configured (set env CREC_OAUTH_CLIENT_SECRET)",
        )

    # ── Step 1: exchange code for access_token ──
    token_payload = {
        "grant_type": "authorization_code",
        "code": req.code,
        "redirect_uri": req.redirect_uri,
        "client_id": _OAUTH_CLIENT_ID,
        "client_secret": _OAUTH_CLIENT_SECRET,
    }

    async with httpx.AsyncClient(verify=False, timeout=30) as client:
        try:
            resp = await client.post(_OAUTH_TOKEN_URL, data=token_payload)
            resp.raise_for_status()
            token_data = resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to exchange code for token: {exc!s}",
            )

        # 中铁返回字段：access_token, expires_in, refresh_token, uid
        access_token = token_data.get("access_token")
        uid = token_data.get("uid")
        if not access_token or not uid:
            raise HTTPException(
                status_code=502,
                detail=f"OAuth server returned incomplete token data: {token_data}",
            )

        # ── Step 2: fetch user info ──
        # 中铁 getUserInfo 要求参数通过 URL query 传入，不是 Bearer header
        userinfo_params = {
            "access_token": access_token,
            "client_id": _OAUTH_CLIENT_ID,
            "uid": uid,
        }

        try:
            user_resp = await client.get(
                _OAUTH_USERINFO_URL,
                params=userinfo_params,
            )
            user_resp.raise_for_status()
            user_info = user_resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to fetch user info: {exc!s}",
            )

    # ── Step 3: generate internal JWT ──
    # 中铁用户信息字段：loginName 为登录名，uid 为唯一标识
    username = user_info.get("loginName") or user_info.get("uid")
    if not username:
        raise HTTPException(
            status_code=502,
            detail=f"OAuth user info missing loginName/uid fields: {user_info}",
        )

    token = create_token(str(username), req.expires_in)

    return LoginResponse(token=token, username=str(username))


@router.get("/verify")
async def verify(request: Request):
    """Verify that the caller's Bearer token is still valid."""
    # Check if any auth mechanism is enabled (local auth OR OAuth)
    oauth_enabled = bool(_OAUTH_CLIENT_ID)
    if not is_auth_enabled() and not oauth_enabled:
        return {"valid": True, "username": ""}

    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not token:
        # No token but auth is enabled — could be first visit
        return {"valid": True, "username": ""}

    username = verify_token(token)
    if username is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    return {"valid": True, "username": username}


class UpdateProfileRequest(BaseModel):
    current_password: str
    new_username: str | None = None
    new_password: str | None = None
    expires_in: int | None = (
        None  # Token expiry in seconds, -1/0 for permanent
    )


@router.post("/update-profile")
async def update_profile(req: UpdateProfileRequest, request: Request):
    """Update username and/or password for the authenticated user."""
    if not is_auth_enabled():
        raise HTTPException(
            status_code=403,
            detail="Authentication is not enabled",
        )

    if not has_registered_users():
        raise HTTPException(
            status_code=403,
            detail="No user registered",
        )

    # Verify caller is authenticated
    auth_header = request.headers.get("Authorization", "")
    caller_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not caller_token or verify_token(caller_token) is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not req.new_username and not req.new_password:
        raise HTTPException(
            status_code=400,
            detail="Nothing to update",
        )

    if req.new_username is not None and not req.new_username.strip():
        raise HTTPException(
            status_code=400,
            detail="Username cannot be empty",
        )

    if req.new_password is not None and not req.new_password.strip():
        raise HTTPException(
            status_code=400,
            detail="Password cannot be empty",
        )

    token = update_credentials(
        current_password=req.current_password,
        new_username=req.new_username,
        new_password=req.new_password,
        expiry_seconds=req.expires_in,
    )
    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Current password is incorrect",
        )

    username = req.new_username.strip() if req.new_username else ""
    return LoginResponse(token=token, username=username)


class RevokeTokenRequest(BaseModel):
    token: str | None = (
        None  # Optional: revoke specific token, or current if omitted
    )


@router.post("/revoke-token")
async def revoke_single_token(req: RevokeTokenRequest, request: Request):
    """Revoke a single token by adding it to the blacklist.

    If `token` is provided in the request body, revokes that token.
    If `token` is omitted, revokes the token used for authentication
    (current token).

    This allows you to:
    - Revoke a leaked token from another device
    - Logout from the current session
    """
    if not is_auth_enabled():
        raise HTTPException(
            status_code=403,
            detail="Authentication is not enabled",
        )

    # Get current token for authentication
    auth_header = request.headers.get("Authorization", "")
    caller_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not caller_token or verify_token(caller_token) is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Determine which token to revoke
    token_to_revoke = req.token if req.token else caller_token
    is_current_token = token_to_revoke == caller_token

    success = revoke_token(token_to_revoke)
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to revoke token",
        )

    message = (
        "Current token has been revoked. Please login again."
        if is_current_token
        else "Specified token has been revoked."
    )

    return {
        "message": message,
        "revoked": True,
        "revoked_current_token": is_current_token,
    }


@router.post("/revoke-all-tokens")
async def revoke_all_sessions(request: Request):
    """Revoke all existing tokens by rotating the JWT secret.

    This endpoint requires authentication. After calling this endpoint,
    all previously issued tokens will be invalidated, and you will need
    to login again to get a new token.

    This is more efficient than revoking tokens individually when you
    want to invalidate all sessions (e.g., password reset, security incident).
    """
    if not is_auth_enabled():
        raise HTTPException(
            status_code=403,
            detail="Authentication is not enabled",
        )

    # Verify caller is authenticated
    auth_header = request.headers.get("Authorization", "")
    caller_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not caller_token or verify_token(caller_token) is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    success = revoke_all_tokens()
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to revoke tokens",
        )

    return {
        "message": "All tokens have been revoked. Please login again.",
        "revoked": True,
    }
