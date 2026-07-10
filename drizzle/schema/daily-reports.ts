import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core"
import { users } from "./users"

export const dailyReports = pgTable("daily_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  content: text("content").notNull(),
  summary: text("summary"),
  sentToLark: boolean("sent_to_lark").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
