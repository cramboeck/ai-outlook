import { z } from 'zod';

const emailContextSchema = z.object({
  isReply: z.boolean().optional(),
  isForward: z.boolean().optional(),
  isDirectRecipient: z.boolean().optional(),
  ccCount: z.number().int().min(0).optional(),
  senderDomain: z.string().optional(),
  hasAttachments: z.boolean().optional(),
}).optional();

const categoryDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  keywords: z.array(z.string().max(50)).optional(),
});

// POST /api/classify
export const classifySchema = z.object({
  subject: z.string().max(1000).optional(),
  body: z.string().max(10000).optional(),
  sender: z.string().max(500).optional(),
  context: emailContextSchema,
  categories: z.array(categoryDefinitionSchema).max(20).optional(),
}).refine(data => data.subject || data.body, {
  message: 'Subject or body is required',
});

// POST /api/classify-batch
export const classifyBatchSchema = z.object({
  emails: z.array(z.object({
    id: z.string().min(1),
    subject: z.string().max(1000),
    body: z.string().max(10000),
    sender: z.string().max(500),
    context: emailContextSchema,
  })).min(1).max(20),
  categories: z.array(categoryDefinitionSchema).max(20).optional(),
});

// POST /api/extract-actions
export const extractActionsSchema = z.object({
  subject: z.string().max(1000).optional(),
  body: z.string().min(1).max(10000),
  sender: z.string().max(500).optional(),
  // Batch mode
  emails: z.array(z.object({
    id: z.string().min(1),
    subject: z.string().max(1000),
    body: z.string().max(10000),
    sender: z.string().max(500),
    receivedDateTime: z.string().optional(),
  })).max(20).optional(),
});

// POST /api/generate-reply
export const generateReplySchema = z.object({
  subject: z.string().max(1000),
  body: z.string().min(1).max(10000),
  sender: z.string().max(500),
  replyType: z.enum(['accept', 'decline', 'info', 'question', 'acknowledge']).optional(),
  tone: z.enum(['formal', 'casual', 'friendly', 'assertive']).optional(),
  intent: z.enum(['accept', 'decline', 'question', 'info', 'custom']).optional(),
  userName: z.string().max(200).optional(),
  senderName: z.string().max(200).optional(),
  additionalContext: z.string().max(2000).optional(),
  customInstruction: z.string().max(2000).optional(),
  emailId: z.string().optional(),
});

// POST /api/suggest-folder
export const suggestFolderSchema = z.object({
  subject: z.string().max(1000).optional(),
  body: z.string().max(10000).optional(),
  sender: z.string().max(500).optional(),
  folders: z.array(z.object({
    id: z.string().optional(),
    displayName: z.string().optional(),
    name: z.string().optional(),
  })).min(1).max(100),
});
