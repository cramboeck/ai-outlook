import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMsal } from '@azure/msal-react';
import { graphScopes } from '../config/msalConfig';
import { initGraphClient, getMasterCategories, createMasterCategory } from '../services/graphService';
import { getActiveCategories } from '../services/categoryService';

export const useCategories = () => {
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

  // Lade vorhandene Master-Kategorien
  const categoriesQuery = useQuery({
    queryKey: ['masterCategories'],
    queryFn: async () => {
      const token = await getAccessToken();
      initGraphClient(token);
      const result = await getMasterCategories();
      return result.value;
    },
    enabled: accounts.length > 0,
  });

  // Erstelle eine neue Master-Kategorie
  const createCategoryMutation = useMutation({
    mutationFn: async ({ displayName, color }: { displayName: string; color: string }) => {
      const token = await getAccessToken();
      initGraphClient(token);
      await createMasterCategory(displayName, color);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masterCategories'] });
    },
  });

  // Prüfe und erstelle fehlende MailSort-Kategorien (uses active categories - default or custom)
  const ensureMailSortCategories = async () => {
    const existing = categoriesQuery.data || [];
    // Graph API returns 'displayName', not 'name'
    const existingNames = existing.map((c: any) => c.displayName || c.name);

    // Use active categories (custom if enabled, otherwise defaults)
    const activeCategories = getActiveCategories();

    for (const category of activeCategories) {
      if (!existingNames.includes(category.name)) {
        try {
          await createCategoryMutation.mutateAsync({
            displayName: category.name,
            color: category.color,
          });
        } catch (error) {
          // Ignore "CategoryNameExists" error - category already exists
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('CategoryNameExists') && !errorMessage.includes('already exists')) {
            throw error;
          }
        }
      }
    }
    // Refresh the list after sync
    queryClient.invalidateQueries({ queryKey: ['masterCategories'] });
  };

  return {
    masterCategories: categoriesQuery.data || [],
    isLoading: categoriesQuery.isLoading,
    isError: categoriesQuery.isError,
    createCategory: createCategoryMutation.mutate,
    isCreating: createCategoryMutation.isPending,
    ensureMailSortCategories,
    mailSortCategories: getActiveCategories(),
  };
};
