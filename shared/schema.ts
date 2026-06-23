import { pgTable, text, serial, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contentBlockSchema = z.object({
  imageUrl: z.string().optional(),
  content: z.string().optional(),
  youtubeUrl: z.string().optional(),
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

// ── 팝업 ──────────────────────────────────────────────────
export const popups = pgTable("popups", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPopupSchema = createInsertSchema(popups).omit({
  id: true,
  createdAt: true,
});

export type InsertPopup = z.infer<typeof insertPopupSchema>;
export type Popup = typeof popups.$inferSelect;
