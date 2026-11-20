import { serviceClient } from "../src/lib/supabase/service"

const SOURCE = [
  { project_no: 1, current_progress: "本地化已完成；制作剪辑推进", next_action: "完成60集初剪及修改", production_complete_date: "2026-11-26", launch_date: "2026-12-04" },
  { project_no: 2, current_progress: "60集双语稿精修完成，制作推进", next_action: "完成审核验收并上线", production_complete_date: "2026-11-26", launch_date: "2026-12-04" },
  { project_no: 3, current_progress: "中英双语稿精修至57集", next_action: "完成60集双语稿精修及验收", production_complete_date: "2026-11-26", launch_date: "2026-12-04" },
  { project_no: 4, current_progress: "本地化中", next_action: "完成60集完本并启动制作", production_complete_date: null, launch_date: null },
  { project_no: 5, current_progress: "30集", next_action: "12月推进", production_complete_date: null, launch_date: null },
  { project_no: 6, current_progress: "美术资产/剧本一卡", next_action: "尽快赶进度", production_complete_date: "2026-12-17", launch_date: "2026-12-25" },
  { project_no: 7, current_progress: "一卡", next_action: "承制", production_complete_date: null, launch_date: null },
  { project_no: 8, current_progress: "内部编剧完成1—55集正文（11/18）", next_action: "确认定稿并启动本地化", production_complete_date: null, launch_date: null },
] as const

async function main() {
  const { data: anchor, error: anchorError } = await serviceClient.from("projects").select("user_id").eq("project_no", 1).eq("title", "糟了！我的新娘竟是黑手党教父").maybeSingle()
  if (anchorError) throw anchorError
  if (!anchor?.user_id) throw new Error("无法确认项目所有者，已停止同步")

  for (const source of SOURCE) {
    const { error } = await serviceClient.from("projects").update({ ...source, updated_at: new Date().toISOString() }).eq("user_id", anchor.user_id).eq("project_no", source.project_no)
    if (error) throw error
  }

  const { data, error } = await serviceClient.from("projects").select("project_no,title,current_progress,next_action,production_complete_date,launch_date").eq("user_id", anchor.user_id).order("project_no")
  if (error) throw error
  console.table(data)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
