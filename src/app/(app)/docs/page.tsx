"use client"

import { useState, useRef, useCallback } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { useDocuments, DOC_CATEGORIES, CAT_EMOJI, type Document } from "@/hooks/use-documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BookOpen, Plus, Search, Trash2, Edit3, Save, X, Upload, Copy,
  FileText, Tag, FolderOpen, Eye, ChevronRight, Loader2, CheckCircle, FileUp
} from "lucide-react"

type ProcessedFile = {
  title: string
  content: string
  category: string
  size: number
  _htmlUri?: string
}

export default function DocsPage() {
  const { documents, loading, error, addDocument, updateDocument, deleteDocument, fetchDocuments } = useDocuments()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCat, setFilterCat] = useState("全部")
  const [showAdd, setShowAdd] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Add form
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newCat, setNewCat] = useState("技术文档")
  const [newTags, setNewTags] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{name: string; title: string; content: string; category: string; size: number; key: string; _htmlUri?: string}[]>([])
  const fileRefs = useRef<Map<string, File>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit form
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")

  const filtered = documents.filter(d => {
    const matchCat = filterCat === "全部" || d.category === filterCat
    return matchCat
  })

  const handleSearch = () => {
    fetchDocuments(searchQuery || undefined, filterCat === "全部" ? undefined : filterCat)
  }

  const autoCategorize = (name: string): string => {
    if (/周报|weekly/i.test(name)) return "周报"
    if (/日报|daily/i.test(name)) return "日报"
    if (/制度|规定|办法|标准|规范|手册/i.test(name)) return "制度文件"
    if (/纪要|会议|meeting/i.test(name)) return "会议纪要"
    if (/模板|template/i.test(name)) return "模板"
    if (/技术|方案|设计|spec|架构|api/i.test(name)) return "技术文档"
    return "其他"
  }

  const processFile = async (file: File): Promise<ProcessedFile> => {
    const name = file.name.replace(/\.[^.]+$/, "")
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    const category = autoCategorize(name)
    const textExts = ["txt", "md", "csv", "json", "xml", "yaml", "yml", "log", "html", "css", "js", "ts", "jsx", "tsx", "py", "java", "go", "rs", "sql", "sh", "bash", "zsh", "env", "config", "ini", "cfg", "toml"]

    if (textExts.includes(ext)) {
      return { title: name, content: await file.text(), category, size: file.size }
    }
    if (ext === "docx") {
      try {
        const mammoth = await import("mammoth")
        const arrayBuffer = await file.arrayBuffer()
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;padding:24px;line-height:1.8;max-width:800px;margin:0 auto;color:#333}h1,h2,h3{color:#1a1a2e}p{margin:0.8em 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}img{max-width:100%}</style></head><body>${htmlResult.value}</body></html>`
        const htmlBlob = new Blob([html], { type: "text/html" })
        const reader = new FileReader()
        const htmlUri = await new Promise<string>(resolve => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(htmlBlob) })
        // Also extract plain text for search
        const textResult = await mammoth.extractRawText({ arrayBuffer })
        return { title: name, content: textResult.value, category, size: file.size, _htmlUri: htmlUri }
      } catch {
        return { title: name, content: `[DOCX: ${file.name}]`, category, size: file.size }
      }
    }
    if (["pptx", "ppt"].includes(ext)) {
      try {
        const JSZip = (await import("jszip")).default
        const zip = await JSZip.loadAsync(file)
        const slides: string[] = []
        const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml/)).sort()
        for (const sf of slideFiles.slice(0, 30)) {
          const xml = await zip.file(sf)?.async("text")
          if (xml) {
            const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            if (text) {
              const num = sf.match(/slide(\d+)/)?.[1] || ""
              slides.push(`第${num}页: ${text}`)
            }
          }
        }
        const content = slides.length > 0
          ? slides.join("\n\n")
          : `[PPTX: ${file.name}]\n无法提取文字内容。`
        return { title: name, content, category, size: file.size }
      } catch {}
      return { title: name, content: `[PPTX: ${file.name}]\n无法解析，请手动编辑。`, category, size: file.size }
    }
    return {
      title: name,
      content: `[${ext.toUpperCase()} 文件: ${file.name}, ${(file.size / 1024).toFixed(0)} KB]\n已归档至知识库。`,
      category,
      size: file.size,
    }
  }

  const processFiles = async (files: FileList | File[]) => {
    setFileLoading(true)
    setMsg("")
    const results: {name: string; title: string; content: string; category: string; size: number; key: string; _htmlUri?: string}[] = []
    for (const file of Array.from(files)) {
      try {
        const r = await processFile(file)
        const key = `${Date.now()}-${Math.random()}`
        fileRefs.current.set(key, file)
        results.push({ key, name: file.name, ...r })
      } catch {}
    }
    setPendingFiles(prev => [...prev, ...results])
    setFileLoading(false)
    setMsg(`已识别 ${results.length} 个文件`)
    setTimeout(() => setMsg(""), 3000)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleBatchSave = async () => {
    if (pendingFiles.length === 0) return
    setSaving(true)
    setMsg("")
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("未登录")

      let saved = 0
      for (const f of pendingFiles) {
        try {
          let dataUri = ""
          let fileType = "text"

          // Generate data URI for preview
          if (f.key) {
            const file = fileRefs.current.get(f.key)
            if (file) {
              // Use HTML preview for DOCX
              if ((f as any)._htmlUri) {
                dataUri = (f as any)._htmlUri
                fileType = "html"
              } else {
                const buffer = await file.arrayBuffer()
                const bytes = new Uint8Array(buffer)
                let binary = ""
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
                const base64 = btoa(binary)
                dataUri = `data:${file.type};base64,${base64}`
                fileType = file.name.split(".").pop()?.toLowerCase() || "text"
              }
            }
          }

          const body: any = {
            userId: user.user.id,
            title: f.title,
            content: f.content,
            category: f.category,
            tags: f.category,
            file_url: dataUri || null,
            file_type: fileType,
          }

          const resp = await fetch(`${window.location.origin}/api/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          const data = await resp.json()
          if (!resp.ok) throw new Error(data.error)
          saved++
        } catch (e: any) { console.error("Save failed:", e) }
      }
      setPendingFiles([])
      fileRefs.current.clear()
      setMsg(`已保存 ${saved} 个文档到知识库`)
      fetchDocuments()
      setTimeout(() => setMsg(""), 3000)
    } catch (e: any) {
      setMsg(`保存失败: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const removePendingFile = (i: number) => {
    const item = pendingFiles[i]
    if (item?.key) fileRefs.current.delete(item.key)
    setPendingFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setSaving(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("未登录")
      await addDocument({
        userId: user.user.id,
        title: newTitle,
        content: newContent,
        category: newCat,
        tags: newTags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      })
      setNewTitle(""); setNewContent(""); setNewTags(""); setShowAdd(false)
      setMsg("文档已添加")
      setTimeout(() => setMsg(""), 2000)
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  const handleEdit = (doc: Document) => {
    setEditingId(doc.id)
    setEditTitle(doc.title)
    setEditContent(doc.content || "")
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    await updateDocument(editingId, { title: editTitle, content: editContent })
    setEditingId(null)
    setSelectedDoc(null)
    setMsg("已更新")
    setTimeout(() => setMsg(""), 2000)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此文档？")) return
    await deleteDocument(id)
    if (selectedDoc?.id === id) setSelectedDoc(null)
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <PageHero eyebrow="Your editorial archive." title="Docs 文档知识库" description={`${documents.length} 项内容 · 当前复用文档知识库`} action={
          <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="gap-1.5 bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff76]">
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAdd ? "取消" : "新建文档"}
          </Button>
        } />

        {/* Message */}
        {msg && (
          <div className={`text-sm p-2 rounded ${msg.includes("失败") ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
            {msg}
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索文档标题或内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={handleSearch} size="sm">搜索</Button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DOC_CATEGORIES.map(cat => (
            <Badge
              key={cat}
              variant={filterCat === cat ? "default" : "outline"}
              className="cursor-pointer text-[11px]"
              onClick={() => { setFilterCat(cat); fetchDocuments(undefined, cat === "全部" ? undefined : cat) }}
            >
              {CAT_EMOJI[cat]} {cat}
            </Badge>
          ))}
        </div>

        {/* Add Panel */}
        {showAdd && (
          <Card>
            <CardHeader><CardTitle className="text-base">新建文档</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="*/*" multiple />
                {fileLoading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> 正在读取文件...
                  </div>
                ) : (
                  <div className="space-y-1">
                    <FileUp className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">拖拽多个文件到此处，或点击选择</p>
                    <p className="text-[11px] text-muted-foreground">支持 TXT / MD / DOCX / PDF / PPT / XLS 等任意格式</p>
                  </div>
                )}

              {/* Pending files list */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50 group">
                      <span className="shrink-0">{CAT_EMOJI[f.category] || "📁"}</span>
                      <span className="flex-1 font-medium truncate">{f.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{f.category}</Badge>
                      <span className="text-[10px] text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => removePendingFile(i)} className="opacity-0 group-hover:opacity-100 shrink-0">
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                  <Button onClick={handleBatchSave} disabled={saving} size="sm" className="w-full mt-2">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    一键保存 {pendingFiles.length} 个文档到知识库
                  </Button>
                </div>
              )}
            </div>

              <Input placeholder="文档标题" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              <div className="flex gap-2">
                <select value={newCat} onChange={e => setNewCat(e.target.value)}
                  className="text-sm border rounded-md px-3 py-1.5 bg-background">
                  {DOC_CATEGORIES.filter(c => c !== "全部").map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                </select>
                <Input placeholder="标签，逗号分隔" value={newTags} onChange={e => setNewTags(e.target.value)} className="flex-1" />
              </div>
              <Textarea
                placeholder="或直接粘贴文档内容..."
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={10}
                className="resize-none"
              />
              <Button onClick={handleAdd} disabled={saving} size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                保存到知识库
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main: Document list + detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">文档列表 ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[500px] overflow-y-auto divide-y">
              {loading ? (
                <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无文档</div>
              ) : filtered.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  onDoubleClick={() => {
                    if (doc.file_url) {
                      window.open(doc.file_url, "_blank")
                    }
                  }}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                    selectedDoc?.id === doc.id ? "bg-muted/70 border-l-2 border-violet-500" : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0 mt-0.5">{CAT_EMOJI[doc.category || "其他"]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{doc.standardized_title || doc.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{doc.category}</span>
                        <span className="text-[10px] text-muted-foreground">· {doc.updated_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Detail / Edit */}
          <div className="lg:col-span-2">
            {editingId ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">编辑文档</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="h-4 w-4 mr-1" />取消</Button>
                    <Button size="sm" onClick={handleSaveEdit}><Save className="h-4 w-4 mr-1" />保存</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={16} className="resize-none" />
                </CardContent>
              </Card>
            ) : selectedDoc ? (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span>{CAT_EMOJI[selectedDoc.category || "其他"]}</span>
                      <CardTitle className="text-lg">{selectedDoc.standardized_title || selectedDoc.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{selectedDoc.category}</Badge>
                      {selectedDoc.file_type && selectedDoc.file_type !== "text" && (
                        <Badge variant="secondary" className="text-[10px] uppercase">{selectedDoc.file_type}</Badge>
                      )}
                      {selectedDoc.tags?.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      <span className="text-[10px] text-muted-foreground">{selectedDoc.updated_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(selectedDoc)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(selectedDoc.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Inline preview for natively supported formats */}
                  {selectedDoc.file_url && (
                    <FileViewer url={selectedDoc.file_url} fileType={selectedDoc.file_type} title={selectedDoc.title} />
                  )}
                  {/* Text content — primary view for all documents */}
                  <DocumentContent content={selectedDoc.content || ""} />
                  {/* Download link — secondary, for all files with data URI */}
                  {selectedDoc.file_url && (
                    <a
                      href={selectedDoc.file_url}
                      download={selectedDoc.title}
                      className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors w-fit"
                    >
                      <FileUp className="h-4 w-4" />
                      下载原始文件 ({selectedDoc.file_type?.toUpperCase() || "文件"})
                    </a>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">选择一篇文档查看</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">或点击「新建文档」开始</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function DocumentContent({ content }: { content: string }) {
  if (!content) return <p className="text-sm text-muted-foreground italic">空文档</p>

  // Check if it's a binary file placeholder
  const binaryMatch = content.match(/^\[(PDF|DOCX|PPTX|XLSX|PPT|XLS)\s*(?:文件)?:\s*(.+?)\]/)
  if (binaryMatch) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium">{binaryMatch[2]}</p>
        <Badge variant="secondary">{binaryMatch[1]} 文件</Badge>
        <p className="text-xs text-muted-foreground">已归档至知识库</p>
      </div>
    )
  }

  // Split into paragraphs and render with formatting
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {paragraphs.map((para, i) => {
        const lines = para.split("\n")
        const firstLine = lines[0].trim()

        // Section header with emoji
        if (/^[📌📖💡🚀🛠️💬🤖📰🔧🧠🌱🔥⚡📋✅⚠️💪🎯📄📊]/.test(firstLine)) {
          return (
            <div key={i} className="pt-2">
              <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-2">
                <span>{firstLine.slice(0, 2)}</span>
                <span>{firstLine.slice(2).trim()}</span>
              </h4>
              {lines.slice(1).join("\n").trim() && (
                <div className="pl-5 border-l-2 border-muted mt-1">
                  <FormatLines text={lines.slice(1).join("\n").trim()} />
                </div>
              )}
            </div>
          )
        }

        // Chinese numbered sections (一、二、三、四、)
        if (/^[一二三四五六七八九十]、/.test(firstLine)) {
          return (
            <div key={i} className="pt-1">
              <h4 className="text-sm font-semibold mb-1">{firstLine}</h4>
              {lines.slice(1).join("\n").trim() && (
                <div className="pl-4">
                  <FormatLines text={lines.slice(1).join("\n").trim()} />
                </div>
              )}
            </div>
          )
        }

        // Regular paragraph
        return (
          <div key={i}>
            <FormatLines text={para} />
          </div>
        )
      })}
    </div>
  )
}

function FileViewer({ url, fileType, title }: { url: string; fileType?: string | null; title: string }) {
  const ext = (fileType || "").toLowerCase()

  // PDF, PPTX, DOCX, XLSX — try iframe with native rendering
  if (["pdf", "pptx", "ppt", "docx", "doc", "xlsx", "xls"].includes(ext)) {
    return (
      <div className="rounded-lg overflow-hidden border bg-white" style={{ height: 700 }}>
        <iframe src={url} className="w-full h-full" title={title} />
      </div>
    )
  }

  // Images
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return (
      <div className="rounded-lg overflow-hidden border bg-muted/20 flex items-center justify-center p-4">
        <img src={url} alt={title} className="max-w-full max-h-[500px] object-contain rounded" />
      </div>
    )
  }

  // Text files
  return (
    <div className="rounded-lg overflow-hidden border bg-white" style={{ height: 500 }}>
      <iframe src={url} className="w-full h-full" title={title} sandbox="allow-same-origin" />
    </div>
  )
}

function FormatLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, j) => {
        // Numbered items
        if (/^\d+[\.\、)]\s*/.test(line.trim())) {
          return <p key={j} className="text-sm leading-relaxed ml-2">{line.trim()}</p>
        }
        // Bullet points
        if (/^[·•●○]/.test(line.trim())) {
          return <p key={j} className="text-sm leading-relaxed ml-2 text-muted-foreground">{line.trim()}</p>
        }
        return <p key={j} className="text-sm leading-relaxed">{line.trim() || " "}</p>
      })}
    </>
  )
}
