import React, { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useChatAnywhereSessionsState } from "@agentscope-ai/chat";

/**
 * URL chatId → context currentSessionId (one direction of bidirectional sync).
 *
 * Only reacts to URL or session list changes. currentSessionId is read via ref
 * to avoid triggering the effect when the context changes from the other direction
 * (context → URL via onSessionSelected), which would cause circular re-loads.
 */
const ChatSessionInitializer: React.FC = () => {
  const location = useLocation();
  const chatId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/(.+)$/);
    return match?.[1];
  }, [location.pathname]);

  const { sessions, currentSessionId, setCurrentSessionId } =
    useChatAnywhereSessionsState();

  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  useEffect(() => {
    if (!chatId || !sessions.length) return;
    // Match by id OR the extended fields: sessions that went through
    // realId resolution get their id swapped to the library timestamp
    // while the URL/sidebar keep the backend chat UUID (in realId), so
    // an id-only lookup misses them — clicking such a conversation in
    // the sidebar did NOTHING. sessionId covers the channel id form.
    const matching = sessions.find(
      (s) =>
        s.id === chatId ||
        (s as { realId?: string }).realId === chatId ||
        (s as { sessionId?: string }).sessionId === chatId,
    );
    if (matching && currentSessionIdRef.current !== matching.id) {
      setCurrentSessionId(matching.id);
    }
    // Intentionally exclude currentSessionId from deps: only react to URL / session list changes.
    // currentSessionId is read via ref to avoid circular triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, sessions, setCurrentSessionId]);

  return null;
};

export default ChatSessionInitializer;
