export const LEGACY_WORD_ERROR = "文件实际是旧版 Word 97–2003（.doc），只是文件名改成了 .docx。请用 Word/WPS 选择“另存为 DOCX”后重新上传，不能只修改扩展名。"

export function isLegacyWordDocument(buffer: Buffer | Uint8Array) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte)
}

export function docxParseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  if (/end of central directory|zip file|main document part/i.test(message)) {
    return "文件不是有效的 DOCX，可能是旧版 DOC 被改了扩展名，或文件结构已损坏。请用 Word/WPS 重新另存为 DOCX 后上传。"
  }
  return message || "DOCX 文件解析失败"
}
