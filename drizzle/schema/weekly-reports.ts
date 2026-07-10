import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core"
import { users } from "./users"

export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  weekStart: text("week_start").notNull(), // Monday YYYY-MM-DD
  weekEnd: text("week_end").notNull(), // Friday YYYY-MM-DD
  content: text("content").notNull(),
  summary: text("summary"),
  pptUrl: text("ppt_url"),
  exported: boolean("exported").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
