import { FileTextOutlined } from "@ant-design/icons";

// ── Types ──────────────────────────────────────────────────────────────
interface FileBlockItem {
  type: "file";
  source: { type: string; url: string };
  filename?: string;
}

interface TextBlockItem {
  type: "text";
  text: string;
}

interface Props {
  data: {
    content?: [
      { data: { name?: string; arguments?: unknown } },
      { data?: { output?: (FileBlockItem | TextBlockItem)[] } },
    ];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────
function isHtmlFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.(html?|htm)$/i.test(filename);
}

function extractBlocks(data: Props["data"]) {
  const output = data.content?.[1]?.data?.output ?? [];
  const fileBlocks = output.filter(
    (b): b is FileBlockItem => b.type === "file",
  );
  const textBlocks = output.filter(
    (b): b is TextBlockItem => b.type === "text",
  );
  return { fileBlocks, textBlocks };
}

function navigateTo(url: string, e: React.MouseEvent) {
  e.preventDefault();
  window.location.href = url;
}

// ── Component ──────────────────────────────────────────────────────────
export default function SendFileToUserRenderer({ data }: Props) {
  // Safety: catch any rendering error silently
  try {
    const { fileBlocks, textBlocks } = extractBlocks(data);

    if (fileBlocks.length === 0) {
      return (
        <div style={{ padding: "4px 0", fontSize: 13, color: "#555" }}>
          {textBlocks.map((t, i) => (
            <span key={i}>{t.text}</span>
          ))}
        </div>
      );
    }

    return (
      <div style={{ marginTop: 4 }}>
        {/* ── File cards ── */}
        {fileBlocks.map((file, idx) => {
          const apiUrl = file.source?.url;
          const name = file.filename || "未知文件";
          if (!apiUrl) return null;

          if (isHtmlFile(file.filename)) {
            return (
              <div
                key={idx}
                style={{
                  padding: "12px 16px",
                  border: "1px solid #e0e0e0",
                  borderRadius: 10,
                  marginBottom: 10,
                  background: "#f9fbfd",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <FileTextOutlined
                    style={{ fontSize: 20, color: "#1961AC" }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={name}
                  >
                    {name}
                  </span>
                </div>
                <a
                  href={apiUrl}
                  onClick={(e) => navigateTo(apiUrl, e)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 22px",
                    background: "#1961AC",
                    color: "#fff",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  🔍 点击预览
                </a>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#aaa",
                    marginTop: 8,
                  }}
                >
                  预览页面带有「← 返回」按钮，可回到对话
                </span>
              </div>
            );
          }

          // ── Non-HTML file ──
          return (
            <a
              key={idx}
              href={apiUrl}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                marginBottom: 8,
              }}
            >
              <FileTextOutlined
                style={{ fontSize: 22, color: "#1961AC" }}
              />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                {name}
              </span>
            </a>
          );
        })}

        {/* ── Text block (e.g. "✅ HTML 文件已生成") ── */}
        {textBlocks.map((tb, idx) => (
          <div
            key={`text-${idx}`}
            style={{ fontSize: 13, color: "#555", marginTop: 2 }}
          >
            {tb.text}
          </div>
        ))}
      </div>
    );
  } catch {
    // Fail silently — never let a custom renderer crash the whole chat page
    return null;
  }
}
