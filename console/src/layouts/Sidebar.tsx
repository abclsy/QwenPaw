import {
  Layout,
  Menu,
  Button,
  Tooltip,
  Select,
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
  SparkInternetLine,
  SparkModifyLine,
  SparkBrowseLine,
  SparkMcpMcpLine,
  SparkScanLine,
  SparkToolLine,
  SparkDataLine,
  SparkMicLine,
  SparkAgentLine,
  SparkExitFullscreenLine,
  SparkOtherLine,
  SparkBarChartLine,
  SparkDebugLine,
  SparkSaveLine,
} from "@agentscope-ai/icons";
import { clearAuthToken } from "../api/config";
import { authApi } from "../api/modules/auth";
import { usePlugins } from "../plugins/PluginContext";
import styles from "./index.module.less";
import { useTheme } from "../contexts/ThemeContext";
import { KEY_TO_PATH, DEFAULT_OPEN_KEYS } from "./constants";

// ── Layout ────────────────────────────────────────────────────────────────

const { Sider } = Layout;

// ── Types ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  selectedKey: string;
}

// ── Sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar({ selectedKey }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { message: _msg } = useAppMessage();
  const { isDark } = useTheme();
  const { pluginRoutes } = usePlugins();
  const [authEnabled, setAuthEnabled] = useState(false);
  const collapsed = false;

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    authApi
      .getStatus()
      .then((res) => setAuthEnabled(res.enabled))
      .catch(() => {});
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
    {
      key: "acp",
      icon: <SparkScanLine size={18} />,
      path: "/acp",
      label: t("nav.acp"),
    },
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
    {
      key: "environments",
      icon: <SparkInternetLine size={18} />,
      path: "/environments",
      label: t("nav.environments"),
    },
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
    {
      key: "backups",
      icon: <SparkSaveLine size={18} />,
      path: "/backups",
      label: t("nav.backups"),
    },
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
    { key: "acp", label: t("nav.acp") },
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
    { key: "environments", label: t("nav.environments") },
    { key: "security", label: t("nav.security") },
    { key: "token-usage", label: t("nav.tokenUsage") },
    { key: "backups", label: t("nav.backups") },
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
              theme="dark"
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

      {/* Footer — pinned at bottom */}
      <div className={styles.siderFooter}>
        {authEnabled && (
          <Button
            type="text"
            icon={<SparkExitFullscreenLine size={16} />}
            onClick={() => {
              clearAuthToken();
              window.location.href = "/login";
            }}
            block
            className={`${styles.authBtn} ${
              collapsed ? styles.authBtnCollapsed : ""
            }`}
          >
            {!collapsed && t("login.logout")}
          </Button>
        )}
      </div>

    </Sider>
  );
}
