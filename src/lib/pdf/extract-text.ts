/**
 * pdf.js expects browser canvas globals even when only extracting text.
 * Loading pdf-parse's Node worker first installs the @napi-rs/canvas
 * DOMMatrix/Path2D/ImageData implementations used in serverless runtimes.
 */
import { createScriptOcr } from "@/lib/content/ocr"
import { meaningfulTextLength } from "@/lib/content/meaningful-text"

export async function extractPdfText(data: ArrayBuffer | Uint8Array | Buffer) {
  await import("pdf-parse/worker")
  const { PDFParse } = await import("pdf-parse")
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const parser = new PDFParse({ data: bytes })
  let worker: Awaited<ReturnType<typeof createScriptOcr>> | undefined
  try {
    const result = await parser.getText()
    const scanned = result.pages.filter(page => meaningfulTextLength(page.text) < 40)
    if (!scanned.length) return result.text.trim()
    if (scanned.length > 40) throw new Error("扫描页超过40页，请按集拆分文件后上传；原文件已保留。")
    worker = await createScriptOcr()
    const started = Date.now()
    for (const page of scanned) {
      if (Date.now() - started > 180000) throw new Error("扫描识别耗时较长，请拆分为较小文件重试；未将部分正文用于审核。")
      const rendered = await parser.getScreenshot({ partial: [page.num], desiredWidth: 1800, imageDataUrl: false })
      const image = rendered.pages[0]?.data
      if (!image) throw new Error(`第${page.num}页无法读取，请检查原文件。`)
      let timeout: ReturnType<typeof setTimeout> | undefined
      const recognized = await Promise.race([
        worker.recognize(Buffer.from(image)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("扫描识别超时，请拆分为较小文件重试；未将部分正文用于审核。")), Math.min(45000, Math.max(1, 180000 - (Date.now() - started))))
        }),
      ]).finally(() => { if (timeout) clearTimeout(timeout) })
      page.text = recognized.data.text.trim() || page.text
    }
    const body = result.pages.map(page => `【第${page.num}页】\n${page.text}`).join("\n\n").trim()
    if (meaningfulTextLength(body) < 80) throw new Error("扫描识别未读到足够正文，请上传更清晰的文件。")
    return `【扫描件 OCR 识别正文，可能存在文字误差；专名及关键情节请对照原文件核查。】\n\n${body}`
  } finally {
    if (worker) await worker.terminate()
    await parser.destroy()
  }
}
