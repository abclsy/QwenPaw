import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Form, Input } from "antd";
import { useAppMessage } from "../../hooks/useAppMessage";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { authApi } from "../../api/modules/auth";
import { setAuthToken } from "../../api/config";
import { useTheme } from "../../contexts/ThemeContext";

// ── 中铁统一认证 OAuth2 配置 ─────────────────────────────────────────
const CREC_OAUTH_CLIENT_ID = "tyyfjsgk";
const CREC_OAUTH_AUTHORIZE_URL =
  "https://tyrz.crec.cn/idp/oauth2/authorize";

function getOAuthRedirectUri(): string {
  // 去掉当前 URL 中的 code / state 等 OAuth 回调参数
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  return url.toString();
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [showLocalLogin, setShowLocalLogin] = useState(false);
  const { message } = useAppMessage();

  // ── OAuth 回调处理：进入页面时若 URL 中有 code，自动登录 ──
  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      setOauthLoading(true);
      handleOAuthLogin(code);
      return;
    }

    authApi
      .getStatus()
      .then((res) => {
        if (!res.enabled && !res.oauth_enabled) {
          navigate("/chat", { replace: true });
          return;
        }
        setHasUsers(res.has_users);
        setOauthEnabled(res.oauth_enabled);
        if (!res.has_users && !res.oauth_enabled) {
          setIsRegister(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchParams]);

  const handleOAuthLogin = useCallback(async (code: string) => {
    try {
      const redirectUri = getOAuthRedirectUri();
      const res = await authApi.oauthLogin(code, redirectUri);
      if (res.token) {
        setAuthToken(res.token);
        message.success(t("login.success"));
        // 清理 URL 中的 code
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.toString());
        navigate("/chat", { replace: true });
      }
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : t("login.failed"),
      );
    } finally {
      setOauthLoading(false);
    }
  }, [message, navigate, t]);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const raw = searchParams.get("redirect") || "/chat";
      const redirect =
        raw.startsWith("/") && !raw.startsWith("//") ? raw : "/chat";

      if (isRegister) {
        const res = await authApi.register(values.username, values.password);
        if (res.token) {
          setAuthToken(res.token);
          message.success(t("login.registerSuccess"));
          navigate(redirect, { replace: true });
        }
      } else {
        const res = await authApi.login(values.username, values.password);
        if (res.token) {
          setAuthToken(res.token);
          navigate(redirect, { replace: true });
        } else {
          message.info(t("login.authNotEnabled"));
          navigate(redirect, { replace: true });
        }
      }
    } catch (err) {
      message.error(
        isRegister
          ? err instanceof Error
            ? err.message
            : t("login.registerFailed")
          : t("login.failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  // ── 跳转到中铁统一认证 ──
  const handleCrecOAuth = () => {
    const redirect = getOAuthRedirectUri();
    const authUrl =
      `${CREC_OAUTH_AUTHORIZE_URL}?client_id=${CREC_OAUTH_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_type=code`;
    window.location.href = authUrl;
  };

  // OAuth 回调中 —— 只显示 loading，隐藏表单
  if (oauthLoading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark
            ? "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)"
            : "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <img
            src="/logo.svg"
            alt="CrecPaw"
            style={{ height: 48, marginBottom: 16 }}
          />
          <p style={{ color: isDark ? "rgba(255,255,255,0.65)" : "#333" }}>
            {t("login.oauthProcessing") || "正在通过统一认证登录..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)"
          : "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      <div
        style={{
          width: 400,
          padding: 32,
          borderRadius: 12,
          background: isDark ? "#1f1f1f" : "#fff",
          boxShadow: isDark
            ? "0 4px 24px rgba(0,0,0,0.4)"
            : "0 4px 24px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src="/logo.svg"
            alt="CrecPaw"
            style={{ height: 48, marginBottom: 12 }}
          />
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: 20 }}>
            {isRegister ? t("login.registerTitle") : t("login.title")}
          </h2>
          {!hasUsers && !oauthEnabled && (
            <p
              style={{
                margin: "8px 0 0",
                color: isDark ? "rgba(255,255,255,0.45)" : "#666",
                fontSize: 13,
              }}
            >
              {t("login.firstUserHint")}
            </p>
          )}
        </div>

        {/* ── 中铁统一认证登录按钮 ── */}
        {oauthEnabled && (
          <Button
            type="primary"
            block
            size="large"
            onClick={handleCrecOAuth}
            style={{
              height: 44,
              borderRadius: 8,
              fontWeight: 500,
              background: "#1961AC",
              borderColor: "#1961AC",
              marginBottom: showLocalLogin ? 24 : 0,
            }}
          >
            {t("login.crecOAuth") || "中铁统一认证登录"}
          </Button>
        )}

        {/* ── 本地登录表单（OAuth 模式下默认折叠）── */}
        {(!oauthEnabled || showLocalLogin) && (
          <Form
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: t("login.usernameRequired") }]}
            >
              <Input
                prefix={
                  <UserOutlined
                    style={{
                      color: isDark ? "rgba(255,255,255,0.45)" : undefined,
                    }}
                  />
                }
                placeholder={t("login.usernamePlaceholder")}
                autoFocus
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: t("login.passwordRequired") }]}
            >
              <Input.Password
                prefix={
                  <LockOutlined
                    style={{
                      color: isDark ? "rgba(255,255,255,0.45)" : undefined,
                    }}
                  />
                }
                placeholder={t("login.passwordPlaceholder")}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{ height: 44, borderRadius: 8, fontWeight: 500 }}
              >
                {isRegister ? t("login.register") : t("login.submit")}
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* 管理员本地入口 —— OAuth 模式下折叠显示 */}
        {oauthEnabled && !showLocalLogin && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <a
              onClick={() => setShowLocalLogin(true)}
              style={{
                color: isDark ? "rgba(255,255,255,0.35)" : "#999",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("login.localAdmin") || "管理员本地登录"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
