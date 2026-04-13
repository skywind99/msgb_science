import { z } from "zod";
import { insertPostSchema, posts } from "./schema.js";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  posts: {
    list: {
      method: "GET" as const,
      path: "/api/posts" as const,
      input: z.object({ category: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof posts.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/posts/:id" as const,
      responses: {
        200: z.custom<typeof posts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/posts" as const,
      input: insertPostSchema,
      responses: {
        201: z.custom<typeof posts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/posts/:id" as const,
      input: insertPostSchema.partial(),
      responses: {
        200: z.custom<typeof posts.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/posts/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type PostInput = z.infer<typeof api.posts.create.input>;
export type PostUpdateInput = z.infer<typeof api.posts.update.input>;
export type PostResponse = z.infer<typeof api.posts.create.responses[201]>;
export type PostsListResponse = z.infer<typeof api.posts.list.responses[200]>;