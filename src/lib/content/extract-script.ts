import mammoth from "mammoth"
import WordExtractor from "word-extractor"
import { extractPdfText } from "@/lib/pdf/extract-text"
import { isLegacyWordDocument } from "./file-signatures"
import { hasMeaningfulScriptText } from "./meaningful-text"
import { createScriptOcr } from "./ocr"

export const SCRIPT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "md", "png", "jpg", "jpeg", "webp"])
export async function extractScript(buffer: Buffer, extension: string) {
  try {
    let text = ""
    if (buffer.subarray(0, 5).toString() === "%PDF-") text = await extractPdfText(buffer)
    else if (isLegacyWordDocument(buffer)) text = (await new WordExtractor().extract(buffer)).getBody()
    else if (extension === "docx" || extension === "doc") text = (await mammoth.extractRawText({ buffer })).value
    else if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
      const worker = await createScriptOcr()
      try { text = (await worker.recognize(buffer)).data.text } finally { await worker.terminate() }
    } else if (extension === "txt" || extension === "md") {
      text = new TextDecoder(buffer[0] === 0xff && buffer[1] === 0xfe ? "utf-16le" : "utf-8").decode(buffer)
      if (text.includes("�")) text = new TextDecoder("gb18030").decode(buffer)
    } else throw new Error("未识别文件内容，请检查文件是否损坏或加密。")
    if (/此文件仅WPS能打开|此文件为私密文档.{0,20}WPS|操作当前文件会造成文件损坏/.test(text)) {
      throw new Error("这是 WPS 私密/受保护文档，当前只能读到保护提示，无法读取剧本。请由文件所有者在 WPS 中导出可阅读的 PDF 或普通 DOCX 后上传。")
    }
    if (!hasMeaningfulScriptText(text)) throw new Error("文件已保存，但未识别到足够正文。请检查是否为空白、加密或图片过于模糊；可上传清晰原稿后重试。")
    return { text: text.trim(), status: "ready" as const, error: null }
  } catch (error) {
    return { text: null, status: "failed" as const, error: error instanceof Error ? error.message : "正文识别失败，原文件已保留，可重试。" }
  }
}
