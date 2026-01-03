import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMsal } from '@azure/msal-react';
import { graphScopes } from '../config/msalConfig';
import {
  initGraphClient,
  getEmails,
  getEmailWithBody,
  setEmailCategory,
  setEmailCategoriesBatch,
} from '../services/graphService';
import type { Email } from '../types';

export const useEmails = (enabled: boolean = true) => {
  const { instance, accounts } = useMsal();
  const queryClient = useQueryClient();

  const getAccessToken = async (): Promise<string> => {
    if (accounts.length === 0) throw new Error('No account signed in');
    const response = await instance.acquireTokenSilent({
      ...graphScopes,
      account: accounts[0],
    });
    return response.accessToken;
  };

  const emailsQuery = useQuery({
    queryKey: ['emails'],
    queryFn: async () => {
      const token = await getAccessToken();
      initGraphClient(token);
      const result = await getEmails(100);
      return result.value;
    },
    enabled: enabled && accounts.length > 0,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const getEmailBody = async (messageId: string): Promise<Email> => {
    const token = await getAccessToken();
    initGraphClient(token);
    return getEmailWithBody(messageId);
  };

  const setCategoryMutation = useMutation({
    mutationFn: async ({ messageId, categories }: { messageId: string; categories: string[] }) => {
      const token = await getAccessToken();
      initGraphClient(token);
      await setEmailCategory(messageId, categories);
      return { messageId, categories };
    },
    onSuccess: ({ messageId, categories }) => {
      queryClient.setQueryData<Email[]>(['emails'], (old) =>
        old?.map((email) => (email.id === messageId ? { ...email, categories } : email))
      );
    },
  });

  const setCategoriesBatchMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; categories: string[] }>) => {
      const token = await getAccessToken();
      initGraphClient(token);
      await setEmailCategoriesBatch(updates);
      return updates;
    },
    onSuccess: (updates) => {
      queryClient.setQueryData<Email[]>(['emails'], (old) =>
        old?.map((email) => {
          const update = updates.find((u) => u.id === email.id);
          return update ? { ...email, categories: update.categories } : email;
        })
      );
    },
  });

  return {
    emails: emailsQuery.data || [],
    isLoading: emailsQuery.isLoading,
    isFetching: emailsQuery.isFetching,
    isRefreshing: emailsQuery.isFetching && !emailsQuery.isLoading,
    isError: emailsQuery.isError,
    error: emailsQuery.error,
    refetch: emailsQuery.refetch,
    getEmailBody,
    setCategory: setCategoryMutation.mutate,
    setCategoryAsync: setCategoryMutation.mutateAsync,
    isSetting: setCategoryMutation.isPending,
    setCategoriesBatch: setCategoriesBatchMutation.mutate,
    setCategoriesBatchAsync: setCategoriesBatchMutation.mutateAsync,
    isSettingBatch: setCategoriesBatchMutation.isPending,
  };
};

// Helper hook for email stats
export const useEmailStats = () => {
  const { emails, isLoading } = useEmails();

  const stats = {
    total: emails.length,
    uncategorized: emails.filter((e) => e.categories.length === 0).length,
    byCategory: emails.reduce(
      (acc, email) => {
        email.categories.forEach((cat) => {
          acc[cat] = (acc[cat] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>
    ),
  };

  return { stats, isLoading };
};
