import { serviceClient } from "../src/lib/supabase/service"
import { projectStageProgress, type ProjectStage } from "../src/lib/projects/stages"

type SourceProject = {
  projectNo: number
  title: string
  stage: ProjectStage
  knownId?: string
  legacyTitles?: string[]
}

const SOURCE_PROJECTS: SourceProject[] = [
  { projectNo: 1, title: "糟了！我的新娘竟是黑手党教父", stage: "AI制作", knownId: "c449c67b-b470-451a-8d19-7dd28335651d", legacyTitles: ["糟了我的新娘竟是黑手党教父"] },
  { projectNo: 2, title: "改嫁死神，我与全家至死两清", stage: "AI制作", knownId: "0da37f4d-2209-470c-b3bc-ed7536b872cf" },
  { projectNo: 3, title: "被卖十五年，黑帮女王开始复仇", stage: "AI制作", knownId: "ed3120a3-345f-4a1d-a500-f65fb7a71c6c" },
  { projectNo: 4, title: "他只对我有反应", stage: "本地化", knownId: "b93823fc-c453-4356-9ef7-8aae373d444d" },
  { projectNo: 5, title: "黑帮教父的杀手新娘", stage: "剧本开发", knownId: "08aa331f-7e78-4d70-8c99-55d29bb583c1" },
  { projectNo: 6, title: "午夜别吻圣诞老人", stage: "剧本开发", knownId: "da71dd2f-306b-4568-8db6-b4ef5aa40b87" },
  { projectNo: 7, title: "他教我出轨", stage: "剧本开发" },
  { projectNo: 8, title: "误入精灵世界当保姆，我读懂公主婴语", stage: "剧本开发", knownId: "fa498332-801c-4275-a29e-f84a69446454", legacyTitles: ["误入精灵世界，我读懂婴儿婴语"] },
]

async function main() {
  const { data: existing, error } = await serviceClient.from("projects").select("id,user_id,title,project_no")
  if (error) throw error
  if (!existing?.length) throw new Error("未找到可同步的项目")

  const ownerId = existing.find((project) => SOURCE_PROJECTS.some((source) => source.knownId === project.id))?.user_id
  if (!ownerId) throw new Error("无法确认项目所有者，已停止同步")

  const owned = existing.filter((project) => project.user_id === ownerId)
  const targets = SOURCE_PROJECTS.map((source) => ({
    source,
    row: owned.find((project) => project.id === source.knownId)
      || owned.find((project) => project.title === source.title || source.legacyTitles?.includes(project.title)),
  }))

  // 先移至临时编号，再一次性写回P001—P008，避免唯一索引冲突；脚本可重复执行。
  for (const [index, target] of targets.entries()) {
    if (!target.row) continue
    const { error: temporaryError } = await serviceClient.from("projects").update({ project_no: 9001 + index }).eq("id", target.row.id).eq("user_id", ownerId)
    if (temporaryError) throw temporaryError
  }

  for (const target of targets) {
    const values = {
      title: target.source.title,
      project_no: target.source.projectNo,
      stage: target.source.stage,
      progress: projectStageProgress(target.source.stage),
      status: "active",
      updated_at: new Date().toISOString(),
    }
    if (target.row) {
      const { error: updateError } = await serviceClient.from("projects").update(values).eq("id", target.row.id).eq("user_id", ownerId)
      if (updateError) throw updateError
      continue
    }
    const { data: inserted, error: insertError } = await serviceClient.from("projects").insert({ ...values, user_id: ownerId }).select("id").single()
    if (insertError) throw insertError
    target.row = { id: inserted.id, user_id: ownerId, title: values.title, project_no: values.project_no }
  }

  const { data: verified, error: verifyError } = await serviceClient.from("projects").select("project_no,title,stage,progress").eq("user_id", ownerId).order("project_no")
  if (verifyError) throw verifyError
  console.table(verified)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
