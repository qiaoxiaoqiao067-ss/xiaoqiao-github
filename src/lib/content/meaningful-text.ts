const PAGE_MARKER = /--\s*\d+\s+of\s+\d+\s*--/gi

export function meaningfulTextLength(text: string | null | undefined) {
  if (!text) return 0
  return text
    .replace(PAGE_MARKER, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .length
}

export function hasMeaningfulScriptText(text: string | null | undefined) {
  return meaningfulTextLength(text) >= 80
}

export const NO_SCRIPT_TEXT_ERROR = "文件未提取到可审核正文，可能是扫描版 PDF；请上传可复制文字的 PDF、DOCX 或 TXT 文件。"
