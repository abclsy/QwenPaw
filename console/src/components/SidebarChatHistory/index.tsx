import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tooltip } from "antd";
import { Plus, MessageSquare } from "lucide-react";
import dayjs from "dayjs";
import { useAgentStore } from "../../stores/agentStore";
import { chatApi } from "../../api/modules/chat";
import type { ChatSpec } from "../../api/types/chat";
import styles from "./index.module.less";

/**
 * Sidebar chat history (WorkBuddy style).
 *
 * Lists the chats of the currently selected digital employee in the lower
 * part of the sidebar. Requests are automatically agent-scoped via the
 * X-Agent-Id header. Clicking an item navigates to /chat/<id>, which the
 * Chat page picks up via sessionApi.preferredChatId.
 */
export default function SidebarChatHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedAgent } = useAgentStore();
  const [chats, setChats] = useState<ChatSpec[]>([]);
  const [loading, setLoading] = useState(true);

  // Current chat id from URL (/chat/<id>)
  const currentChatId = useMemo(() => {
    const m = location.pathname.match(/^\/chat\/([^/]+)/);
    return m?.[1] ?? null;
  }, [location.pathname]);

  const loadChats = useCallback(async () => {
    try {
      const list = await chatApi.listChats();
      const sorted = [...(list ?? [])].sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      });
      setChats(sorted);
    } catch {
      // Silent — keep last known list
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the selected agent changes
  useEffect(() => {
    setLoading(true);
    loadChats();
  }, [selectedAgent, loadChats]);

  // Reload (debounced) when the URL changes — creating or switching a chat
  // updates the URL, which is a cheap signal that the list may be stale.
  useEffect(() => {
    const id = setTimeout(loadChats, 500);
    return () => clearTimeout(id);
  }, [location.pathname, loadChats]);

  // Periodic refresh to catch renames / new chats from other surfaces
  useEffect(() => {
    const id = setInterval(loadChats, 30000);
    return () => clearInterval(id);
  }, [loadChats]);

  const handleNewChat = () => {
    if (location.pathname.startsWith("/chat")) {
      window.dispatchEvent(new CustomEvent("crecpaw:new-chat"));
    } else {
      // ChatActionGroup is not mounted yet — queue the request
      sessionStorage.setItem("crecpaw_pending_new_chat", "1");
      navigate("/chat");
    }
  };

  return (
    <div className={styles.historySection}>
      <div className={styles.historyHeader}>
        <span className={styles.historyLabel}>
          {t("history.tasksLabel", {
            defaultValue: "任务（{{count}}）",
            count: chats.length,
          })}
        </span>
        <Tooltip
          title={t("history.newChat", "新对话")}
          mouseEnterDelay={0.3}
        >
          <button className={styles.newBtn} onClick={handleNewChat}>
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </Tooltip>
      </div>
      <div className={styles.historyList}>
        {loading && chats.length === 0 ? (
          <div className={styles.empty}>{t("common.loading", "加载中…")}</div>
        ) : chats.length === 0 ? (
          <div className={styles.empty}>{t("history.empty", "暂无对话")}</div>
        ) : (
          chats.map((chat) => {
            const active = chat.id === currentChatId;
            const time = chat.updated_at || chat.created_at;
            return (
              <button
                key={chat.id}
                className={`${styles.item}${
                  active ? ` ${styles.itemActive}` : ""
                }`}
                onClick={() => navigate(`/chat/${chat.id}`)}
                title={chat.name || t("history.untitled", "新对话")}
              >
                <MessageSquare
                  size={13}
                  strokeWidth={2}
                  className={styles.itemIcon}
                />
                <span className={styles.itemName}>
                  {chat.name || t("history.untitled", "新对话")}
                </span>
                {time && (
                  <span className={styles.itemTime}>
                    {dayjs(time).fromNow()}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
