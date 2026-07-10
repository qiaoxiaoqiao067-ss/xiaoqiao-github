import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core"
import { users } from "./users"

export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  completed: boolean("completed").default(false).notNull(),
  priority: integer("priority").default(0).notNull(), // 0=normal, 1=high, 2=urgent
  dueDate: timestamp("due_date"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
})
