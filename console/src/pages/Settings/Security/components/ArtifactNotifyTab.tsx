import { useState } from "react";
import { Switch, Button, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import {
  ensureArtifactNotifyPermission,
  isArtifactNotifyEnabled,
  isArtifactNotifySupported,
  setArtifactNotifyEnabled,
} from "../../../../utils/artifactNotify";

const { Text } = Typography;

/**
 * Artifact notification settings tab (产物系统通知).
 *
 * Tasks producing files fires a desktop notification; clicking it
 * reveals the file in the OS file manager. The permission request
 * must happen inside a user gesture (Switch/button click), which is
 * why it lives here rather than on app start.
 */
export default function ArtifactNotifyTab() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => isArtifactNotifyEnabled());
  const supported = isArtifactNotifySupported();
  const [permission, setPermission] = useState(
    () =>
      (typeof Notification !== "undefined" && Notification.permission) || "",
  );

  const handleToggle = async (next: boolean) => {
    if (next) {
      const granted = await ensureArtifactNotifyPermission();
      setPermission(
        (typeof Notification !== "undefined" && Notification.permission) || "",
      );
      if (!granted) {
        // Keep the switch off and explain.
        setEnabled(false);
        setArtifactNotifyEnabled(false);
        return;
      }
    }
    setEnabled(next);
    setArtifactNotifyEnabled(next);
  };

  if (!supported) {
    return (
      <div style={{ padding: "24px 8px", textAlign: "center" }}>
        <Text type="secondary">
          {t("security.artifactNotify.unsupported", "当前环境不支持系统通知")}
        </Text>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 8px", maxWidth: 520 }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Text strong>
              {t("security.artifactNotify.enable", "文件生成通知")}
            </Text>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
              {t(
                "security.artifactNotify.description",
                "任务产出文件时发送系统通知，点击通知可直接在文件夹中定位文件",
              )}
            </div>
          </div>
          <Switch checked={enabled} onChange={handleToggle} />
        </div>

        {permission === "denied" && (
          <Text type="danger" style={{ fontSize: 12 }}>
            {t(
              "security.artifactNotify.denied",
              "系统通知权限已被拒绝，请在系统设置中允许本应用发送通知",
            )}
          </Text>
        )}

        {enabled && permission === "default" && (
          <Button size="small" onClick={() => void handleToggle(true)}>
            {t("security.artifactNotify.grant", "授权系统通知")}
          </Button>
        )}
      </Space>
    </div>
  );
}
