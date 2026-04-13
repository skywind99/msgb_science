import { posts, type Post, type InsertPost } from "../shared/schema.js";
import { db } from "./db.js";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getPosts(category?: string): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, post: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
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
}

export const storage = new DatabaseStorage();