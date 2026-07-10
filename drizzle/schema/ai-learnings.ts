import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core"
import { users } from "./users"

export const aiLearnings = pgTable("ai_learnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source"),
  sourceUrl: text("source_url"),
  category: text("category").notNull(), // 市场动态, 提示词, Skill, Agent, 其他
  difficulty: integer("difficulty").default(1), // 1=入门, 2=进阶, 3=实战
  date: text("date").notNull(), // YYYY-MM-DD
  notes: text("notes"), // user's personal notes
  learned: boolean("learned").default(false), // user marked as learned
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
