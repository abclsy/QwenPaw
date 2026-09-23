import { Layout, Tooltip, Dropdown, Popover, Modal, type MenuProps } from "antd";
import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  SparkChatTabFill,
  SparkWifiLine,
  SparkUserGroupLine,
  SparkDateLine,
  SparkVoiceChat01Line,
  SparkMagicWandLine,
  SparkLocalFileLine,
  SparkOtherLine,
  SparkModifyLine,
  SparkMcpMcpLine,
  SparkToolLine,
  SparkDataLine,
  SparkMicLine,
  SparkAgentLine,
  SparkBarChartLine,
  SparkModePlazaLine,
  SparkBrowseLine,
  SparkDebugLine,
  SparkReadLine,
} from "@agentscope-ai/icons";
import { GraduationCap, LayoutGrid, ChevronRight } from "lucide-react";
import { useAppMessage } from "../hooks/useAppMessage";
import AgentSelector from "../components/AgentSelector";
import SidebarChatHistory from "../components/SidebarChatHistory";
import { getAuthUsername, setAuthUsername, getApiUrl } from "../api/config";
import { authApi } from "../api/modules/auth";
import { usePlugins } from "../plugins/PluginContext";
import styles from "./index.module.less";
import { useTheme } from "../contexts/ThemeContext";
import { UpdateModal } from "../components/UpdateModal";
import { updateApi, type UpdateState } from "../api/modules/update";
import {
  LogoutOutlined,
  SyncOutlined,
  SkinOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  SettingOutlined,
} from "@ant-design/icons";

// ── Layout ────────────────────────────────────────────────────────────────

const { Sider } = Layout;

// ── Types ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  selectedKey: string;
}

interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: ReactNode;
  badge?: boolean;
  desc?: string;
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
  const collapsed = false;
  const [authEnabled, setAuthEnabled] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  // ── Navigation data ────────────────────────────────────────────────────
  // Main list (flat, no group labels) + "更多" flyout + settings modal.

  const mainItems: NavItem[] = [
    {
      key: "chat",
      path: "/chat",
      label: t("nav.chat"),
      icon: <SparkChatTabFill size={18} />,
    },
    {
      key: "experts",
      path: "/experts",
      label: t("nav.experts", "专家团队"),
      icon: <GraduationCap size={18} strokeWidth={2} />,
      badge: true,
    },
    {
      key: "knowledge-base",
      path: "/knowledge-base",
      label: t("nav.knowledgeBase", "知识库"),
      icon: <SparkReadLine size={18} />,
    },
    {
      key: "workspace",
      path: "/workspace",
      label: t("nav.workspace"),
      icon: <SparkLocalFileLine size={18} />,
    },
    {
      key: "skills",
      path: "/skills",
      label: t("nav.skills"),
      icon: <SparkMagicWandLine size={18} />,
    },
    {
      key: "models",
      path: "/models",
      label: t("nav.models"),
      icon: <SparkModePlazaLine size={18} />,
    },
  ];

  const moreItems: NavItem[] = [
    {
      key: "tools",
      path: "/tools",
      label: t("nav.tools"),
      icon: <SparkToolLine size={16} />,
    },
    {
      key: "mcp",
      path: "/mcp",
      label: t("nav.mcp"),
      icon: <SparkMcpMcpLine size={16} />,
    },
    {
      key: "agent-config",
      path: "/agent-config",
      label: t("nav.agentConfig"),
      icon: <SparkModifyLine size={16} />,
    },
    {
      key: "agent-stats",
      path: "/agent-stats",
      label: t("nav.agentStats"),
      icon: <SparkBarChartLine size={16} />,
    },
    {
      key: "skill-pool",
      path: "/skill-pool",
      label: t("nav.skillPool", "技能池"),
      icon: <SparkOtherLine size={16} />,
    },
    {
      key: "channels",
      path: "/channels",
      label: t("nav.channels"),
      icon: <SparkWifiLine size={16} />,
    },
    {
      key: "sessions",
      path: "/sessions",
      label: t("nav.sessions"),
      icon: <SparkUserGroupLine size={16} />,
    },
    {
      key: "cron-jobs",
      path: "/cron-jobs",
      label: t("nav.cronJobs"),
      icon: <SparkDateLine size={16} />,
    },
  ];

  const settingsItems: NavItem[] = [
    {
      key: "agents",
      path: "/agents",
      label: t("nav.agents"),
      icon: <SparkAgentLine size={18} />,
      desc: t("settingsModal.agentsDesc", "数字员工的创建与启停管理"),
    },
    {
      key: "heartbeat",
      path: "/heartbeat",
      label: t("nav.heartbeat"),
      icon: <SparkVoiceChat01Line size={18} />,
      desc: t("settingsModal.heartbeatDesc", "心跳任务与自主巡检配置"),
    },
    {
      key: "token-usage",
      path: "/token-usage",
      label: t("nav.tokenUsage"),
      icon: <SparkDataLine size={18} />,
      desc: t("settingsModal.tokenUsageDesc", "模型调用与消耗统计"),
    },
    {
      key: "security",
      path: "/security",
      label: t("nav.security"),
      icon: <SparkBrowseLine size={18} />,
      desc: t("settingsModal.securityDesc", "安全策略与权限配置"),
    },
    {
      key: "voice-transcription",
      path: "/voice-transcription",
      label: t("nav.voiceTranscription"),
      icon: <SparkMicLine size={18} />,
      desc: t("settingsModal.voiceDesc", "语音转写服务配置"),
    },
    {
      key: "debug",
      path: "/debug",
      label: t("nav.debug", "调试"),
      icon: <SparkDebugLine size={18} />,
      desc: t("settingsModal.debugDesc", "运行日志与调试信息"),
    },
  ];

  const pluginItems: NavItem[] = pluginRoutes.map((route) => ({
    key: route.path.replace(/^\//, ""),
    path: route.path,
    label: route.label,
    icon: <span style={{ fontSize: 16 }}>{route.icon}</span>,
  }));

  const moreActive = moreItems.some((item) => item.key === selectedKey);

  // ── Collapsed nav items (all leaf pages) ──────────────────────────────

  const collapsedNavItems: NavItem[] = [
    ...mainItems,
    ...moreItems,
    ...settingsItems,
    ...pluginItems,
  ];

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderNavItem = (item: NavItem) => {
    const isActive = selectedKey === item.key;
    return (
      <button
        key={item.key}
        className={`${styles.navItem}${
          isActive ? ` ${styles.navItemActive}` : ""
        }`}
        onClick={() => navigate(item.path)}
      >
        <span className={styles.navItemIcon}>{item.icon}</span>
        <span className={styles.navItemLabel}>{item.label}</span>
        {item.badge && <span className={styles.navItemNewDot} />}
      </button>
    );
  };

  const renderMoreItem = (item: NavItem) => {
    const isActive = selectedKey === item.key;
    return (
      <button
        key={item.key}
        className={`${styles.moreItem}${
          isActive ? ` ${styles.moreItemActive}` : ""
        }`}
        onClick={() => {
          setMoreOpen(false);
          navigate(item.path);
        }}
      >
        <span className={styles.moreItemIcon}>{item.icon}</span>
        <span className={styles.moreItemLabel}>{item.label}</span>
      </button>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sider
      width={collapsed ? 72 : 232}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 8px 8px",
                cursor: "pointer",
              }}
              onClick={() => navigate("/chat")}
            >
              <img
                src={isDark ? "/logo-header-dark.png" : "/logo-header-light.png"}
                alt="小铁智友"
                style={{
                  height: 28,
                  width: "auto",
                  maxWidth: 180,
                  objectFit: "contain",
                }}
              />
            </div>

            {/* Agent selector pinned at top */}
            <div className={styles.agentSelectorContainer}>
              <AgentSelector collapsed={collapsed} />
            </div>

            {/* Flat main navigation + 更多 flyout */}
            <nav className={styles.navList}>
              {mainItems.map(renderNavItem)}
              <Popover
                open={moreOpen}
                onOpenChange={setMoreOpen}
                trigger="hover"
                placement="rightTop"
                mouseEnterDelay={0.05}
                mouseLeaveDelay={0.1}
                arrow={false}
                content={
                  <div className={styles.moreMenu}>
                    {moreItems.map(renderMoreItem)}
                  </div>
                }
                overlayClassName={styles.morePopover}
              >
                <button
                  className={`${styles.navItem}${
                    moreActive ? ` ${styles.navItemActive}` : ""
                  }`}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <span className={styles.navItemIcon}>
                    <LayoutGrid size={17} strokeWidth={2} />
                  </span>
                  <span className={styles.navItemLabel}>
                    {t("nav.more", "更多")}
                  </span>
                  <ChevronRight size={13} strokeWidth={2.5} />
                </button>
              </Popover>
              {pluginItems.length > 0 && pluginItems.map(renderNavItem)}
            </nav>

            {/* Chat history fills the lower part of the sidebar */}
            <SidebarChatHistory />
          </>
        )}
      </div>

      {/* Footer — user menu (VS Code / Cursor style) */}
      <div className={styles.siderFooter}>
        <Dropdown
          menu={{
            items: [
              {
                key: "settings",
                label: t("nav.settings", "设置"),
                icon: <SettingOutlined />,
                onClick: () => setSettingsOpen(true),
              },
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

      {/* Settings modal — backend admin entries (WorkBuddy style) */}
      <Modal
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        footer={null}
        width={600}
        title={t("nav.settings", "设置")}
        className={styles.settingsModal}
        destroyOnClose
      >
        <div className={styles.settingsGrid}>
          {settingsItems.map((item) => (
            <button
              key={item.key}
              className={styles.settingsCard}
              onClick={() => {
                setSettingsOpen(false);
                navigate(item.path);
              }}
            >
              <span className={styles.settingsCardIcon}>{item.icon}</span>
              <span className={styles.settingsCardBody}>
                <span className={styles.settingsCardTitle}>{item.label}</span>
                {item.desc && (
                  <span className={styles.settingsCardDesc}>{item.desc}</span>
                )}
              </span>
              <ChevronRight
                size={14}
                strokeWidth={2}
                className={styles.settingsCardArrow}
              />
            </button>
          ))}
        </div>
      </Modal>

    </Sider>
  );
}
