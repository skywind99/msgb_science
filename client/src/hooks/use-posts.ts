import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type PostInput } from "@shared/routes";
import { useAdmin } from "@/contexts/admin";

// GET /api/posts
export function usePosts(category?: string) {
  return useQuery({
    queryKey: [api.posts.list.path, category],
    queryFn: async () => {
      const url = new URL(api.posts.list.path, window.location.origin);
      if (category) {
        url.searchParams.set("category", category);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      return api.posts.list.responses[200].parse(data);
    },
  });
}

// GET /api/posts/:id
export function usePost(id: number) {
  return useQuery({
    queryKey: [api.posts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.posts.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch post");
      const data = await res.json();
      return api.posts.get.responses[200].parse(data);
    },
    enabled: !!id,
  });
}

// POST /api/posts
export function useCreatePost() {
  const queryClient = useQueryClient();
  const { password } = useAdmin();

  return useMutation({
    mutationFn: async (data: PostInput) => {
      const validated = api.posts.create.input.parse(data);
      const res = await fetch(api.posts.create.path, {
        method: api.posts.create.method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const errorData = await res.json();
          const parsedError = api.posts.create.responses[400].parse(errorData);
          throw new Error(parsedError.message || "Validation failed");
        }
        if (res.status === 401) {
          throw new Error("관리자 권한이 필요합니다.");
        }
        throw new Error("Failed to create post");
      }
      const responseData = await res.json();
      return api.posts.create.responses[201].parse(responseData);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.posts.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.posts.list.path, variables.category] });
    },
  });
}
