import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import JSZip from "jszip"
import { analyzeScript, countChinese } from "../src/lib/statistics/engine"
import { parseLocalScript, sourceFromText } from "../src/lib/statistics/extract"
import type { ScriptSource } from "../src/lib/statistics/types"

function source(...texts: string[]): ScriptSource {
  return { fileName: "合成测试.txt", format: "txt", sourceHash: "fixture", warnings: [],
    lines: texts.map((text, i) => ({ id: `line-${i}`, paragraph: i + 1, line: 1, text })) }
}
const intro = ["第1集", "1-1 日 内 客厅", "人物：阿明、阿红"]

test("Han-only billing separates speech, screen copy, cues and English", () => {
  const s = source(...intro, "**阿明**：（低声）你好，John 123。", "阿红OS：我在这里。", "阿明（短信）：晚点见。", "【字幕：第二天】", "△阿明离开。")
  const result = analyzeScript(s)
  assert.equal(result.totals.dialogue, 6)
  assert.equal(result.totals.screen, 6)
  assert.equal(result.totals.quoteCharacters, 6)
  assert.equal(result.totals.minCost, 0.72)
  assert.equal(result.totals.maxCost, 0.9)
  assert.equal(analyzeScript(s, { includeVoiceover: false }).totals.dialogue, 2)
  assert.equal(analyzeScript(s, { includeScreenText: true, includeVoiceover: false }).totals.quoteCharacters, 8)
  assert.equal(countChinese("中文，John 123 𠀀〇"), 4)
})

test("explicit screen names, email metadata and visible document field labels are counted once", () => {
  const s = source(...intro, "阿明：你好。",
    "△界面上显示着林先生的姓名。",
    "△他看见屏幕上的名字：周宁。",
    "△屏幕上的名称：北极星。",
    "△电脑上，邮件收件人为北城文化协会，附件是《调研说明》。",
    "△他在联系人一栏，填上“李安”；意向机构一栏，写上“海岸公司”。",
    "△她翻回首页，手指停在“联系人：李安”上。",
    "△屏幕被擦干净。", "△文件上留有签名。", "△她打开附件，却看不清文字。")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 2)
  assert.equal(r.totals.screen, 36)
  assert.equal(r.totals.quoteCharacters, 2)
  assert.equal(analyzeScript(s, { includeScreenText: true }).totals.quoteCharacters, 38)
  assert.equal(r.lines.find(line => line.text.includes("联系人一栏"))?.content, "联系人：李安\n意向机构：海岸公司")
  assert.equal(r.lines.filter(line => line.kind === "screen").length, 6)
})

test("actual paragraph line breaks preserve continuations and multiple speakers", async () => {
  const s = await sourceFromText("第1集\n\n1-1 日 内\n\n人物：阿明、阿红\n\n阿明：你好。\n再见。\n阿红：回家。\n\n△他站起。\n△他们离开。", "软换行.txt")
  const result = analyzeScript(s)
  assert.equal(result.totals.dialogue, 6)
  assert.equal(result.lines.filter(line => line.kind === "dialogue").length, 3)
  assert.equal(result.needsReview, false)
  const escaped = await sourceFromText("第1集\n\n1-1 日 内\n\n人物：阿明、阿红\n\n阿明：你好。\\n阿红：回家。", "导出.txt")
  assert.equal(analyzeScript(escaped).totals.dialogue, 4)
})

test("outline episode headings do not precede the actual script boundary", () => {
  const s = source("剧情大纲", "第1集", "阿明发现秘密。", "第2集", "阿明回家。", "剧本正文", ...intro, "阿明：你好。", "第2集", "2-1 日 内", "阿红：回家。")
  const result = analyzeScript(s)
  assert.equal(result.lines[1].kind, "frontmatter")
  assert.equal(result.lines[2].kind, "frontmatter")
  assert.equal(result.totals.dialogue, 4)
  assert.deepEqual(result.episodeNumbers, [1, 2])
  assert.equal(analyzeScript(s, { startEpisode: 2, endEpisode: 2 }).totals.dialogue, 2)
  assert.equal(analyzeScript(s, { bodyStartLineId: s.lines[0].id }).lines[0].kind, "unknown")
})

test("short episodes do not inherit the next episode's scene number", () => {
  const s = source(...intro, "阿明：来。", "第2集（一卡）", "2-1 夜 内", "阿红：走。", "第3集（二卡）", "阿明：好。")
  const r = analyzeScript(s)
  assert.deepEqual(r.episodeNumbers, [1, 2, 3])
  assert.equal(r.episodes.find(row => row.episode === 3)?.dialogue, 1)
})

test("paired bilingual translations with quoted Han do not double count the Chinese side", () => {
  const s = source("第1集", "1-1 日 内", "人物：Ava", "Ava：奶奶，听我说。", 'AVA: Grandma says "奶奶", listen to me.')
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 5)
  assert.equal(r.lines.at(-1)?.kind, "excluded")
})

test("OS markers do not damage Latin names and parenthetical OS speech survives", () => {
  const s = source("第1集", "1-1 日 内", "人物：Rose、Ross、Carlos、阿明", "Rose：你好。", "Ross：回家。", "Carlos：晚安。", "阿明：（OS这只是我的秘密。）", "阿明（恼怒OS）：好。")
  const r = analyzeScript(s, { includeVoiceover: false })
  assert.equal(r.totals.dialogue, 6)
  assert.deepEqual(r.lines.filter(line => line.kind === "dialogue").slice(0, 3).map(line => Boolean(line.voiceover)), [false, false, false])
  const full = analyzeScript(s)
  assert.equal(full.totals.dialogue, 14)
  const os = full.lines.find(line => line.text.includes("OS这只是"))!
  assert.equal(os.content, "这只是我的秘密。")
  assert.equal(os.uncertain, true)
})

test("action-prefixed cues and bracketed voiceovers are spoken, while repeated labels and acting cues are not", () => {
  const s = source("第1集", "1-1 日 内", "人物：阿明、狱警1、女犯人1",
    "△狱警1（讥讽，拿着刀）：回去。", "【VO阿明：我会回来】", "【OS 阿明】：别怕。",
    "女犯人1：女犯人：你好。", "阿明：走。（讽刺）（情绪爆发）（跟着去，其他人也跟着！）（狡辩）（坚韧）（懊恼）（惧怕）（蹲）",
    "△阿明走到门口：身后的墙是红色。", "阿明：你听到了吗？（你为什么不回答？）")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 23)
  assert.equal(r.lines[3].content, "回去。")
  assert.equal(r.lines[3].uncertain, true)
  assert.equal(r.lines[4].voiceover, true)
  assert.equal(r.lines[5].voiceover, true)
  assert.equal(r.lines[6].content, "你好。")
  assert.equal(r.lines[6].uncertain, true)
  assert.equal(r.lines[7].content, "走。")
  assert.equal(r.lines[8].kind, "action")
  assert.equal(r.lines[9].uncertain, true)
  assert.equal(analyzeScript(s, { includeVoiceover: false }).totals.dialogue, 17)
})

test("a standalone VO or OS label is a valid speaker cue", () => {
  const r = analyzeScript(source(...intro, "VO：请联系银行。", "OS：我要回家。", "阿明：（举杯）欢迎。（逼近一步）（打量阿红）（不可置信）"))
  assert.equal(r.totals.dialogue, 11)
  assert.equal(r.lines[3].voiceover, true)
  assert.equal(r.lines[4].voiceover, true)
  assert.equal(r.lines[5].content, "欢迎。")
})

test("standalone speaker labels consume their soft-break dialogue before action continuation", async () => {
  const s = await sourceFromText("第1集\n\n1-1 日 内\n\n人物：阿明、阿红\n\nVO：\n他终于回家了。\n\n阿明：\n我会回来。\n\n阿红\n请进。", "独立标签.txt")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 12)
  assert.equal(r.lines.find(line => line.content === "他终于回家了。")?.voiceover, true)
  assert.equal(analyzeScript(s, { includeVoiceover: false }).totals.dialogue, 6)
  assert.equal(r.needsReview, true)
})

test("bracketed camera directions are not billable screen copy", () => {
  const r = analyzeScript(source(...intro, "【画面定格，黑场】", "【慢动作】", "【近景：他的手。】", "【切至门外】", "【镜头停留在面纱】", "【字幕：第二天】", "【短信：晚上见】",
    "【特写：阿明看着门外。】", "【阿明主观镜头】", "【快速蒙太奇】", "【特写：手机上显示“回家”。】", "【证词特写：我证明事情属实。】"))
  assert.equal(r.totals.screen, 15)
  assert.equal(r.lines.slice(3, 8).every(line => line.kind === "action"), true)
  assert.equal(r.lines.slice(10, 13).every(line => line.kind === "action"), true)
})

test("explicit machine speech and repeated shouts count; unspoken mouths and quote descriptions do not", () => {
  const s = source(...intro, "阿明：停！", "△阿明又喊道：“停！”", "△刷卡机发出“交易成功”的提示音。", "△“停”声音很轻。", "△阿红嘴唇动了动，却说不出那个“是”字。", "△阿红的口型是“回家”。")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 6)
  assert.equal(r.lines.at(-1)?.kind, "unknown")
  assert.equal(r.needsReview, true)
})

test("missing colons, split labels, and corrections retain auditable source", () => {
  const s = source(...intro, "阿明（轻声）你好。", "阿红", "回家。", "有歧义的文字")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 4)
  assert.equal(r.needsReview, true)
  const fixed = analyzeScript(s, { overrides: { "line-3": "dialogue", "line-5": "dialogue", "line-6": "excluded" }, contentOverrides: { "line-3": "早安。" } })
  assert.equal(fixed.lines[3].text, "阿明（轻声）你好。")
  assert.equal(fixed.lines[3].content, "早安。")
  assert.equal(fixed.lines[3].uncertain, undefined)
  assert.equal(fixed.totals.full, r.totals.full - 6)
})

test("cross-paragraph name recovery removes only the exact cast-name fragment", () => {
  const s = source("第1集", "1-1 日 内", "人物：阿明、莉奥娜妈妈", "阿明：你好！莉", "奥娜妈妈：回家。")
  const r = analyzeScript(s)
  assert.equal(r.totals.dialogue, 4)
  assert.equal(r.lines[3].content, "你好！")
  assert.equal(r.needsReview, true)
  const fixed = analyzeScript(s, { overrides: { "line-3": "dialogue", "line-4": "dialogue" }, contentOverrides: { "line-3": "你好！" } })
  assert.equal(fixed.totals.dialogue, 4)
  assert.equal(fixed.lines[3].text, "阿明：你好！莉")
  assert.equal(fixed.totals.full, r.totals.full)
})

test("uncertain parenthetical sentences and unmarked action continuations require review", async () => {
  const s = await sourceFromText("第1集\n\n1-1 日 内\n\n人物：阿明、阿红\n\n阿明：好。（你为什么不说话？）\n阿红起身离开。", "歧义.txt")
  const r = analyzeScript(s)
  assert.equal(r.lines.find(line => line.text.includes("为什么"))?.content, "好。你为什么不说话？")
  assert.equal(r.lines.at(-1)?.kind, "unknown")
  assert.equal(r.needsReview, true)
  const unknown = r.lines.at(-1)!
  assert.equal(analyzeScript(s, { contentOverrides: { [unknown.id]: "再见。" } }).lines.at(-1)?.uncertain, true)
})

async function docx(body: string) {
  const zip = new JSZip()
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>${body}</w:body></w:document>`)
  zip.file("word/comments.xml", "<comments>批注：这一段不能算台词。</comments>")
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }))
}
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`

test("DOCX soft breaks, tables and accepted visible revisions retain each word once", async () => {
  const bytes = await docx(p("第1集") + p("1-1 日 内") + p("人物：阿明、阿红")
    + '<w:p><w:r><w:t>阿明：你好。</w:t><w:br/><w:t>阿红：回家。</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc>' + p("阿明：好。") + '</w:tc><w:tc>' + p("MING: Good.") + '</w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:t>阿明：</w:t></w:r><w:del><w:r><w:delText>旧话</w:delText></w:r></w:del><w:ins><w:r><w:t>新话</w:t></w:r></w:ins><w:moveFrom><w:r><w:t>移出旧话</w:t></w:r></w:moveFrom><w:moveTo><w:r><w:t>来了</w:t></w:r></w:moveTo><w:r><w:rPr><w:vanish/></w:rPr><w:t>隐藏话</w:t></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:t>隐藏</w:t></w:r><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>可见</w:t></w:r></w:p>'
    + '<mc:AlternateContent><mc:Choice>' + p("阿明：重复。").replace("重复", "不读") + '</mc:Choice><mc:Fallback>' + p("阿明：再见。") + '</mc:Fallback></mc:AlternateContent>')
  const parsed = await parseLocalScript(bytes, "合成.docx")
  assert.equal(parsed.sourceHash.length, 64)
  assert.equal(analyzeScript(parsed).totals.dialogue, 13)
  assert.equal(parsed.lines.filter(line => line.text.includes("回家")).length, 1)
  assert.equal(parsed.lines.some(line => /批注|旧话|隐藏|不读/.test(line.text)), false)
  assert.equal(parsed.requiresReview, false)
})

test("invalid DOCX is not counted and UTF16 text is decoded", async () => {
  await assert.rejects(() => parseLocalScript(new TextEncoder().encode("broken zip"), "坏文件.docx"), /有效DOCX/)
  const zip = await docx(p("第1集"))
  assert.equal((await parseLocalScript(zip, "正常.docx")).format, "docx")
  const utf16 = new Uint8Array([255, 254, 45, 78, 135, 101]) // 中文
  assert.equal((await parseLocalScript(utf16, "文本.txt")).lines[0].text, "中文")
  await assert.rejects(() => parseLocalScript(utf16, "旧版.doc"), /服务器解析/)
})

test("DOCX pictures are flagged instead of silently claiming complete readable text", async () => {
  const bytes = await docx(p("第1集") + p("1-1 日 内") + '<w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></w:drawing></w:r></w:p>')
  const result = await parseLocalScript(bytes, "部分扫描.docx")
  assert.equal(result.requiresReview, true)
  assert.match(result.warnings.join(" "), /未识别图片/)
})

// Private reference scripts and expected counts live outside the repository.
// A manifest entry is {path, format?:"extracted-json", startEpisode?,
// endEpisode?, expectedDialogue, expectedFull?, expectedTranscriptPath?}.
// Transcripts are independently reviewed spoken strings in source order.
// Extracted JSON has {paragraphs:[{text}]}.
// Set this explicit, task-specific variable to opt into private regression data.
const externalManifest = process.env.SCRIPT_STATISTICS_FIXTURE_MANIFEST
test("optional external reference fixture manifest", { skip: !externalManifest }, async () => {
  const manifestPath = resolve(externalManifest!)
  const fixtures = JSON.parse(await readFile(manifestPath, "utf8")) as Array<{
    path: string; format?: "extracted-json"; startEpisode?: number; endEpisode?: number; expectedDialogue: number
    expectedFull?: number; expectedTranscriptPath?: string
  }>
  const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  for (const fixture of fixtures) {
    const path = resolve(dirname(manifestPath), fixture.path)
    let parsed: ScriptSource
    if (fixture.format === "extracted-json") {
      const data = JSON.parse(await readFile(path, "utf8")) as { paragraphs: { text: string }[] }
      // Exercise the full ZIP/XML/soft-break path without saving private copy.
      const body = data.paragraphs.map(paragraph => `<w:p><w:r>${paragraph.text.split("\n").map(text => `<w:t>${escapeXml(text)}</w:t>`).join("<w:br/>")}</w:r></w:p>`).join("")
      parsed = await parseLocalScript(await docx(body), "external-reference.docx")
    } else parsed = await parseLocalScript(new Uint8Array(await readFile(path)), path.split(/[/\\]/).pop()!)
    const result = analyzeScript(parsed, { startEpisode: fixture.startEpisode, endEpisode: fixture.endEpisode })
    assert.equal(result.totals.dialogue, fixture.expectedDialogue, `reference mismatch: ${fixture.path}`)
    assert.equal(result.episodes.reduce((sum, row) => sum + row.dialogue, 0), fixture.expectedDialogue)
    if (fixture.expectedFull !== undefined) assert.equal(result.totals.full, fixture.expectedFull, `full reference mismatch: ${fixture.path}`)
    if (fixture.expectedTranscriptPath) {
      const transcript = JSON.parse(await readFile(resolve(dirname(manifestPath), fixture.expectedTranscriptPath), "utf8")) as string[]
      const han = (text: string) => (text.match(/[\p{Unified_Ideograph}〇]/gu) || []).join("")
      const selected = result.lines.filter(line => line.kind === "dialogue" && line.episode !== null
        && line.episode >= (fixture.startEpisode ?? -Infinity) && line.episode <= (fixture.endEpisode ?? Infinity))
      // A soft break inside the same speaker's paragraph is one utterance in
      // the independent ledger; explicit new speaker cues stay separate.
      const utterances: { paragraph: number; speaker?: string; text: string }[] = []
      for (const line of selected) {
        const previous = utterances.at(-1)
        if (previous && previous.paragraph === line.paragraph && previous.speaker === line.speaker && line.reason === "同段换行续文，继承前一行的类别") previous.text += line.content
        else utterances.push({ paragraph: line.paragraph, speaker: line.speaker, text: line.content })
      }
      const actual = utterances.map(line => han(line.text)).filter(Boolean), expected = transcript.map(han).filter(Boolean)
      assert.equal(actual.length, expected.length, `utterance count mismatch: ${fixture.path}`)
      for (let index = 0; index < expected.length; index += 1) assert.equal(actual[index], expected[index], `utterance ${index + 1} mismatch: ${fixture.path}`)
    }
  }
})
