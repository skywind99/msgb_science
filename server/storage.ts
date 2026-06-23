import { posts, popups, type Post, type InsertPost, type Popup, type InsertPopup } from "../shared/schema.js";
import { db } from "./db.js";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getPosts(category?: string): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, post: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
  getPopups(): Promise<Popup[]>;
  getActivePopups(): Promise<Popup[]>;
  createPopup(popup: InsertPopup): Promise<Popup>;
  updatePopup(id: number, popup: Partial<InsertPopup>): Promise<Popup | undefined>;
  deletePopup(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getPosts(category?: string): Promise<Post[]> {
    if (category) {
      return await db.select().from(posts).where(eq(posts.category, category)).orderBy(desc(posts.createdAt));
    }
    return await db.select().from(posts).orderBy(desc(posts.createdAt));
  }
  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }
  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(insertPost).returning();
    return post;
  }
  async updatePost(id: number, updatePost: Partial<InsertPost>): Promise<Post | undefined> {
    const [post] = await db.update(posts).set(updatePost).where(eq(posts.id, id)).returning();
    return post;
  }
  async deletePost(id: number): Promise<boolean> {
    const result = await db.delete(posts).where(eq(posts.id, id)).returning();
    return result.length > 0;
  }
  async getPopups(): Promise<Popup[]> {
    return await db.select().from(popups).orderBy(desc(popups.createdAt));
  }
  async getActivePopups(): Promise<Popup[]> {
    return await db.select().from(popups).where(eq(popups.active, true)).orderBy(desc(popups.createdAt));
  }
  async createPopup(popup: InsertPopup): Promise<Popup> {
    const [p] = await db.insert(popups).values(popup).returning();
    return p;
  }
  async updatePopup(id: number, popup: Partial<InsertPopup>): Promise<Popup | undefined> {
    const [p] = await db.update(popups).set(popup).where(eq(popups.id, id)).returning();
    return p;
  }
  async deletePopup(id: number): Promise<boolean> {
    const result = await db.delete(popups).where(eq(popups.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
