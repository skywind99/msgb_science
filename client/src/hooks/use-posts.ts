import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type PostInput } from "@shared/routes";
import { useAdmin, useAuthHeaders } from "@/contexts/admin";

/**
 * 캐시 키에 넣는 로그인 신원.
 *
 * **`canDelete` 때문에 꼭 필요하다.** `queryClient` 의 `staleTime` 이 `Infinity`
 * 라 한 번 받은 응답을 다시 가져오지 않는다. 키가 같으면 로그인 전에 받은 본문
 * (`canDelete` 없음)이 로그인 뒤에도 그대로 쓰여서 삭제 메뉴가 안 보이고,
 * 반대로 로그아웃한 뒤에도 메뉴가 남는다.
 */
function useAuthKey(): string {
  const { user } = useAdmin();
  return user?.id ?? "anon";
}

// GET /api/posts
export function usePosts(category?: string) {
  const authHeaders = useAuthHeaders();
  // 키 뒤에 붙인다. `invalidateQueries({ queryKey: [path] })` 는 앞쪽만 보므로
  // 기존 무효화 호출이 그대로 동작한다.
  const authKey = useAuthKey();
  return useQuery({
    queryKey: [api.posts.list.path, category, authKey],
    queryFn: async () => {
      const url = new URL(api.posts.list.path, window.location.origin);
      if (category) {
        url.searchParams.set("category", category);
      }
      // 토큰을 보내야 서버가 `canDelete` 를 계산한다. 없으면 비로그인으로 본다.
      const res = await fetch(url.toString(), { credentials: "include", headers: authHeaders });
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      return api.posts.list.responses[200].parse(data);
    },
  });
}

// GET /api/posts/:id
export function usePost(id: number) {
  const authHeaders = useAuthHeaders();
  const authKey = useAuthKey();
  return useQuery({
    queryKey: [api.posts.get.path, id, authKey],
    queryFn: async () => {
      const url = buildUrl(api.posts.get.path, { id });
      const res = await fetch(url, { credentials: "include", headers: authHeaders });
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
  const authHeaders = useAuthHeaders();

  return useMutation({
    mutationFn: async (data: PostInput) => {
      const validated = api.posts.create.input.parse(data);
      const res = await fetch(api.posts.create.path, {
        method: api.posts.create.method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
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
