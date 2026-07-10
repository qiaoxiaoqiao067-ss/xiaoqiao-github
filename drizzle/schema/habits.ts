import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core"
import { users } from "./users"

export const habits = pgTable("habits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(), // e.g. "写日报", "写TODO", "学习AI要点"
  streak: integer("streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastCheckedDate: text("last_checked_date"), // YYYY-MM-DD
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const habitLogs = pgTable("habit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  habitId: uuid("habit_id").notNull().references(() => habits.id),
  date: text("date").notNull(), // YYYY-MM-DD
  completed: boolean("completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
