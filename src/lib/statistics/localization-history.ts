/** Legacy history is retained; this filter never mutates a record. */
export function localizationHistoryRows<T extends Record<string, unknown>>(rows: T[], ownerId: string, projectIds: Set<string>, kind: "job" | "file", projectId?: string) {
  return rows.filter(row => {
    if (row.user_id !== ownerId) return false
    const linkedProject = typeof row.project_id === "string" ? row.project_id : null
    if (projectId && linkedProject !== projectId) return false
    if (linkedProject) return projectIds.has(linkedProject)
    return kind === "job" && !projectId
  })
}

export function retiredLocalizationResponse() {
  return Response.json({ error: "本地化翻译流程已停用。请使用本地化字数统计；历史记录保留只读。", readOnly: true }, { status: 410, headers: { "Cache-Control": "no-store" } })
}
