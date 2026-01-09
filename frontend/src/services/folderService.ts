import type { MailFolder } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

export interface FolderWithPath extends MailFolder {
  path: string;
  depth: number;
}

export interface FolderSuggestion {
  suggestedFolderId: string | null;
  suggestedFolderPath: string | null;
  confidence: number;
  reasoning: string;
  alternativeFolders: Array<{
    folderId: string;
    folderPath: string;
    confidence: number;
  }>;
}

// Build folder hierarchy with paths
export function buildFolderHierarchy(
  folders: MailFolder[],
  parentId?: string,
  parentPath: string = '',
  depth: number = 0
): FolderWithPath[] {
  const result: FolderWithPath[] = [];

  const children = folders.filter(f =>
    parentId ? f.parentFolderId === parentId : !f.parentFolderId
  );

  for (const folder of children) {
    const path = parentPath ? `${parentPath}/${folder.displayName}` : folder.displayName;

    result.push({
      ...folder,
      path,
      depth,
    });

    // Recursively add children
    if (folder.childFolderCount > 0) {
      const childFolders = buildFolderHierarchy(folders, folder.id, path, depth + 1);
      result.push(...childFolders);
    }
  }

  return result;
}

// Suggest folder for an email
export async function suggestFolder(
  email: {
    subject: string;
    senderEmail: string;
    senderName: string;
    bodyPreview: string;
  },
  folders: FolderWithPath[]
): Promise<FolderSuggestion> {
  const response = await fetch(`${API_URL}/suggest-folder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      folders: folders.map(f => ({
        id: f.id,
        displayName: f.displayName,
        path: f.path,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Folder suggestion failed');
  }

  return response.json();
}

// Get icon name based on folder name
export function getFolderIcon(folderName: string): string {
  const name = folderName.toLowerCase();

  if (name.includes('inbox') || name.includes('posteingang')) return 'inbox';
  if (name.includes('sent') || name.includes('gesendet')) return 'send';
  if (name.includes('draft') || name.includes('entwü')) return 'file-edit';
  if (name.includes('deleted') || name.includes('gelöscht') || name.includes('papierkorb')) return 'trash-2';
  if (name.includes('archiv')) return 'archive';
  if (name.includes('junk') || name.includes('spam')) return 'alert-circle';
  if (name.includes('partner')) return 'users';
  if (name.includes('kunde') || name.includes('customer') || name.includes('client')) return 'briefcase';
  if (name.includes('hersteller') || name.includes('vendor')) return 'building';
  if (name.includes('finanz') || name.includes('finance') || name.includes('rechnung')) return 'credit-card';
  if (name.includes('privat') || name.includes('personal')) return 'user';
  if (name.includes('monitoring') || name.includes('notification')) return 'bell';

  return 'folder';
}
