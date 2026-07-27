import { z } from "zod";
import {
  applyRequestSchema,
  createPostSchema,
  lookupApplicationSchema,
  updateApplicationSchema,
  updatePostSchema,
  type ApplicationSummary,
  type ApplyResponse,
  type CancelResponse,
  type LookupResponse,
  type PublicPost,
  type RosterEntry,
  type RosterResponse,
} from "./schema.js";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  /** 요청 제한. `Retry-After` 헤더가 함께 온다. */
  tooMany: z.object({ message: z.string(), retryAfter: z.number() }),
};

export const api = {
  posts: {
    list: {
      method: "GET" as const,
      path: "/api/posts" as const,
      input: z.object({ category: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<PublicPost>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/posts/:id" as const,
      responses: {
        200: z.custom<PublicPost>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/posts" as const,
      input: createPostSchema,
      responses: {
        201: z.custom<PublicPost>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/posts/:id" as const,
      input: updatePostSchema,
      responses: {
        200: z.custom<PublicPost>(),
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

  // 학생용 신청 API. 계정이 없으므로 모두 공개 경로다.
  // 개별 신청자를 반환하는 것은 확인 비밀번호가 맞은 lookup 하나뿐이다.
  applications: {
    apply: {
      method: "POST" as const,
      path: "/api/posts/:id/apply" as const,
      input: applyRequestSchema,
      responses: {
        201: z.custom<ApplyResponse>(),
        400: errorSchemas.validation,
        403: errorSchemas.validation, // 신청 비밀번호 불일치
        404: errorSchemas.notFound,
        409: errorSchemas.validation, // 중복 신청 · 정원 마감
        429: errorSchemas.tooMany,
      },
    },
    lookup: {
      method: "POST" as const,
      path: "/api/applications/lookup" as const,
      input: lookupApplicationSchema,
      responses: {
        200: z.custom<LookupResponse>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        429: errorSchemas.tooMany,
      },
    },
    cancel: {
      method: "POST" as const,
      path: "/api/applications/cancel" as const,
      input: lookupApplicationSchema,
      responses: {
        200: z.custom<CancelResponse>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        429: errorSchemas.tooMany,
      },
    },
    summary: {
      method: "GET" as const,
      path: "/api/posts/:id/applications/summary" as const,
      responses: {
        200: z.custom<ApplicationSummary>(),
        404: errorSchemas.notFound,
      },
    },
    // 홈·일정 화면이 여러 활동의 남은 자리를 한 번에 받는다
    summaries: {
      method: "GET" as const,
      path: "/api/applications/summary" as const,
      responses: {
        200: z.array(z.custom<ApplicationSummary>()),
      },
    },
  },

  // 교사용 명단 관리. 담당 교사와 admin 만 통과한다.
  // 개별 신청자가 나가는 유일한 인증 경로다.
  roster: {
    list: {
      method: "GET" as const,
      path: "/api/posts/:id/applications" as const,
      responses: {
        200: z.custom<RosterResponse>(),
        401: errorSchemas.notFound,
        403: errorSchemas.notFound,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/applications/:id" as const,
      input: updateApplicationSchema,
      responses: {
        200: z.custom<RosterEntry>(),
        400: errorSchemas.validation,
        403: errorSchemas.notFound,
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: "DELETE" as const,
      path: "/api/applications/:id" as const,
      responses: {
        204: z.void(),
        403: errorSchemas.notFound,
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