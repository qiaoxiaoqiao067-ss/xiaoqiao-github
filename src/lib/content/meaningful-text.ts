const PAGE_MARKER = /--\s*\d+\s+of\s+\d+\s*--/gi

export function meaningfulTextLength(text: string | null | undefined) {
  if (!text) return 0
  return text
    .replace(PAGE_MARKER, "")
    .replace(/【第\d+页】/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .length
}

export function hasMeaningfulScriptText(text: string | null | undefined) {
  return meaningfulTextLength(text) >= 80
}

export const NO_SCRIPT_TEXT_ERROR = "文件尚未识别到足够正文，请先完成文件解析；扫描件支持文字识别，请检查清晰度或重新上传原文件。"
