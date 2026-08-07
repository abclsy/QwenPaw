import React, { useState, useEffect, useCallback } from "react";
import { Modal, Button, Progress, Typography, Space, Tag } from "antd";
import { CheckCircleOutlined, DownloadOutlined, ReloadOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { updateApi, type UpdateState } from "../../api/modules/update";

const { Text, Paragraph } = Typography;

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await updateApi.getStatus();
      setState(status);
    } catch (e) {
      console.error("Failed to get update status:", e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshStatus();
    }
  }, [open, refreshStatus]);

  // Poll status while downloading
  useEffect(() => {
    if (!open || state?.status !== "downloading") return;
    const timer = setInterval(refreshStatus, 1000);
    return () => clearInterval(timer);
  }, [open, state?.status, refreshStatus]);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const result = await updateApi.check();
      setState(result);
    } catch (e) {
      console.error("Update check failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const result = await updateApi.download();
      setState(result);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      await updateApi.apply();
      // App will restart — no need to handle response
    } catch (e) {
      console.error("Apply failed:", e);
      setLoading(false);
    }
  };

  const hasUpdate = state?.has_update === true;
  const isDownloading = state?.status === "downloading";
  const isDownloaded = state?.status === "downloaded";
  const isError = state?.status === "error";
  const isApplying = state?.status === "applying";
  const isUpToDate = state?.has_update === false;

  return (
    <Modal
      title={t("update.title", "检查更新")}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          {t("common.close", "关闭")}
        </Button>,
        !hasUpdate && !isDownloading && !isDownloaded && !isApplying && (
          <Button
            key="check"
            type="primary"
            loading={loading}
            icon={<ReloadOutlined />}
            onClick={handleCheck}
          >
            {t("update.checkNow", "检查更新")}
          </Button>
        ),
        hasUpdate && !isDownloading && !isDownloaded && (
          <Button
            key="download"
            type="primary"
            loading={loading}
            icon={<DownloadOutlined />}
            onClick={handleDownload}
          >
            {t("update.downloadNow", "下载更新")}
          </Button>
        ),
        isDownloaded && (
          <Button
            key="apply"
            type="primary"
            loading={loading}
            icon={<ReloadOutlined />}
            onClick={handleApply}
            danger
          >
            {t("update.restartToUpdate", "重启更新")}
          </Button>
        ),
      ].filter(Boolean)}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {/* Current version */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text type="secondary">
            {t("update.currentVersion", "当前版本")}:
          </Text>
          <Tag>{state?.current_version || "—"}</Tag>
          {state?.latest_version && (
            <>
              <Text type="secondary">
                {t("update.latestVersion", "最新版本")}:
              </Text>
              <Tag color={hasUpdate ? "green" : "default"}>
                {state.latest_version}
              </Tag>
            </>
          )}
        </div>

        {/* Up to date */}
        {isUpToDate && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a" }} />
            <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
              {t("update.upToDate", "已是最新版本")}
            </Paragraph>
          </div>
        )}

        {/* Update available */}
        {hasUpdate && !isDownloading && !isDownloaded && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <ExclamationCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />
              <Text strong>
                {t("update.updateAvailable", "发现新版本")} {state?.latest_version}
              </Text>
            </div>
            {state?.release_notes && (
              <div
                style={{
                  background: "rgba(0,0,0,0.02)",
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 200,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  fontSize: 13,
                }}
              >
                {state.release_notes}
              </div>
            )}
          </div>
        )}

        {/* Downloading */}
        {isDownloading && (
          <div>
            <Text>{t("update.downloading", "正在下载更新...")}</Text>
            <Progress
              percent={state?.download_progress || 0}
              status="active"
              style={{ marginTop: 8 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {_formatBytes(state?.download_downloaded || 0)} / {_formatBytes(state?.download_total || 0)}
            </Text>
          </div>
        )}

        {/* Downloaded */}
        {isDownloaded && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a" }} />
            <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
              {t("update.downloadComplete", "下载完成")}
            </Paragraph>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t("update.clickToRestart", "点击「重启更新」按钮，应用将自动重启并完成更新")}
            </Text>
          </div>
        )}

        {/* Applying */}
        {isApplying && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <ReloadOutlined spin style={{ fontSize: 48, color: "#1890ff" }} />
            <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
              {t("update.applying", "正在应用更新，应用即将重启...")}
            </Paragraph>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <ExclamationCircleOutlined style={{ fontSize: 48, color: "#ff4d4f" }} />
            <Paragraph style={{ marginTop: 16, marginBottom: 0, color: "#ff4d4f" }}>
              {state?.error || t("update.error", "更新失败")}
            </Paragraph>
          </div>
        )}
      </Space>
    </Modal>
  );
};

function _formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
