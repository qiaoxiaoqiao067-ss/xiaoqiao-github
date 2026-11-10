import test from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { createCanvas } from "@napi-rs/canvas"
import { extractScript } from "../src/lib/content/extract-script"
import { hasMeaningfulScriptText } from "../src/lib/content/meaningful-text"

const story = "INT. APARTMENT - NIGHT. Riley opens the door and finds his brother waiting. He puts the letter on the table. His brother reads it and quietly closes the door."

test("text and UTF16 Word exports retain their actual body", async () => {
  for (const bytes of [Buffer.from(story), Buffer.concat([Buffer.from([255,254]),Buffer.from(story,"utf16le")])]) {
    const result = await extractScript(bytes,"txt")
    assert.equal(result.status,"ready")
    assert.equal(result.text,story)
  }
})

test("DOCX extracts body, corrupt document fails without fabricated text", async () => {
  const zip = new JSZip()
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${story}</w:t></w:r></w:p></w:body></w:document>`)
  assert.equal((await extractScript(await zip.generateAsync({type:"nodebuffer"}),"docx")).text,story)
  assert.equal((await extractScript(Buffer.from("broken zip"),"docx")).status,"failed")
  assert.equal(hasMeaningfulScriptText(Array.from({length:40},(_,i)=>`【第${i+1}页】\n-- ${i+1} of 40 --`).join("\n")),false)
  const protectedFile = await extractScript(Buffer.from("此文件为私密文档，请使用WPS Office打开".repeat(8)),"txt")
  assert.equal(protectedFile.status,"failed")
  assert.match(protectedFile.error!,/受保护文档/)
})

test("image-only screenplay is read by bundled OCR", async () => {
  const canvas = createCanvas(1600,420)
  const context = canvas.getContext("2d")
  context.fillStyle="white";context.fillRect(0,0,1600,420)
  context.fillStyle="black";context.font="36px Arial"
  for(const [index,line] of ["INT. APARTMENT - NIGHT.","Riley opens the door and finds his brother waiting.","He puts the letter on the table. His brother reads it.","His brother quietly closes the door and walks away."].entries()) context.fillText(line,30,65+index*70)
  const result = await extractScript(await canvas.encode("png"),"png")
  assert.equal(result.status,"ready",result.error || "")
  assert.match(result.text!,/brother/i)
})

test("serverless list requests never start a local review consumer", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-not-a-real-key"
  const old = process.env.VERCEL
  process.env.VERCEL="1"
  try {
    const { startReviewWorker } = await import("../src/lib/reviews/review-runner")
    startReviewWorker()
    assert.equal((globalThis as {__shortDramaReviewWorker?: unknown}).__shortDramaReviewWorker,undefined)
  } finally { if(old===undefined) delete process.env.VERCEL;else process.env.VERCEL=old }
})
