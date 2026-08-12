import {
  Layout,
  Menu,
  Tooltip,
  Select,
  Dropdown,
  type MenuProps,
} from "antd";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "../hooks/useAppMessage";
import AgentSelector from "../components/AgentSelector";
import {
  SparkChatTabFill,
  SparkWifiLine,
  SparkUserGroupLine,
  SparkDateLine,
  SparkVoiceChat01Line,
  SparkMagicWandLine,
  SparkLocalFileLine,
  SparkModePlazaLine,
  // SparkInternetLine removed — environments module hidden
  SparkModifyLine,
  SparkBrowseLine,
  SparkMcpMcpLine,
  // SparkScanLine removed — ACP module hidden
  SparkToolLine,
  SparkDataLine,
  SparkMicLine,
  SparkAgentLine,
  SparkOtherLine,
  SparkBarChartLine,
  SparkDebugLine,
  // SparkSaveLine removed — backups module hidden
} from "@agentscope-ai/icons";
import { getAuthUsername, setAuthUsername, getApiUrl } from "../api/config";
import { authApi } from "../api/modules/auth";
import { usePlugins } from "../plugins/PluginContext";
import styles from "./index.module.less";
import { useTheme } from "../contexts/ThemeContext";
import { KEY_TO_PATH, DEFAULT_OPEN_KEYS } from "./constants";
import { UpdateModal } from "../components/UpdateModal";
import { updateApi, type UpdateState } from "../api/modules/update";
import {
  LogoutOutlined,
  SyncOutlined,
  SkinOutlined,
  CheckCircleOutlined,
  LinkOutlined,
} from "@ant-design/icons";

// ── Layout ────────────────────────────────────────────────────────────────

const { Sider } = Layout;

// ── Types ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  selectedKey: string;
}

// ── Helper: open external link (pywebview compatible) ─────────────────────

function openExternalLink(url: string): void {
  const pywebview = (window as any).pywebview;
  if (pywebview?.api?.open_external_link) {
    pywebview.api.open_external_link(url);
  } else {
    window.open(url, "_blank");
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar({ selectedKey }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { message: _msg } = useAppMessage();
  const { isDark, themeMode, setThemeMode } = useTheme();
  const { pluginRoutes } = usePlugins();
  const [authEnabled, setAuthEnabled] = useState(false);
  const collapsed = false;
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [username, setUsername] = useState(
    getAuthUsername() || t("nav.guest", "用户"),
  );

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    authApi
      .getStatus()
      .then((res) => setAuthEnabled(res.enabled))
      .catch(() => {});
  }, []);

  // Fetch username from /auth/verify on mount — handles case where
  // localStorage has token but username hasn't been stored yet
  useEffect(() => {
    const token = localStorage.getItem("qwenpaw_auth_token");
    if (!token) return;
    fetch(getApiUrl("/auth/verify"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.username) {
          setAuthUsername(data.username);
          setUsername(data.username);
        }
      })
      .catch(() => {});
  }, []);

  // Check for updates on startup
  useEffect(() => {
    updateApi
      .check()
      .then((state: UpdateState) => {
        setHasUpdate(state.has_update === true);
      })
      .catch(() => {
        // Silently fail — update check is best-effort
      });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // ── Collapsed nav items (all leaf pages) ──────────────────────────────

  const collapsedNavItems = [
    {
      key: "chat",
      icon: <SparkChatTabFill size={18} />,
      path: "/chat",
      label: t("nav.chat"),
    },
    {
      key: "channels",
      icon: <SparkWifiLine size={18} />,
      path: "/channels",
      label: t("nav.channels"),
    },
    {
      key: "sessions",
      icon: <SparkUserGroupLine size={18} />,
      path: "/sessions",
      label: t("nav.sessions"),
    },
    {
      key: "cron-jobs",
      icon: <SparkDateLine size={18} />,
      path: "/cron-jobs",
      label: t("nav.cronJobs"),
    },
    {
      key: "heartbeat",
      icon: <SparkVoiceChat01Line size={18} />,
      path: "/heartbeat",
      label: t("nav.heartbeat"),
    },
    {
      key: "workspace",
      icon: <SparkLocalFileLine size={18} />,
      path: "/workspace",
      label: t("nav.workspace"),
    },
    {
      key: "skills",
      icon: <SparkMagicWandLine size={18} />,
      path: "/skills",
      label: t("nav.skills"),
    },
    {
      key: "skill-pool",
      icon: <SparkOtherLine size={18} />,
      path: "/skill-pool",
      label: t("nav.skillPool", "Skill Pool"),
    },
    {
      key: "tools",
      icon: <SparkToolLine size={18} />,
      path: "/tools",
      label: t("nav.tools"),
    },
    {
      key: "mcp",
      icon: <SparkMcpMcpLine size={18} />,
      path: "/mcp",
      label: t("nav.mcp"),
    },
    // ACP module hidden — not used in current deployment
    // {
    //   key: "acp",
    //   icon: <SparkScanLine size={18} />,
    //   path: "/acp",
    //   label: t("nav.acp"),
    // },
    {
      key: "agent-config",
      icon: <SparkModifyLine size={18} />,
      path: "/agent-config",
      label: t("nav.agentConfig"),
    },
    {
      key: "agent-stats",
      icon: <SparkBarChartLine size={18} />,
      path: "/agent-stats",
      label: t("nav.agentStats"),
    },
    {
      key: "agents",
      icon: <SparkAgentLine size={18} />,
      path: "/agents",
      label: t("nav.agents"),
    },
    {
      key: "models",
      icon: <SparkModePlazaLine size={18} />,
      path: "/models",
      label: t("nav.models"),
    },
    // environments module hidden — not used in current deployment
    // {
    //   key: "environments",
    //   icon: <SparkInternetLine size={18} />,
    //   path: "/environments",
    //   label: t("nav.environments"),
    // },
    {
      key: "security",
      icon: <SparkBrowseLine size={18} />,
      path: "/security",
      label: t("nav.security"),
    },
    {
      key: "token-usage",
      icon: <SparkDataLine size={18} />,
      path: "/token-usage",
      label: t("nav.tokenUsage"),
    },
    // backups module hidden — not used in current deployment
    // {
    //   key: "backups",
    //   icon: <SparkSaveLine size={18} />,
    //   path: "/backups",
    //   label: t("nav.backups"),
    // },
    {
      key: "voice-transcription",
      icon: <SparkMicLine size={18} />,
      path: "/voice-transcription",
      label: t("nav.voiceTranscription"),
    },
    {
      key: "debug",
      icon: <SparkDebugLine size={18} />,
      path: "/debug",
      label: t("nav.debug", "Debug"),
    },
    // Append plugin nav items dynamically
    ...pluginRoutes.map((route) => ({
      key: route.path.replace(/^\//, ""),
      icon: <span style={{ fontSize: 18 }}>{route.icon}</span>,
      path: route.path,
      label: route.label,
    })),
  ];

  // ── Menu items — Chat only (Control & Workspace moved to dropdowns) ────

  const agentMenuItems: MenuProps["items"] = [
    {
      key: "chat",
      label: collapsed ? null : t("nav.chat"),
      icon: <SparkChatTabFill size={16} />,
    },
  ];

  // ── Control nav list for dropdown ──────────────────────────────────────
  const controlNavList = [
    { key: "channels", label: t("nav.channels") },
    { key: "sessions", label: t("nav.sessions") },
    { key: "cron-jobs", label: t("nav.cronJobs") },
    { key: "heartbeat", label: t("nav.heartbeat") },
  ];

  const controlOptions = controlNavList.map((item) => ({
    value: item.key,
    label: item.label,
  }));

  const isControlKey = (key: string) =>
    controlNavList.some((item) => item.key === key);

  // ── Workspace nav list for dropdown ────────────────────────────────────
  const workspaceNavList = [
    { key: "workspace", label: t("nav.workspace") },
    { key: "skills", label: t("nav.skills") },
    { key: "tools", label: t("nav.tools") },
    { key: "mcp", label: t("nav.mcp") },
    // ACP module hidden
    // { key: "acp", label: t("nav.acp") },
    { key: "agent-config", label: t("nav.agentConfig") },
    { key: "agent-stats", label: t("nav.agentStats") },
  ];

  const workspaceOptions = workspaceNavList.map((item) => ({
    value: item.key,
    label: item.label,
  }));

  const isWorkspaceKey = (key: string) =>
    workspaceNavList.some((item) => item.key === key);

  // ── Settings nav list for dropdown (used in non-collapsed mode) ───────
  const settingsNavList = [
    { key: "agents", label: t("nav.agents") },
    { key: "models", label: t("nav.models") },
    { key: "skill-pool", label: t("nav.skillPool", "Skill Pool") },
    // environments hidden
    // { key: "environments", label: t("nav.environments") },
    { key: "security", label: t("nav.security") },
    { key: "token-usage", label: t("nav.tokenUsage") },
    // backups hidden — not used in current deployment
    // { key: "backups", label: t("nav.backups") },
    { key: "voice-transcription", label: t("nav.voiceTranscription") },
    { key: "debug", label: t("nav.debug", "Debug") },
  ];

  const settingOptions = [
    ...settingsNavList.map((item) => ({
      value: item.key,
      label: item.label,
    })),
    ...pluginRoutes.map((route) => ({
      value: route.path.replace(/^\//, ""),
      label: route.label,
    })),
  ];

  const isSettingsKey = (key: string) =>
    settingsNavList.some((item) => item.key === key) ||
    pluginRoutes.some(
      (route) => route.path.replace(/^\//, "") === key,
    );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sider
      width={collapsed ? 72 : 240}
      className={`${styles.sider}${
        collapsed ? ` ${styles.siderCollapsed}` : ""
      }${isDark ? ` ${styles.siderDark}` : ""}`}
    >
      <div className={styles.siderScrollContent}>
        {collapsed ? (
          <nav className={styles.collapsedNav}>
          {collapsedNavItems.map((item) => {
            const isActive = selectedKey === item.key;
            return (
              <Tooltip
                key={item.key}
                title={item.label}
                placement="right"
                overlayInnerStyle={{
                  background: "rgba(0,0,0,0.75)",
                  color: "#fff",
                }}
              >
                <button
                  className={`${styles.collapsedNavItem} ${
                    isActive ? styles.collapsedNavItemActive : ""
                  }`}
                  onClick={() => navigate(item.path)}
                >
                  {item.icon}
                </button>
              </Tooltip>
            );
          })}
        </nav>
      ) : (
        <>
          {/* Logo at top of sidebar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 8px 8px",
            cursor: "pointer",
          }} onClick={() => navigate("/chat")}>
            <img
              src={isDark ? "/logo-header-dark.png" : "/logo-header-light.png"}
              alt="小铁智友"
              style={{ height: 28, width: "auto", maxWidth: 180, objectFit: "contain" }}
            />
          </div>

          {/* Agent-scoped section: selector + Chat */}
          <div className={styles.agentScopedSection}>
            <div className={styles.agentSelectorContainer}>
              <AgentSelector collapsed={collapsed} />
            </div>
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              openKeys={DEFAULT_OPEN_KEYS}
              onClick={({ key }) => {
                const path = KEY_TO_PATH[String(key)];
                if (path) navigate(path);
              }}
              items={agentMenuItems}
              theme={isDark ? "dark" : "light"}
              className={styles.sideMenu}
            />
          </div>

          {/* Control dropdown section */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsLabel}>{t("nav.control")}</div>
            <Select
              value={isControlKey(selectedKey) ? selectedKey : undefined}
              placeholder={t("nav.control")}
              options={controlOptions}
              onChange={(value) => {
                const path =
                  KEY_TO_PATH[String(value)] ?? `/${String(value)}`;
                if (path) navigate(path);
              }}
              className={styles.settingsSelect}
            />
          </div>

          {/* Workspace dropdown section */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsLabel}>{t("nav.agent")}</div>
            <Select
              value={isWorkspaceKey(selectedKey) ? selectedKey : undefined}
              placeholder={t("nav.agent")}
              options={workspaceOptions}
              onChange={(value) => {
                const path =
                  KEY_TO_PATH[String(value)] ?? `/${String(value)}`;
                if (path) navigate(path);
              }}
              className={styles.settingsSelect}
            />
          </div>

          {/* Global settings section */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsLabel}>{t("nav.settings")}</div>
            <Select
              value={isSettingsKey(selectedKey) ? selectedKey : undefined}
              placeholder={t("nav.settings")}
              options={settingOptions}
              onChange={(value) => {
                const path =
                  KEY_TO_PATH[String(value)] ?? `/${String(value)}`;
                if (path) navigate(path);
              }}
              className={styles.settingsSelect}
            />
          </div>
        </>
        )}
      </div>

      {/* Footer — user menu (VS Code / Cursor style) */}
      <div className={styles.siderFooter}>
        <Dropdown
          menu={{
            items: [
              {
                key: "appearance",
                label: t("nav.appearance"),
                icon: <SkinOutlined />,
                children: [
                  {
                    key: "theme-dark",
                    label: (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {t("theme.dark")}
                        {themeMode === "dark" && <CheckCircleOutlined style={{ color: "#52c41a" }} />}
                      </span>
                    ),
                    onClick: () => setThemeMode("dark"),
                  },
                  {
                    key: "theme-light",
                    label: (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {t("theme.light")}
                        {themeMode === "light" && <CheckCircleOutlined style={{ color: "#52c41a" }} />}
                      </span>
                    ),
                    onClick: () => setThemeMode("light"),
                  },
                  {
                    key: "theme-system",
                    label: (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {t("theme.system")}
                        {themeMode === "system" && <CheckCircleOutlined style={{ color: "#52c41a" }} />}
                      </span>
                    ),
                    onClick: () => setThemeMode("system"),
                  },
                ],
              },
              {
                key: "update",
                label: (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {t("update.checkUpdate", "检查更新")}
                    {hasUpdate && (
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#ff4d4f",
                        marginLeft: 8,
                      }} />
                    )}
                  </span>
                ),
                icon: <SyncOutlined />,
                onClick: () => setUpdateModalOpen(true),
              },
              { type: "divider" as const },
              {
                key: "docs",
                label: "操作文档",
                icon: <LinkOutlined />,
                onClick: () => openExternalLink("https://ecloud.crec.cn/chatAi/crecpawWebsite/docs.html"),
              },
              {
                key: "community",
                label: "技术社区",
                icon: <LinkOutlined />,
                onClick: () => openExternalLink("https://developers.crec.cn/"),
              },
              {
                key: "tech-news",
                label: "科技资讯",
                icon: <LinkOutlined />,
                onClick: () => openExternalLink("https://ecloud.crec.cn/chatAi/chat/techNewsletter?Aid="),
              },
              {
                key: "contact",
                label: "联系我们",
                icon: <LinkOutlined />,
                onClick: () => openExternalLink("https://awake.crec.cn/apps/desktop/multipleTabs/sapp/app_5k2s88slih/sapp_ncc6v20nlz/form_s3837k5u9h"),
              },
              ...(authEnabled ? [
                { type: "divider" as const },
                {
                  key: "logout",
                  label: t("login.logout"),
                  icon: <LogoutOutlined />,
                  onClick: async () => {
                    // 1. 先调用后端 revoke 使 token 失效
                    try {
                      await authApi.revokeToken();
                    } catch {
                      // 忽略错误，继续清除本地数据
                    }
                    // 2. 清除本地认证信息
                    localStorage.removeItem("qwenpaw_auth_token");
                    localStorage.removeItem("qwenpaw_username");
                    localStorage.removeItem("language");
                    sessionStorage.clear();
                    // 3. 设置标志，让登录页的 OAuth URL 带 prompt=login
                    //    强制中铁统一认证服务端要求重新扫码
                    //    必须在 sessionStorage.clear() 之后设置
                    sessionStorage.setItem("force_reauth", "1");
                    // 4. 清除 WKWebView 中的 SSO cookie
                    try {
                      if (window.pywebview && window.pywebview.api) {
                        await window.pywebview.api.clear_sso_cookies();
                      }
                    } catch {
                      // 非桌面环境忽略
                    }
                    // 5. 跳转到登录页
                    //    先设置 href 跳转，然后延迟 reload 确保页面完全重新加载
                    //    sessionStorage 在同 origin 重新加载后仍然保留
                    window.location.href = "/login";
                    setTimeout(() => window.location.reload(), 200);
                  },
                },
              ] : []),
            ] as MenuProps["items"],
          }}
          trigger={["click"]}
          placement="topLeft"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: 6,
              transition: "background 0.2s",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: isDark ? "#177ddc" : "#1677ff",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {username.charAt(0).toUpperCase()}
            </div>
            <span
              style={{
                fontSize: 13,
                color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.65)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {username}
            </span>
          </div>
        </Dropdown>
      </div>

      <UpdateModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} />

    </Sider>
  );
}
