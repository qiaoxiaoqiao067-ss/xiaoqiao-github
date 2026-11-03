/**
 * pdf.js expects browser canvas globals even when only extracting text.
 * Loading pdf-parse's Node worker first installs the @napi-rs/canvas
 * DOMMatrix/Path2D/ImageData implementations used in serverless runtimes.
 */
export async function extractPdfText(data: ArrayBuffer | Uint8Array | Buffer) {
  await import("pdf-parse/worker")
  const { PDFParse } = await import("pdf-parse")
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const parser = new PDFParse({ data: bytes })
  try {
    return (await parser.getText()).text.trim()
  } finally {
    await parser.destroy()
  }
}
