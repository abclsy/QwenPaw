import { Layout } from "antd";
import styles from "./index.module.less";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";

const { Header: AntHeader } = Layout;

export default function Header() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const logoSrc =
    resolvedTheme === "light"
      ? "/logo-header-light.png"
      : "/logo-header-dark.png";

  return (
    <AntHeader
      className={`${styles.header} ${resolvedTheme === "light" ? styles.headerLight : ""}`}
    >
      <div className={styles.logoWrapper}>
        <img
          src={logoSrc}
          alt="小铁智友"
          className={styles.logoImg}
          style={{ cursor: "pointer" }}
          onClick={() => navigate("/chat")}
        />
      </div>
      <div className={styles.headerLinks}>
        <a
          href="https://ecloud.crec.cn/chatAi/crecpawWebsite/docs.html"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.headerLink}
        >
          操作文档
        </a>
        <a
          href="https://developers.crec.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.headerLink}
        >
          技术社区
        </a>
        <a
          href="https://ecloud.crec.cn/chatAi/chat/techNewsletter?Aid="
          target="_blank"
          rel="noopener noreferrer"
          className={styles.headerLink}
        >
          科技资讯
        </a>
        <a
          href="https://awake.crec.cn/apps/desktop/multipleTabs/sapp/app_5k2s88slih/sapp_ncc6v20nlz/form_s3837k5u9h"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.headerLink}
        >
          联系我们
        </a>
      </div>
    </AntHeader>
  );
}
