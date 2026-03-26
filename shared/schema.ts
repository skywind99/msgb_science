import { pgTable, text, serial, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contentBlockSchema = z.object({
  imageUrl: z.string().optional(),
  content: z.string().optional(),
});
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  blocks: json("blocks").$type<ContentBlock[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts, {
  blocks: z.array(contentBlockSchema).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export type InsertPost = z.infer<typeof insertPostSchema>;
export type UpdatePostRequest = Partial<InsertPost>;
export type Post = typeof posts.$inferSelect;
