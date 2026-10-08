import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Modal, Spin, Tag } from "antd";
import {
  FileTextOutlined,
  MessageOutlined,
  SearchOutlined,
  UserOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "../../api/config";
import { buildAuthHeaders } from "../../api/authHeaders";
import styles from "./GlobalSearch.module.less";

export interface SearchHit {
  domain: "chat" | "file";
  session_id: string | null;
  chat_id: string | null;
  chat_name: string | null;
  agent_name: string | null;
  role: string | null;
  timestamp: string | null;
  path: string | null;
  snippet: string;
  score: number;
}

/**
 * Global search (全局搜索): chats + workspace files, WorkBuddy 5.7.0
 * parity. Opened via the sidebar entry or Cmd/Ctrl+K. Chat hits jump
 * straight to the session in the Chat page.
 */
export default function GlobalSearch({
  open,
  onClose,
  onOpenSession,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<SearchHit[]>([]);
  const [files, setFiles] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<number | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setChats([]);
      setFiles([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(
        getApiUrl(
          `/search?q=${encodeURIComponent(trimmed)}`,
        ),
        { headers: buildAuthHeaders() },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setChats(data.chats ?? []);
      setFiles(data.files ?? []);
      setSearched(true);
    } catch {
      setChats([]);
      setFiles([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced live search
  useEffect(() => {
    if (!open) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSearch(query), 300);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query, open, runSearch]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setQuery("");
      setChats([]);
      setFiles([]);
      setSearched(false);
    }
  }, [open]);

  const jumpToChat = (h: SearchHit) => {
    // Prefer the backend chat UUID (route /chat/:id); fall back to the
    // session file id if the chat index has no mapping.
    const target = h.chat_id || h.session_id;
    if (target) onOpenSession?.(target);
    onClose();
  };

  const total = chats.length + files.length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      centered
      closable={false}
      title={
        <div className={styles.searchBar}>
          <SearchOutlined className={styles.searchIcon} />
          <input
            autoFocus
            className={styles.searchInput}
            placeholder={t(
              "globalSearch.placeholder",
              "搜索聊天记录和工作区文件…",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          {loading ? <Spin size="small" /> : null}
          <span className={styles.kbd}>Esc</span>
        </div>
      }
    >
      <div className={styles.body}>
        {loading && !searched ? (
          <div className={styles.center}>
            <Spin />
          </div>
        ) : !query.trim() ? (
          <div className={styles.hint}>
            {t(
              "globalSearch.hint",
              "输入关键词，同时搜索会话消息与工作区文本文件",
            )}
            <div className={styles.hintKbd}>
              {t("globalSearch.shortcut", "快捷键")}：⌘K / Ctrl+K
            </div>
          </div>
        ) : total === 0 ? (
          <Empty
            description={t("globalSearch.noResults", "没有找到相关内容")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            {chats.length > 0 && (
              <section className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  <MessageOutlined />
                  {t("globalSearch.chats", "聊天记录")}
                  <span className={styles.count}>{chats.length}</span>
                </h4>
                <ul className={styles.hitList}>
                  {chats.map((h, i) => (
                    <li
                      key={`${h.session_id}-${i}`}
                      className={styles.hitItem}
                      onClick={() => jumpToChat(h)}
                    >
                      <span className={styles.hitIcon}>
                        {h.role === "user" ? (
                          <UserOutlined style={{ color: "#1961ac" }} />
                        ) : (
                          <RobotOutlined style={{ color: "#52c41a" }} />
                        )}
                      </span>
                      <div className={styles.hitMain}>
                        {h.chat_name && (
                          <div className={styles.hitChatName}>
                            {h.chat_name}
                          </div>
                        )}
                        <div className={styles.hitSnippet}>{h.snippet}</div>
                        <div className={styles.hitMeta}>
                          {h.role === "user"
                            ? t("globalSearch.me", "我")
                            : t("globalSearch.assistant", "助手")}
                          {h.timestamp ? ` · ${h.timestamp}` : ""}
                          {h.score > 1
                            ? ` · ${h.score} ${t("globalSearch.hits", "处命中")}`
                            : ""}
                        </div>
                      </div>
                      <Tag className={styles.jumpTag}>
                        {t("globalSearch.open", "打开")}
                      </Tag>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {files.length > 0 && (
              <section className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  <FileTextOutlined />
                  {t("globalSearch.files", "工作区文件")}
                  <span className={styles.count}>{files.length}</span>
                </h4>
                <ul className={styles.hitList}>
                  {files.map((h, i) => (
                    <li
                      key={`${h.path}-${i}`}
                      className={styles.hitItem}
                      onClick={() =>
                        h.path && onOpenSession?.(`__file__:${h.path}`)
                      }
                    >
                      <span className={styles.hitIcon}>
                        <FileTextOutlined style={{ color: "#b07508" }} />
                      </span>
                      <div className={styles.hitMain}>
                        <div className={styles.hitPath}>{h.path}</div>
                        <div className={styles.hitSnippet}>{h.snippet}</div>
                      </div>
                      {h.score > 1 && (
                        <span className={styles.count}>{h.score}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
