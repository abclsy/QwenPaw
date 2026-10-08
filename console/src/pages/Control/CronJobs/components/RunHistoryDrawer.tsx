import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Tag, Tooltip } from "@agentscope-ai/design";
import { Spin } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { cronJobApi, type CronRunRecord } from "../../../../api/modules/cronjob";
import dayjs from "dayjs";
import styles from "../index.module.less";

/**
 * Run-history timeline drawer for a cron job (定时任务运行时间线).
 *
 * Parity with WorkBuddy 5.7.0/5.7.5: click a job's "历史" action to see
 * its recent executions newest-first — status dot, time, duration,
 * trigger source; failures expand to show the error text so users can
 * locate the failure cause without digging through logs.
 */
export default function RunHistoryDrawer({
  open,
  job,
  onClose,
}: {
  open: boolean;
  job: { id: string; name?: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!job?.id) return;
    setLoading(true);
    try {
      const data = await cronJobApi.getCronJobRuns(job.id, 50);
      setRuns(Array.isArray(data) ? data : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [job?.id]);

  useEffect(() => {
    if (open) {
      setExpanded(null);
      void load();
    }
  }, [open, load]);

  // Light polling while a run may be in progress
  useEffect(() => {
    if (!open) return;
    const hasRunning = runs.some((r) => r.status === "running");
    if (!hasRunning) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [open, runs, load]);

  if (!job) return null;

  const statusIcon = (status: CronRunRecord["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircleFilled className={styles.iconSuccess} />;
      case "error":
        return <CloseCircleFilled className={styles.iconError} />;
      case "running":
        return <SyncOutlined className={styles.iconRunning} spin />;
      default:
        return <ClockCircleOutlined className={styles.iconOther} />;
    }
  };

  const statusTag = (status: CronRunRecord["status"]) => {
    const map: Record<string, { color: string; key: string }> = {
      success: { color: "success", key: "runHistory.success" },
      error: { color: "error", key: "runHistory.error" },
      running: { color: "processing", key: "runHistory.running" },
      cancelled: { color: "default", key: "runHistory.cancelled" },
    };
    const cfg = map[status] ?? map.cancelled;
    return (
      <Tag color={cfg.color}>{t(cfg.key, status)}</Tag>
    );
  };

  const fmtDuration = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={480}
      title={
        <span className={styles.drawerTitle}>
          {t("runHistory.title", "运行历史")}
          {job.name ? <span className={styles.drawerJobName}>{job.name}</span> : null}
        </span>
      }
      extra={
        <Tooltip title={t("runHistory.refresh", "刷新")}>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => void load()}
          />
        </Tooltip>
      }
    >
      {loading && runs.length === 0 ? (
        <div className={styles.emptyWrap}>
          <Spin indicator={<LoadingOutlined />} />
        </div>
      ) : runs.length === 0 ? (
        <div className={styles.emptyWrap}>
          {t("runHistory.empty", "暂无运行记录")}
        </div>
      ) : (
        <ul className={styles.timeline}>
          {runs.map((run) => {
            const key = run.run_id;
            const hasError = run.status === "error" && run.error;
            const isOpen = expanded === key;
            return (
              <li
                key={key}
                className={`${styles.timelineItem} ${
                  hasError ? styles.timelineItemError : ""
                }`}
                onClick={() => hasError && setExpanded(isOpen ? null : key)}
              >
                <div className={styles.itemHeader}>
                  {statusIcon(run.status)}
                  <span className={styles.itemTime}>
                    {dayjs(run.started_at).format("MM-DD HH:mm:ss")}
                  </span>
                  {statusTag(run.status)}
                  <span className={styles.itemDuration}>
                    {fmtDuration(run.duration_ms)}
                  </span>
                  <span className={styles.itemTrigger}>
                    {run.trigger === "manual"
                      ? t("runHistory.manual", "手动")
                      : t("runHistory.scheduled", "定时")}
                  </span>
                </div>
                {hasError && isOpen ? (
                  <pre className={styles.errorDetail}>{run.error}</pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
