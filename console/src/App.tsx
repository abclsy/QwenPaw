import { createGlobalStyle } from "antd-style";
import { ConfigProvider } from "@agentscope-ai/design";
import { App as AntdApp } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import jaJP from "antd/locale/ja_JP";
import ruRU from "antd/locale/ru_RU";
import type { Locale } from "antd/es/locale";
import { theme as antdTheme } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import "dayjs/locale/ja";
import "dayjs/locale/ru";
dayjs.extend(relativeTime);
import MainLayout from "./layouts/MainLayout";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { PluginProvider, usePlugins } from "./plugins/PluginContext";
import { ApprovalProvider } from "./contexts/ApprovalContext";
import DesktopFileLinkGuard from "./components/DesktopFileLinkGuard";
import FreezeDetector from "./components/FreezeDetector";
import { Suspense } from "react";
import { lazyImportWithRetry } from "./utils/lazyWithRetry";

const LoginPage = lazyImportWithRetry("./pages/Login/index");
import { authApi } from "./api/modules/auth";
import {
  getApiUrl,
  getApiToken,
  clearAuthToken,
  setAuthUsername,
} from "./api/config";
import "./styles/layout.css";
import "./styles/crec-blue.css";
import "./styles/form-override.css";

const antdLocaleMap: Record<string, Locale> = {
  zh: zhCN,
  en: enUS,
  ja: jaJP,
  ru: ruRU,
};

const dayjsLocaleMap: Record<string, string> = {
  zh: "zh-cn",
  en: "en",
  ja: "ja",
  ru: "ru",
};

const GlobalStyle = createGlobalStyle`
* {
  margin: 0;
  box-sizing: border-box;
}
`;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "auth-required" | "ok">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.getStatus();
        if (cancelled) return;
        if (!res.enabled) {
          setStatus("ok");
          return;
        }
        const token = getApiToken();
        if (!token) {
          setStatus("auth-required");
          return;
        }
        try {
          const r = await fetch(getApiUrl("/auth/verify"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cancelled) return;
          if (r.ok) {
            const data = await r.json().catch(() => ({}));
            if (data.username) {
              setAuthUsername(data.username);
            }
            setStatus("ok");
          } else {
            clearAuthToken();
            setStatus("auth-required");
          }
        } catch {
          if (!cancelled) {
            clearAuthToken();
            setStatus("auth-required");
          }
        }
      } catch {
        if (!cancelled) setStatus("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") return null;
  if (status === "auth-required")
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
        replace
      />
    );
  return <>{children}</>;
}

function getRouterBasename(pathname: string): string | undefined {
  return /^\/console(?:\/|$)/.test(pathname) ? "/console" : undefined;
}

function AppInner() {
  const basename = getRouterBasename(window.location.pathname);
  const { i18n } = useTranslation();
  const { isDark } = useTheme();
  const { loading: pluginsLoading } = usePlugins();
  const lang = i18n.resolvedLanguage || i18n.language || "en";
  const [antdLocale, setAntdLocale] = useState<Locale>(
    antdLocaleMap[lang] ?? enUS,
  );

  useEffect(() => {
    // Always use Chinese — this app is for Chinese users only
    if (i18n.language !== "zh") {
      i18n.changeLanguage("zh");
    }
    localStorage.setItem("language", "zh");
  }, []);

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const shortLng = lng.split("-")[0];
      setAntdLocale(antdLocaleMap[shortLng] ?? enUS);
      dayjs.locale(dayjsLocaleMap[shortLng] ?? "en");
    };

    // Set initial dayjs locale
    dayjs.locale(dayjsLocaleMap[lang.split("-")[0]] ?? "en");

    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n]);

  // Wait for plugins to load before rendering routes that might be patched
  if (pluginsLoading) {
    return null;
  }

  return (
    <BrowserRouter basename={basename}>
      <GlobalStyle />
      <ConfigProvider
        prefix="qwenpaw"
        prefixCls="qwenpaw"
        locale={antdLocale}
        theme={{
          // 2026-10-13 主题重做修正：cssVar+hashed 是 Spark Design 组件的
          // 运行契约（它们依赖注入的 --qwenpaw-* 变量渲染），必须保留；
          // 移除的只是 bailian 紫系 token（蓝块的源头）。变量现在全部由
          // 标准 antd 算法 + 品牌色生成。
          cssVar: true,
          hashed: false,
          algorithm: isDark
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
          token: isDark
            ? {
                colorPrimary: "#1961AC",
                colorInfo: "#1961AC",
                // 深色高亮家族必须钉死：dark 算法把品牌蓝 #1961AC
                // 提亮成 #4096ff 再加 0.18 alpha 作为 colorPrimaryBg/
                // colorInfoBg，被 Menu/selected/hover 大面积使用——
                // 这就是深色"蓝块"的来源（bailian 主题曾用 #202041
                // 钉住它，重做时被移除后算法派生现身）。钉成 antd
                // 官方深色对标准蓝的派生值（暗蓝黑，观感沉稳）。
                colorPrimaryBg: "#111a2c",
                colorPrimaryBgHover: "#112545",
                colorPrimaryActive: "#15325b",
                colorInfoBg: "#111a2c",
                colorInfoBgHover: "#112545",
                colorInfoActive: "#15325b",
              }
            : {
                colorPrimary: "#1961AC",
                colorInfo: "#1961AC",
              },
        }}
      >
        <AntdApp>
          <DesktopFileLinkGuard />
          <FreezeDetector />
          <ApprovalProvider>
            <Routes>
              <Route
                path="/login"
                element={
                  <Suspense fallback={null}>
                    <LoginPage />
                  </Suspense>
                }
              />
              <Route
                path="/*"
                element={
                  <AuthGuard>
                    <MainLayout />
                  </AuthGuard>
                }
              />
            </Routes>
          </ApprovalProvider>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <PluginProvider>
        <AppInner />
      </PluginProvider>
    </ThemeProvider>
  );
}

export default App;
