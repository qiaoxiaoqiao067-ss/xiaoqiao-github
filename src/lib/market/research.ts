import type {MonthlyReviewRecord} from './monthly-review'
import { metricNumber, type BoardComparison, type BoardSample } from './board-analysis'

export type ResearchCase = {
  title: string; source: string; period: string; rank: number; channel: string
  metric: string; value: number | null; regions: string
}
export type ResearchFinding = {
  reviewNotice?: string; review?: MonthlyReviewRecord; id: string; genre: string; title: string; decision: string; facts: string[]
  judgment: string; development: string; advertising: string; validation: string
  cases: ResearchCase[]; cautions: string[]
}
export type MarketResearch = { findings: ResearchFinding[]; limitations: string[]; method: string }
type Genre = BoardComparison['genres'][number]
// Broad emotional/story mechanisms are visible in genre comparisons, but do not define a solicitation lane by themselves.
const STORY_MECHANISMS = new Set(['情感','逆袭','复仇','打脸虐渣','虐恋','甜宠'])
const tags = (row: Record<string, unknown>, key: string) => String(row[key] ?? '').split(/[,，、/\n]/).map(s => s.trim())
const share = (n: number, total: number) => (100 * n / Math.max(1, total)).toFixed(1)
const label = (c: BoardComparison) => c.key.endsWith('short-drama') ? '投放榜' : 'TikTok热播榜'
function fact(c: BoardComparison, g: Genre) {
  return `${label(c)}｜${c.previous!.period} → ${c.current!.period}，共同原榜Top${c.sampleSize}：${g.name} ${g.previous}/${c.previousWorks}部（${share(g.previous,c.previousWorks)}%）→ ${g.current}/${c.currentWorks}部（${share(g.current,c.currentWorks)}%），${g.change >= 0 ? '+' : ''}${g.change.toFixed(1)}个百分点。`
}
function cases(sample: BoardSample, genre: string, n: number): ResearchCase[] {
  const seen = new Set<string>()
  return sample.ai.filter(r => (metricNumber(r[sample.rankKey]) ?? Infinity) <= n && tags(r,sample.tagKey).includes(genre))
    .sort((a,b) => (metricNumber(b[sample.metric || '']) ?? -Infinity) - (metricNumber(a[sample.metric || '']) ?? -Infinity) || Number(a[sample.rankKey])-Number(b[sample.rankKey]))
    .filter(r => { const k = String(r[sample.titleKey] ?? '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true })
    .slice(0,2).map(r => ({title:String(r[sample.titleKey]),source:sample.name,period:sample.period,rank:Number(r[sample.rankKey]),channel:String(r[sample.channelKey || ''] ?? ''),metric:sample.metric || '指标未识别',value:sample.metric ? metricNumber(r[sample.metric]) : null,regions:Object.entries(r).filter(([k]) => /国家.*Top[123]/i.test(k)).map(([,v])=>String(v ?? '')).filter(Boolean).join('、')}))
}
function cautions(comparisons: BoardComparison[]) {
  return comparisons.flatMap(c => c.changedTags ? [`${label(c)}同名${c.matched}对记录中${c.changedTags}对标签发生变化；占比变化可能含标签修订，不能全部解释为市场需求变化。`] : [])
}

/** Rules select research questions, not investment scores or inferred audience demand. */
export function buildMarketResearch(samples: BoardSample[], comparisons: BoardComparison[]): MarketResearch {
  const findings: ResearchFinding[] = []
  const valid = comparisons.filter(c => !c.reason && c.currentWorks >= 20 && c.previousWorks >= 20)
  const used = new Set<string>()
  for (const ad of valid.filter(c => c.key.endsWith(':short-drama'))) {
    const tk = valid.find(c => c.key === ad.key.replace(/short-drama$/, 'tiktok-hot'))
    if (!tk || ad.current!.period !== tk.current!.period || ad.previous!.period !== tk.previous!.period) continue
    const pairs = ad.genres.filter(g=>!STORY_MECHANISMS.has(g.name)).map(a => ({a, b:tk.genres.find(b => b.name === a.name)})).filter((p): p is {a:Genre;b:Genre} => !!p.b)
    const create = (p: {a:Genre;b:Genre}, type: 'divergent'|'cooling'|'growing') => {
      used.add(p.a.name)
      const g = p.a.name
      const copy = type === 'divergent' ? {
        title:`${g}：投放布局扩张，热播端尚未同向`,decision:'小范围验证',
        judgment:'该标签在投放榜中的作品占比上升，热播榜未同步上升。两类信号存在分歧，不能据投放扩张直接认定观众偏好或商业转化增长。',
        development:`先收集2份${g}候选故事，与下方对标作品逐一比较开篇冲突和人物关系；完成内容核验后再决定是否定制，不扩大同质化收稿。`,
        advertising:`先核验下方投放作品的目标国家及素材，再用已获授权的${g}素材做两种开篇钩子的对照测试；在同一地区、受众和预算下记录点击、观看与转化。`,
        validation:'复核标签后，若下一期同榜占比仍升且热播端也上升，再提高研究优先级；若投放增长集中于少数作品或测试无改善，停止扩量。',
      } : type === 'cooling' ? {
        title:`${g}：两榜占比回落，降低同质化开发优先级`,decision:'收紧新增选题',
        judgment:'当前共同范围内，该标签在两榜的份额均下降。适合收紧新增同类选题，不能据此认定题材失效，更不能据样本变化取消已有项目。',
        development:`暂不新增仅靠“${g}”标签的定制需求。拆解仍在榜的作品，要求新选题说明与存量作品不同的关系冲突、目标观众和验证证据。`,
        advertising:'保留现有有效素材作对照；新增测试先验证差异化钩子。没有账户转化数据，不给出停投或加预算结论。',
        validation:'先检查存量作品是否被改标或跌出TopN；若修正标签后回落消失，撤回降级判断。后续份额恢复且具体测试改善后再上调。',
      } : {
        title:`${g}：两榜同向上升，优先进入内容研究`,decision:'优先拆解',
        judgment:'投放布局与热播样本中该标签的作品占比同向上升，值得优先研究。题材层面的共振不代表下方作品为跨榜同一作品，也不证明盈利。',
        development:`先拆解下方${g}作品的前三集及人物关系，再形成1份定向收稿需求，明确主冲突、差异点和不能照搬的情节。`,
        advertising:'从核验过的作品中提炼可测试的钩子结构，使用自有或授权素材测试；对照现有素材记录完播、点击与转化，再决定规模。',
        validation:'核对标签及原始筛选条件；若下一期信号反转或内容测试没有优势，退回观察，不直接立项。',
      }
      findings.push({id:`${ad.key}:${type}:${g}`,genre:g,...copy,facts:[fact(ad,p.a),fact(tk,p.b)],cases:[...cases(ad.current!,g,ad.sampleSize),...cases(tk.current!,g,tk.sampleSize)],cautions:cautions([ad,tk])})
    }
    const growing = pairs.filter(p=>p.a.change>=3 && p.b.change>=3 && Math.min(p.a.current,p.b.current)>=5).sort((x,y)=>Math.min(y.a.change,y.b.change)-Math.min(x.a.change,x.b.change))[0]
    if (growing) create(growing,'growing')
    const divergent = pairs.filter(p=>p.a.change>=3 && p.b.change<=0 && Math.min(p.a.current,p.b.current,p.b.previous)>=5 && !used.has(p.a.name)).sort((x,y)=>y.a.change-x.a.change)[0]
    if (divergent) create(divergent,'divergent')
    const cooling = pairs.filter(p=>p.a.change<=-5 && p.b.change<0 && Math.min(p.a.previous,p.b.previous,p.a.current,p.b.current)>=5 && !used.has(p.a.name)).sort((x,y)=>x.a.change-y.a.change)[0]
    if (cooling) create(cooling,'cooling')
  }
  for (const tk of valid.filter(c=>c.key.endsWith(':tiktok-hot'))) {
    const g = [...tk.genres].filter(g=>g.current/tk.currentWorks>=.4 && g.previous/tk.previousWorks>=.4 && Math.abs(g.change)<=5 && !used.has(g.name)).sort((a,b)=>b.current-a.current)[0]
    if (!g) continue
    used.add(g.name)
    findings.unshift({id:`${tk.key}:stable:${g.name}`,genre:g.name,title:`${g.name}：两期热播样本的稳定内容底盘`,decision:'保留常规收稿',facts:[fact(tk,g)],judgment:'两期均保持较高覆盖，但没有明显份额突破。适合作为常规内容研究方向，而非新蓝海；标签多选，不能把各题材份额相加。',development:`从下方${g.name}作品各拆1个开篇冲突，比较人物关系与情绪兑现方式；将核验后的差异点写入定向收稿要求，不只要求“热门题材”。`,advertising:'先确认剧场号、语言和目标国家；对照既有素材测试不同关系冲突的开篇。播放增量不等于自然流量，也不证明付费转化。',validation:'若下一期份额显著下降或作品内容与标签不符，重新评估常规收稿权重。未经内容核验，不推断具体剧情与制作成本。',cases:cases(tk.current!,g.name,tk.sampleSize),cautions:cautions([tk])})
  }
  if (!findings.length) {
    const sample = samples.find(s=>!s.issues.length && s.ai.length && s.key.endsWith(':tiktok-hot')) || samples.find(s=>!s.issues.length && s.ai.length)
    if (sample) {
      const byTitle = new Map<string,Set<string>>()
      sample.ai.forEach(r=>{ const title=String(r[sample.titleKey] ?? '').trim().toLowerCase();if(!title)return;const set=byTitle.get(title)||new Set<string>();tags(r,sample.tagKey).forEach(t=>{if(t&&!['AI仿真人','男频','女频'].includes(t))set.add(t)});byTitle.set(title,set) })
      const counts = new Map<string,number>();byTitle.forEach(ts=>ts.forEach(t=>counts.set(t,(counts.get(t)||0)+1)))
      const lead=[...counts].sort((a,b)=>b[1]-a[1])[0]
      if(lead) findings.push({id:`${sample.key}:observe:${lead[0]}`,genre:lead[0],title:`${lead[0]}：本期重点观察对象`,decision:'观察与补证',facts:[`${sample.name}｜${sample.period}原榜Top${sample.rows.length}内，${lead[1]}/${byTitle.size}部AI去重作品含该标签（${share(lead[1],byTitle.size)}%）。`],judgment:'目前没有满足研判规则的跨榜变化或稳定结构证据。本期标签覆盖可用于选择研究对象，不能据此宣称趋势或提高投放预算。',development:`先核对下方${lead[0]}对标作品的原文与素材，记录开篇冲突和差异点，作为待评估选题。`,advertising:'补齐同周期、同范围的投放和热播数据，再判断是否值得测试；本期不提供扩量建议。',validation:'补齐可比历史榜单，并复核标签及目标市场。',cases:cases(sample,lead[0],sample.rows.length),cautions:[]})
    }
  }
  const limitations = [
    ...comparisons.filter(c=>c.reason).map(c=>`${c.name}：${c.reason}。`),
    ...samples.flatMap(s=>s.issues.map(issue=>`${s.name}：${issue}。`)),
    '结论只覆盖榜单内明确标注“AI仿真人”的样本；未标注作品不自动推定为真人或AI。英文标题不等于北美受众。',
    '题材占比按同榜同月同名作品去重计算；跨榜不相加。当前没有收入、成本、转化和完整剧情证据，投放建议是测试方案，不是预算或收益预测。',
  ]
  return {findings:findings.slice(0,6),limitations:[...new Set(limitations)],method:'研究筛选规则：两期各至少20部AI去重作品；同向上升至少各3个百分点、当期各至少5部；投放扩张/热播未升须投放至少+3个百分点且热播两期各至少5部；回落须投放至少−5个百分点、热播下降且两榜两期各至少5部；稳定底盘须两期占比均≥40%、变化≤5个百分点。每类取1项：同向取两榜较小涨幅最高者，分歧及回落按投放占比变化幅度排序，稳定取当期覆盖最高者。情感、逆袭、复仇、打脸虐渣、虐恋、甜宠为通用叙事标签，保留在分榜比较，不单独决定新增或缩减收稿赛道。这些是研究队列门槛，不是统计显著性或商业评分。'}
}
