import type { Tag } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface TagResponse {
  tags: string[];
}

interface PopularTagsResponse {
  tags: Tag[];
}

export function useTags(postId?: string) {
  const queryClient = useQueryClient();

  const { data: popularTags } = useQuery<PopularTagsResponse>({
    queryKey: ["popularTags"],
    queryFn: async () => {
      const res = await fetch("/api/tags/popular");
      return res.json();
    }
  });

  const { data: suggestions } = useQuery<TagResponse>({
    queryKey: ["tagSuggestions"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      return res.json();
    },
    enabled: false
  });

  const searchTags = async (query: string) => {
    if (!query.trim()) {
      queryClient.setQueryData(["tagSuggestions"], { tags: [] });
      return;
    }
    const res = await fetch(`/api/tags?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    queryClient.setQueryData(["tagSuggestions"], data);
    return data;
  };

  const updateTags = useMutation({
    mutationFn: async (tags: string[]) => {
      if (!postId) {
        return { tags: tags.map((tag) => ({ name: tag })) };
      }

      const res = await fetch(`/api/posts/${postId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags })
      });

      if (!res.ok) {
        throw new Error("Failed to update tags");
      }
      return res.json();
    },
    onMutate: async (newTags) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["post", postId] });
      await queryClient.cancelQueries({ queryKey: ["popularTags"] });

      // Snapshot the previous value
      const previousTags = queryClient.getQueryData(["post", postId]);

      // Optimistically update
      if (postId) {
        queryClient.setQueryData(["post", postId], (old: any) => ({
          ...old,
          tags: newTags.map((tag) => ({ id: tag, name: tag }))
        }));
      }

      return { previousTags };
    },

    // biome-ignore lint/correctness/noUnusedVariables: ignore
    onError: (err, newTags, context) => {
      // Rollback on error
      if (postId && context?.previousTags) {
        queryClient.setQueryData(["post", postId], context.previousTags);
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["popularTags"] });
    }
  });

  return {
    popularTags: popularTags?.tags ?? [],
    suggestions: suggestions?.tags ?? [],
    searchTags,
    updateTags
  };
}