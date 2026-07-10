import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./users"

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  content: text("content"),
  fileUrl: text("file_url"),
  fileType: text("file_type"), // docx, pdf, md, txt
  category: text("category"), // 技术文档, 会议纪要, 日报, 周报, 其他
  tags: text("tags").array(),
  standardizedTitle: text("standardized_title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
