import { z } from 'zod';

export const PushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
}).strict();

export const DeleteSubscriptionBody = z.object({
  endpoint: z.string().url(),
}).strict();

const DuePeriodSchema = z.object({
  value: z.number().int().positive(),
  unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
}).strict();

export const PushScheduleBody = z.object({
  title: z.string().min(1),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  duePeriod: DuePeriodSchema.optional(),
  trigger: z.enum(['at-due-time']),
}).strict();

export type PushScheduleInput = z.infer<typeof PushScheduleBody>;
