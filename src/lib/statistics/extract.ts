import JSZip from "jszip"
import { SaxesParser } from "saxes"
import type { ScriptSource, SourceLine } from "./types"

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const STRICT_WORD_NS = "http://purl.oclc.org/ooxml/wordprocessingml/main"
const MAX_XML_BYTES = 20 * 1024 * 1024
const MAX_TEXT_CHARACTERS = 2_000_000

type XmlElement = { local: string; uri: string; attributes: Record<string, string>; children: (XmlElement | string)[] }
function isWord(node: XmlElement, local?: string) {
  return (node.uri === WORD_NS || node.uri === STRICT_WORD_NS) && (!local || node.local === local)
}

async function sha256(data: Uint8Array) {
  // Copy to an ArrayBuffer: browsers' SubtleCrypto does not accept SharedArrayBuffer.
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

function splitLines(text: string, paragraph: number): SourceLine[] {
  // Literal backslash-n is sometimes an export artefact. Only split it where the
  // following text looks like another script line; do not corrupt ordinary paths.
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\\n(?=\s*(?:[△▲【]|[\p{L}][\p{L}\p{N} .·/／（）()_-]{0,35}[：:]))/gu, "\n")
  return normalized.split("\n").map((text, index) => ({
    id: `p${paragraph}-l${index + 1}`, paragraph, line: index + 1, text: text.trim(),
  })).filter(line => line.text)
}

export async function sourceFromText(text: string, fileName: string, format = "txt"): Promise<ScriptSource> {
  const clean = text.replace(/^\uFEFF/, "")
  if (clean.length > MAX_TEXT_CHARACTERS) throw new Error("正文超过可处理长度，请按集拆分；未截断正文。")
  // Preserve blank-paragraph boundaries and stable source ids, rather than
  // collapsing a speaker-only paragraph into the previous utterance.
  const paragraphs = clean.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n/)
  const lines = paragraphs.flatMap((paragraph, index) => splitLines(paragraph, index + 1))
  if (!lines.length) throw new Error("文件没有可读取正文。")
  return { fileName, format, sourceHash: await sha256(new TextEncoder().encode(text)), lines, warnings: [] }
}

function parseXml(xml: string): XmlElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("不支持含外部实体或DOCTYPE的DOCX。")
  const root: XmlElement = { local: "root", uri: "", attributes: {}, children: [] }
  const stack = [root]
  const parser = new SaxesParser({ xmlns: true })
  parser.on("opentag", tag => {
    const node: XmlElement = { local: tag.local, uri: tag.uri, attributes: {}, children: [] }
    for (const attribute of Object.values(tag.attributes)) node.attributes[`${attribute.uri}|${attribute.local}`] = attribute.value
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  })
  parser.on("text", text => stack[stack.length - 1].children.push(text))
  parser.on("cdata", text => stack[stack.length - 1].children.push(text))
  parser.on("closetag", () => { stack.pop() })
  parser.write(xml).close()
  return root
}

function elements(node: XmlElement) { return node.children.filter((child): child is XmlElement => typeof child !== "string") }
function child(node: XmlElement, name: string) { return elements(node).find(item => isWord(item, name)) }
function wordValue(node: XmlElement) { return node.attributes[`${WORD_NS}|val`] ?? node.attributes[`${STRICT_WORD_NS}|val`] }
function enabled(node: XmlElement) { return !/^(?:0|false|off)$/i.test(wordValue(node) || "true") }
function hiddenRun(node: XmlElement) {
  const properties = child(node, "rPr")
  return Boolean(properties && elements(properties).some(item => isWord(item) && ["vanish", "webHidden"].includes(item.local) && enabled(item)))
}

export async function parseLocalScript(data: Uint8Array, fileName: string): Promise<ScriptSource> {
  const extension = fileName.split(".").pop()?.toLowerCase() || ""
  if (!["docx", "txt", "md"].includes(extension)) throw new Error("本地统计支持 DOCX、TXT、Markdown；PDF 或旧版 DOC 请使用服务器解析。")
  if (!data.byteLength || data.byteLength > 50 * 1024 * 1024) throw new Error("文件不能为空，且必须小于50MB。")
  const sourceHash = await sha256(data)
  if (extension !== "docx") {
    let text: string
    const warnings: string[] = []
    if (data[0] === 0xff && data[1] === 0xfe) text = new TextDecoder("utf-16le").decode(data)
    else if (data[0] === 0xfe && data[1] === 0xff) text = new TextDecoder("utf-16be").decode(data)
    else {
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(data) }
      catch {
        text = new TextDecoder("gb18030", { fatal: true }).decode(data)
        warnings.push("文本按GB18030解码，请核对是否存在乱码。")
      }
    }
    if (text.includes("\u0000")) throw new Error("文件包含二进制内容，不能作为文本解析。")
    const source = await sourceFromText(text, fileName, extension)
    return { ...source, sourceHash, warnings, requiresReview: warnings.length > 0 }
  }

  let zip: JSZip
  try { zip = await JSZip.loadAsync(data) }
  catch { throw new Error("文件不是有效DOCX，请用Word/WPS重新另存为DOCX；不能只修改扩展名。") }
  const entry = zip.file("word/document.xml")
  if (!entry) throw new Error("DOCX缺少正文，可能已损坏、加密或为受保护文件。")
  const expandedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (expandedSize && expandedSize > MAX_XML_BYTES) throw new Error("DOCX展开正文过大，请按集拆分文件。")
  const xml = await entry.async("string")
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) throw new Error("DOCX展开正文过大，请按集拆分文件。")
  let tree: XmlElement
  try { tree = parseXml(xml) }
  catch { throw new Error("DOCX正文XML无效，未使用部分正文计算字数。") }
  const document = elements(tree).find(node => isWord(node, "document"))
  const body = document && child(document, "body")
  if (!body) throw new Error("DOCX中未找到可读取的Word正文。")
  const lines: SourceLine[] = []
  let paragraph = 0
  let removed = 0
  let unsupported = 0
  let images = 0
  function inline(node: XmlElement): string {
    if (isWord(node) && ["del", "moveFrom"].includes(node.local)) { removed += 1; return "" }
    if (isWord(node, "r") && hiddenRun(node)) { removed += 1; return "" }
    if (isWord(node) && ["delText", "instrText", "commentReference", "commentRangeStart", "commentRangeEnd", "annotationRef"].includes(node.local)) return ""
    if (isWord(node, "t")) return node.children.filter(item => typeof item === "string").join("")
    if (isWord(node, "tab")) return "\t"
    if (isWord(node) && ["br", "cr"].includes(node.local)) return "\n"
    if (isWord(node, "altChunk")) { unsupported += 1; return "" }
    if (["blip", "imagedata"].includes(node.local)) { images += 1; return "" }
    if (isWord(node) && ["pPr", "rPr", "tblPr", "trPr", "tcPr"].includes(node.local)) return ""
    // Fall back OR use Choice, never both renderings of a Word textbox.
    if (node.local === "AlternateContent") {
      const alternatives = elements(node)
      const chosen = alternatives.find(item => item.local === "Fallback") || alternatives.find(item => item.local === "Choice")
      return chosen ? inline(chosen) : ""
    }
    const content = elements(node).map(inline).join("")
    return isWord(node, "p") ? `${content}\n` : content
  }
  function walk(node: XmlElement) {
    if (isWord(node) && ["del", "moveFrom"].includes(node.local)) { removed += 1; return }
    if (isWord(node, "p")) {
      paragraph += 1
      const properties = child(node, "pPr")
      if (properties && hiddenRun(properties)) { removed += 1; return }
      lines.push(...splitLines(inline(node), paragraph))
      return // nested textboxes were read by inline; never traverse twice
    }
    if (node.local === "AlternateContent") {
      const alternatives = elements(node)
      const chosen = alternatives.find(item => item.local === "Fallback") || alternatives.find(item => item.local === "Choice")
      if (chosen) walk(chosen)
      return
    }
    if (isWord(node, "altChunk")) { unsupported += 1; return }
    if (["blip", "imagedata"].includes(node.local)) { images += 1; return }
    elements(node).forEach(walk) // preserves paragraph order in table rows/cells
  }
  walk(body)
  if (!lines.length) throw new Error("DOCX没有可读取正文；不将图片或批注当作剧本。")
  if (lines.reduce((sum, line) => sum + line.text.length, 0) > MAX_TEXT_CHARACTERS) throw new Error("正文超过可处理长度，请按集拆分；未截断正文。")
  const warnings: string[] = []
  if (removed) warnings.push(`已按接受修订后的正文排除${removed}处删除、移出或隐藏内容；批注不参与统计。`)
  if (unsupported) warnings.push(`有${unsupported}处嵌入内容无法可靠读取，请对照原文件。`)
  if (images) warnings.push(`正文内含${images}处图片，未识别图片里的文字，请核对是否还有扫描正文。`)
  return { fileName, format: extension, sourceHash, lines, warnings, requiresReview: unsupported > 0 || images > 0 }
}
