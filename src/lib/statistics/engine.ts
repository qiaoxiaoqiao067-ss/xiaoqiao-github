import type { ClassifiedLine, LineKind, ScriptSource, SourceLine, StatisticsOptions, StatisticsResult } from "./types"

export const STATISTICS_RULE_VERSION = "han-spoken-v1"
export function countChinese(text: string) { return (text.match(/[\p{Unified_Ideograph}〇]/gu) || []).length }
function hasVoice(text: string) {
  return /(?:^|[\s（(])(?:V\.?O\.?|O\.?S\.?)(?=$|[\s）):：]|\p{Unified_Ideograph})/iu.test(text)
    || /\p{Unified_Ideograph}(?:OS|VO)(?=$|[）)])/iu.test(text) || /[a-z](?:OS|VO)$/.test(text)
    || /^(?:vo|os)(?=\p{Unified_Ideograph})/iu.test(text) || /画外音|旁白|心声|内心独白|语音/.test(text)
}
const ACTION = /^[△▲▶]/
const SCENE = /^\s*(\d{1,4})\s*[-－—–]\s*\d+(?:\s|[.、:：]|$)/
const CAST = /^(?:人物|出场人物|角色|CAST|CHARACTERS)\s*[：:]/i
const RESERVED = /^(?:人物|出场人物|角色|剧名|英文名|题材|类型|规格|故事|剧情|人物小传|核心创意|一句话|备注|注释|说明|地点|时间|场景|字幕|特写|音效|短信|屏幕|标题|项目联系人|意向投资人|邮件)/
const STAGE = /看|说|声|笑|哭|怒|气|愤|惊|震|痛|叫|喊|问|叹|息|咳|冷|热|急|轻|重|低|高|温|柔|抬|指|握|捏|攥|抓|伸|拉|推|按|抱|亲|吻|侧|俯|起|站|坐|跪|走|转|回|往|向|朝|装|含|带|用|开|关|脸|眼|头|手|身|口|耳|唇|牙|泪|血|喘|拍|捂|挣扎|化为|消失|倒在|死不瞑目|悔恨|狰狞|阴狠|激动|兴奋|不安|心虚|难受|深情|甜蜜|恭敬|命令|坚定|颤|决绝|疲惫|恳求|祈求|异口同声|齐声|梦呓|撩人|在意|厌恶|愧疚|慌|奔溃|崩溃|重音|哽咽|同声|附和|疼|扭曲|欲|怔|叱|噎|恐|淡淡|嘲讽|嘲弄|对耳麦|电话|视频|语音/

function markup(text: string) {
  return text.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").trim()
}
function cnNumber(text: string) {
  if (/^\d+$/.test(text)) return Number(text)
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let result = 0, value = 0
  for (const c of text) {
    if (c === "百" || c === "十" || c === "千") { result += (value || 1) * ({ 百: 100, 十: 10, 千: 1000 }[c]); value = 0 }
    else if (digits[c] !== undefined) value = digits[c]
    else return null
  }
  return result + value
}
function episodeHeader(text: string): { number: number; english: boolean } | null {
  const t = markup(text)
  const match = t.match(/^第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集(?=$|\s|[（(／/:：])/) || t.match(/^(?:EPISODE|EP\.?)[\s-]*(\d+)(?=$|\s|[（(/:：])/i)
  if (!match) return null
  const number = cnNumber(match[1])
  return number && number <= 9999 ? { number, english: !/^第/.test(t) } : null
}
function cleanSpeaker(text: string) {
  return text.replace(/（[^（）]*）|\([^()]*\)/g, "")
    .replace(/(^|\s)(?:V\.?O\.?|O\.?S\.?)(?=$|\s)/gi, "$1")
    .replace(/(?<=\p{Unified_Ideograph})(?:OS|VO)$/giu, "")
    .replace(/(?<=[a-z])(?:OS|VO)$/g, "")
    .replace(/^(?:vo|os)(?=\p{Unified_Ideograph})/giu, "").trim()
}
function parseCue(text: string) {
  const match = text.match(/^([^：:\n]{1,100})[：:]\s*([\s\S]*)$/)
  if (!match) return null
  const name = cleanSpeaker(match[1])
  if (!name || RESERVED.test(name) || /[。？！!?；;]/.test(name) || ACTION.test(name) || countChinese(name) > 24) return null
  // Prefix parentheses may contain commas, but a bare narrative prefix should not.
  if (!/^[\p{L}\p{N}\s.·、，,／/\-_+]+$/u.test(name)) return null
  return { speaker: match[1].trim(), name, content: match[2].trim() }
}
function stripPerformance(text: string) {
  let voiceover = false, uncertain = false
  // Nested hints are unwrapped from the inside; explicit OS speech survives.
  let previous: string
  do {
    previous = text
    text = text.replace(/（([^（）]*)）|\(([^()]*)\)/g, (whole, wide: string | undefined, narrow: string | undefined) => {
      const inner = wide ?? narrow ?? ""
      const spoken = inner.match(/^(?:OS|VO|O\.S\.?|V\.O\.?|内心独白|内心|心声|画外音|旁白)(?=$|[\s：:]|\p{Unified_Ideograph})\s*([：:]?)\s*([\s\S]*)$/iu)
      if (spoken) {
        voiceover = true
        if (spoken[2].trim() && !spoken[1]) uncertain = true
        return spoken[2]
      }
      if (hasVoice(inner)) { voiceover = true; return "" }
      if (/[。！？?!]/.test(inner) && /^(?:我|你|他|她|这|那|别|不|是|没|为什么|怎么|如果|只要|请)/.test(inner)) {
        uncertain = true; return inner
      }
      if (!inner.trim() || !countChinese(inner) || STAGE.test(inner)) return ""
      uncertain = true
      return inner // unknown parenthetical wording is retained for human review
    })
  } while (text !== previous && /[（(]/.test(text))
  return { content: text.trim(), voiceover, uncertain }
}
function quotes(text: string) { return Array.from(text.matchAll(/[“「"]([^”」"]+)[”」"]/g), match => match[1]) }
function inferredScreen(text: string, names: string[]) {
  const writing = /写|输入|打出|回复|回了|屏幕|界面|短信|聊天|文件|封面|一栏|信封|标题|签名|字段|标有|首页|收件人|附件/.test(text)
  if (!writing) return ""
  // Only wording explicitly supplied by the script is extracted. For structured
  // document fields, the visible field label is part of the copy; narrative
  // verbs such as "填上" and email UI labels are not counted as supplied copy.
  const spans: { start: number; end: number; content: string }[] = []
  function capture(pattern: RegExp, content: (match: RegExpMatchArray) => string) {
    for (const match of text.matchAll(pattern)) {
      spans.push({ start: match.index!, end: match.index! + match[0].length, content: content(match).trim() })
    }
  }
  capture(/(?:屏幕|界面)[^。；;\n]*?(?:名字|姓名|名称)\s*[：:]\s*([^，。；;\n]+)/gu, match => match[1])
  capture(/(?:屏幕|界面)(?:上)?(?:正)?显示(?:着|出|的是)?\s*([^，。；;\n]+?)的(?:名字|姓名|名称)/gu, match => match[1])
  capture(/(?:邮件)?收件人\s*(?:是|为|[：:])\s*([^，。；;\n]+)/gu, match => match[1])
  capture(/附件\s*(?:为|是|[：:])\s*[《〈]([^》〉]+)[》〉]/gu, match => match[1])
  capture(/(?:在|[。；;，,]\s*(?:在)?|^[△▲]?\s*(?:在)?)([\p{L}\p{N} _-]{1,24})一栏[，,\s]*(?:填上|写上|填入|写下|填写|输入)(?:了|为)?[：:\s]*[“「"]([^”」"]+)[”」"]/gu, match => {
    let label = match[1].trim()
    const narrator = [...names, "他们", "她们", "自己", "他", "她", "它"].find(name => label.startsWith(`${name}在`))
    if (narrator) label = label.slice(narrator.length + 1)
    return `${label}：${match[2]}`
  })
  for (const match of text.matchAll(/[“「"]([^”」"]+)[”」"]/g)) {
    // A quoted value inside an already extracted field is not another copy.
    if (!spans.some(span => match.index! >= span.start && match.index! < span.end)) {
      spans.push({ start: match.index!, end: match.index! + match[0].length, content: match[1] })
    }
  }
  if (spans.length) return spans.sort((a, b) => a.start - b.start).map(span => span.content).join("\n")
  return text.match(/(?:输入|打出|写下|标题写着|显示)\s*[：:]\s*(.+)$/)?.[1] || ""
}
function actorNames(lines: SourceLine[]) {
  const names = new Set<string>()
  for (const line of lines) {
    const t = markup(line.text)
    if (CAST.test(t)) {
      for (const piece of t.replace(CAST, "").split(/[、,，;；|／/]/)) {
        const value = cleanSpeaker(piece).replace(/(?:若干|数名|等)$/, "").trim()
        if (value && value.length < 35) names.add(value)
      }
    } else if (!ACTION.test(t) && !t.startsWith("【")) {
      const cue = parseCue(t)
      if (cue && cue.name.length < 25) names.add(cue.name)
    }
  }
  return [...names].sort((a, b) => b.length - a.length)
}

export function analyzeScript(source: ScriptSource, options: StatisticsOptions = {}): StatisticsResult {
  const warnings = [...source.warnings]
  const input = source.lines.map(line => ({ ...line, text: line.text }))
  const names = actorNames(input)
  const headings = input.map((line, index) => ({ index, header: episodeHeader(line.text) })).filter(row => row.header)
  function following(index: number, limit: number) {
    const first = episodeHeader(input[index].text)
    const result: SourceLine[] = []
    for (const line of input.slice(index + 1, index + limit + 1)) {
      const next = episodeHeader(line.text)
      if (next && (next.number !== first?.number || !next.english)) break
      result.push(line)
    }
    return result
  }
  const explicitlySelectedStart = options.bodyStartLineId ? input.findIndex(line => line.id === options.bodyStartLineId) : -1
  let bodyStart = explicitlySelectedStart
  if (bodyStart < 0) {
    // An outline can repeat episode headings. A real nearby scene/cast anchor is
    // necessary; descriptive outline text alone is not a screenplay boundary.
    bodyStart = headings.find(row => following(row.index, 15).some(line => SCENE.test(markup(line.text)) || CAST.test(markup(line.text))))?.index ?? -1
  }
  if (options.bodyStartLineId && explicitlySelectedStart < 0) warnings.push("选择的正文起点已失效，请重新选择。")
  if (bodyStart < 0) {
    bodyStart = input.findIndex(line => SCENE.test(markup(line.text)))
    if (bodyStart < 0) bodyStart = 0
    warnings.push("未找到可靠的分集正文起点，请选择正文起点并核对统计范围。")
  }
  const working = input.map(line => markup(line.text))
  const pairedEnglishTranslations = new Set<number>()
  for (let index = 0; index < working.length; index += 1) {
    const text = working[index]
    const cue = parseCue(text)
    if (!cue || !text.includes(":") || countChinese(cue.name) || !countChinese(cue.content) || (cue.content.match(/[A-Za-z]+/g) || []).length < 3) continue
    const paired = [working[index - 1], working[index + 1]].filter(Boolean).some(other => {
      const original = parseCue(other)
      return original && original.name.toLowerCase() === cue.name.toLowerCase() && countChinese(original.content) > 0
        && (other.includes("：") || countChinese(original.content) > (original.content.match(/[A-Za-z]/g) || []).length)
    })
    if (paired) pairedEnglishTranslations.add(index)
  }
  const repairs = new Map<number, string>()
  // Recover only an exact cast-name suffix across paragraphs, after a sentence
  // terminator. Retain a review flag and the untouched source text for both rows.
  for (let i = bodyStart; i < working.length - 1; i += 1) {
    if (input[i].paragraph === input[i + 1].paragraph) continue
    const next = parseCue(working[i + 1])
    if (!next) continue
    const complete = names.find(name => name !== next.name && name.endsWith(next.name) && name.length - next.name.length <= 3)
    if (!complete) continue
    const prefix = complete.slice(0, -next.name.length)
    if (working[i].endsWith(prefix) && /[。！？!？…]\s*$/.test(working[i].slice(0, -prefix.length)) && parseCue(working[i])) {
      working[i] = working[i].slice(0, -prefix.length)
      working[i + 1] = prefix + working[i + 1]
      repairs.set(i, "疑似人物名跨段，已从上一句移出姓名片段，请对照原文确认。")
      repairs.set(i + 1, "疑似跨段人物名已拼接，请对照原文确认。")
    }
  }

  const lines: ClassifiedLine[] = []
  let currentEpisode: number | null = null
  let lastHeader = -100
  let pendingSpeaker: string | null = null
  let afterEnd = false
  for (let index = 0; index < input.length; index += 1) {
    const original = input[index]
    const t = working[index]
    const h = episodeHeader(t)
    let kind: LineKind = "unknown", content = t, speaker: string | undefined, voiceover = false
    let uncertain = false, reason: string | undefined
    if (index < bodyStart || afterEnd) { kind = "frontmatter"; reason = afterEnd ? "全剧终后的附加材料" : "正文前材料" }
    else if (pairedEnglishTranslations.has(index)) { kind = "excluded"; reason = "相邻同人物双语英文译文，内嵌中文引用不重复计算" }
    else if (h) {
      kind = "heading"
      if (!(h.english && currentEpisode === h.number && index - lastHeader < 4)) {
        const nextScene = following(index, 9).map(line => markup(line.text).match(SCENE)).find(Boolean)
        const number = nextScene ? Number(nextScene[1]) : h.number
        if (number !== h.number) { uncertain = true; reason = `集标题为${h.number}，场次为${number}，按场次识别；请核对。` }
        if (currentEpisode !== null && number <= currentEpisode && !(number === currentEpisode && index - lastHeader < 4)) {
          uncertain = true; reason = "集数重复或倒序，请核对选集范围。"
        }
        currentEpisode = number
        lastHeader = index
      }
      pendingSpeaker = null
    } else if (SCENE.test(t)) {
      kind = "heading"
      if (currentEpisode === null) currentEpisode = Number(t.match(SCENE)![1])
      pendingSpeaker = null
    } else if (CAST.test(t)) { kind = "cast"; pendingSpeaker = null }
    else if (/^(?:【?\(?[（]?全剧终[）]?\)?】?|THE END|END OF SERIES)$/i.test(t)) { kind = "heading"; afterEnd = true }
    else if (/^(?:【?(?:梦境|梦境结束|闪回|闪出|闪回结束|转场|画面快速切换|升格镜头|音效)[^】]*】?|FLASHBACK|FLASH OUT|CUT TO:?)$/i.test(t)) { kind = "action"; pendingSpeaker = null }
    else if (/^(?:【第\s*\d+\s*页】|--\s*\d+\s+of\s+\d+\s*--|【扫描件\s*OCR)/i.test(t)) { kind = "excluded"; reason = "提取器页码或OCR提示，不是原剧本正文" }
    else if (ACTION.test(t)) {
      kind = "action"
      const q = quotes(t)
      const audible = /发出|播报|广播|喇叭|提示音|说道|说[：:]|喊道|叫道|耳语[：:]/.test(t)
      const unspoken = /没(?:有|能)?说|未说|说不出|没出声|没有出声|没再说/.test(t)
      const visible = inferredScreen(t, names)
      if (q.length && /口型|唇语/.test(t) && !audible) {
        kind = "unknown"; content = q.join("\n"); uncertain = true; reason = "仅描述口型，无法确定是否发声，请核对。"
      } else if (q.length && audible && !unspoken && !/输入|写下|打出|屏幕|短信/.test(t)) {
        kind = "dialogue"; content = q.join("\n"); speaker = "动作内明确发声"; voiceover = /机器|刷卡|广播|喇叭|提示音/.test(t)
        reason = "从动作描述中提取明确发声原句"
      } else if (visible && !unspoken) { kind = "screen"; content = visible; reason = "动作明确给出的画面文字" }
      else content = t
      pendingSpeaker = null
    } else if (t.startsWith("【")) {
      const inner = t.slice(1).replace(/】$/, "")
      const explicit = inner.match(/^(?:字幕|短信|屏幕|文字|特写)\s*[：:]\s*(.*)$/)
      kind = "screen"; content = explicit ? explicit[1] : inner
      const sender = parseCue(content)
      if (sender && !explicit) { speaker = sender.speaker; content = sender.content }
      if (/^特写[：:]/.test(inner) && !/写|签名|到账|授权|转让|终止|取消|审核|资金|姓名|证据|确认|无效|失败/.test(content)) {
        uncertain = true; reason = "特写可能是画面说明而非可见文字，计费画面字时请确认。"
      }
      pendingSpeaker = null
    } else {
      const cue = parseCue(t)
      const preceding = lines[lines.length - 1]
      const continuation = preceding && preceding.paragraph === original.paragraph && !cue && ["dialogue", "screen", "action"].includes(preceding.kind)
      if (continuation && preceding.kind === "dialogue" && names.some(name => t.startsWith(name) && /^(?:起身|站|坐|走|看|抬|转|低头|打开|拿起|握住|抓住|拉住|放下|推开|笑着|冲向|扑向|伸手)/.test(t.slice(name.length)))) {
        kind = "unknown"; content = t; uncertain = true; reason = "同段续行看似无标记动作，请核对是否仍为台词。"; pendingSpeaker = null
      } else if (continuation) {
        kind = preceding.kind
        speaker = preceding.speaker
        voiceover = Boolean(preceding.voiceover)
        const cleaned = kind === "dialogue" ? stripPerformance(t) : { content: t.replace(/】$/, ""), voiceover: false, uncertain: false }
        content = cleaned.content
        voiceover ||= cleaned.voiceover
        uncertain = Boolean(preceding.uncertain || cleaned.uncertain)
        reason = "同段换行续文，继承前一行的类别"
      } else if (cue && cue.content) {
        speaker = cue.speaker
        const cleaned = stripPerformance(cue.content)
        content = cleaned.content
        voiceover = hasVoice(cue.speaker) || cleaned.voiceover
        kind = /短信|文字消息|文字信息/.test(cue.speaker) ? "screen" : "dialogue"
        uncertain = cleaned.uncertain
        if (uncertain) reason = "括号内容可能是实际台词，已保留，请核对。"
        pendingSpeaker = null
      } else if (cue && !cue.content) {
        kind = "action"; content = ""; pendingSpeaker = cue.speaker; reason = "独立人物标签，等待下一行"
      } else if (names.includes(cleanSpeaker(t)) && !/[。！？!?]/.test(t)) {
        kind = "action"; content = ""; pendingSpeaker = t; reason = "独立人物标签，等待下一行"
      } else if (!countChinese(t)) { kind = "excluded"; reason = "英文译文或无汉字内容" }
      else if (pendingSpeaker) {
        kind = "dialogue"; speaker = pendingSpeaker; content = t; uncertain = true; reason = "由上一行人物名识别的无冒号台词，请核对。"; pendingSpeaker = null
      } else {
        const actor = names.find(name => t.startsWith(name) && t.length > name.length)
        const missing = actor && t.slice(actor.length).match(/^（([^（）]*)）(.+)$/)
        const semicolon = t.match(/^([^；;]{1,25})[；;](.+)$/)
        if (actor && missing) {
          kind = "dialogue"; speaker = actor; content = stripPerformance(missing[2]).content
          voiceover = hasVoice(missing[1]); uncertain = true; reason = "人物提示后缺冒号，按台词识别，请核对。"
        } else if (semicolon && names.includes(cleanSpeaker(semicolon[1]))) {
          kind = "dialogue"; speaker = semicolon[1]; content = stripPerformance(semicolon[2]).content
          uncertain = true; reason = "人物名后使用分号，按台词识别，请核对。"
        } else { kind = "unknown"; uncertain = true; reason = "无法可靠区分动作或无标签台词，请选择类别。" }
      }
    }
    if (repairs.has(index)) { uncertain = true; reason = repairs.get(index) }
    const override = options.overrides?.[original.id]
    if (override) {
      kind = override
      uncertain = false; reason = "已人工确认类别"
      if (override === "dialogue" || override === "screen") {
        const cue = parseCue(t)
        content = stripPerformance(cue?.content || (content !== t ? content : t.replace(ACTION, ""))).content
        speaker = cue?.speaker || speaker
        voiceover = voiceover || hasVoice(speaker || "")
      }
    }
    const editedContent = options.contentOverrides?.[original.id]
    if (editedContent !== undefined && (kind === "dialogue" || kind === "screen" || kind === "unknown")) {
      content = editedContent; uncertain = kind === "unknown"; reason = kind === "unknown" ? "已修正计数正文，仍需确认类别" : "已人工修正计数正文，原文保持不变"
    }
    const row: ClassifiedLine = { ...original, episode: index < bodyStart ? null : currentEpisode, kind, content,
      count: kind === "frontmatter" || kind === "excluded" ? 0 : countChinese(content),
      ...(speaker ? { speaker } : {}), ...(voiceover ? { voiceover } : {}), ...(uncertain ? { uncertain } : {}), ...(reason ? { reason } : {}) }
    lines.push(row)
  }

  const allEpisodes = [...new Set(lines.flatMap(line => line.episode !== null && line.kind !== "frontmatter" ? [line.episode] : []))].sort((a, b) => a - b)
  for (let i = 1; i < allEpisodes.length; i += 1) if (allEpisodes[i] !== allEpisodes[i - 1] + 1) warnings.push(`集数从${allEpisodes[i - 1]}跳至${allEpisodes[i]}，请确认是否缺集。`)
  const start = options.startEpisode ?? -Infinity, end = options.endEpisode ?? Infinity
  const selected = lines.filter(line => line.kind !== "frontmatter" && (line.episode !== null ? line.episode >= start && line.episode <= end : start === -Infinity && end === Infinity))
  if (start > end) warnings.push("起始集数大于结束集数，未计算该范围。")
  if ((Number.isFinite(start) || Number.isFinite(end)) && !selected.length) warnings.push("所选集数没有正文，请核对范围。")
  const includeVoiceover = options.includeVoiceover !== false
  const fullOf = (line: ClassifiedLine) => line.kind === "excluded" ? 0 : countChinese(line.text)
  const dialogueOf = (line: ClassifiedLine) => line.kind === "dialogue" && (includeVoiceover || !line.voiceover) ? line.count : 0
  const screenOf = (line: ClassifiedLine) => line.kind === "screen" ? line.count : 0
  const full = selected.reduce((sum, line) => sum + fullOf(line), 0)
  const dialogue = selected.reduce((sum, line) => sum + dialogueOf(line), 0)
  const screen = selected.reduce((sum, line) => sum + screenOf(line), 0)
  const quoteCharacters = options.basis === "full" ? full : dialogue + (options.includeScreenText ? screen : 0)
  const rateValues = [options.minRate ?? 120, options.maxRate ?? 150]
  if (rateValues.some(rate => !Number.isFinite(rate) || rate < 0 || rate > 100000)) throw new Error("千字单价必须是0至100000之间的有效数字。")
  const rates = rateValues.map(rate => Math.round(rate * 100)).sort((a, b) => a - b)
  const charge = (rateCents: number) => Math.round(quoteCharacters * rateCents / 1000) / 100
  const relevantUncertain = selected.filter(line => line.uncertain && (line.kind !== "screen" || options.includeScreenText || options.basis === "full"))
  if (relevantUncertain.length) warnings.push(`有${relevantUncertain.length}行需要核对类别或计数正文。`)
  const episodes = allEpisodes.filter(episode => episode >= start && episode <= end).map(episode => {
    const rows = selected.filter(line => line.episode === episode)
    return { episode, full: rows.reduce((n, line) => n + fullOf(line), 0), dialogue: rows.reduce((n, line) => n + dialogueOf(line), 0), screen: rows.reduce((n, line) => n + screenOf(line), 0) }
  })
  return { ruleVersion: STATISTICS_RULE_VERSION, totals: { full, dialogue, screen, quoteCharacters, minCost: charge(rates[0]), maxCost: charge(rates[1]) },
    episodes, lines, warnings: [...new Set(warnings)], episodeNumbers: allEpisodes,
    needsReview: Boolean(source.requiresReview || relevantUncertain.length || warnings.some(warning => /未找到|失效|跳至|没有正文|大于结束/.test(warning))) }
}
