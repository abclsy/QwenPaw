import { useEffect, useState } from "react";
import { Progress, Tooltip } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  planApi,
  subscribePlanUpdates,
  type PlanStateResponse,
  type SubTaskResponse,
} from "../../../../api/modules/plan";
import styles from "./index.module.less";

/**
 * Inline plan progress card for the main chat area.
 *
 * When a plan is active (created in 想一想/Plan mode and being
 * executed after confirmation), a compact card floats above the
 * message list: overall progress bar + live subtask checklist.
 * Data comes from the same SSE stream the PlanPanel uses, so states
 * update in real time as the agent completes steps.
 *
 * The card auto-hides when there is no active plan, when the plan is
 * finished (done state) for a few seconds, or in ask mode.
 */
export default function PlanProgressCard() {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<PlanStateResponse | null>(null);

  useEffect(() => {
    // Initial fetch + SSE subscription
    let mounted = true;

    const load = async () => {
      try {
        const data = await planApi.getCurrentPlan(
          (window as any).currentSessionId || undefined,
        );
        if (mounted) setPlan(data);
      } catch {
        /* ignore */
      }
    };
    load();

    const unsub = subscribePlanUpdates((updated, eventSessionId) => {
      const mySid = (window as any).currentSessionId || "";
      if (eventSessionId && mySid && eventSessionId !== mySid) return;
      if (mounted) setPlan(updated);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (!plan || plan.state === "abandoned") return null;

  const total = plan.subtasks.length;
  const done = plan.subtasks.filter(
    (s) => s.state === "done" || s.state === "abandoned",
  ).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const finished = plan.state === "done";

  return (
    <div className={`${styles.card} ${finished ? styles.cardDone : ""}`}>
      <div className={styles.header}>
        <span className={styles.title}>
          {finished
            ? t("planCard.finished", "计划已完成")
            : t("planCard.executing", "正在执行计划")}
        </span>
        <span className={styles.planName}>{plan.name}</span>
        <span className={styles.count}>
          {done}/{total}
        </span>
      </div>

      <Progress
        percent={percent}
        size="small"
        status={finished ? "success" : "active"}
        showInfo={false}
        className={styles.progress}
      />

      <ul className={styles.taskList}>
        {plan.subtasks.map((task, idx) => (
          <TaskRow key={idx} task={task} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({ task }: { task: SubTaskResponse }) {
  const { t } = useTranslation();

  const icon =
    task.state === "done" ? (
      <CheckCircleFilled className={styles.iconDone} />
    ) : task.state === "in_progress" ? (
      <LoadingOutlined className={styles.iconRunning} spin />
    ) : task.state === "abandoned" ? (
      <MinusCircleOutlined className={styles.iconAbandoned} />
    ) : (
      <ClockCircleOutlined className={styles.iconTodo} />
    );

  const label =
    task.state === "in_progress"
      ? t("planCard.running", "进行中")
      : task.state === "done"
        ? t("planCard.done", "已完成")
        : task.state === "abandoned"
          ? t("planCard.skipped", "已跳过")
          : t("planCard.pending", "待执行");

  return (
    <li className={`${styles.task} ${styles["task_" + task.state] || ""}`}>
      {icon}
      <Tooltip title={task.description} mouseEnterDelay={0.5}>
        <span className={styles.taskName}>{task.name}</span>
      </Tooltip>
      <span className={styles.taskState}>{label}</span>
    </li>
  );
}
