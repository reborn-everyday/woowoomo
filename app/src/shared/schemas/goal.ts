import { z } from 'zod'

import { ACTIVITY_CATEGORIES } from '../types'

export const GoalSuccessMetricValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
])

export const GoalSuccessMetricSchema = z.record(z.string(), GoalSuccessMetricValueSchema)

export const GoalSchema = z.object({
  goal_text: z.string().min(1),
  target_behaviors: z.array(z.enum(ACTIVITY_CATEGORIES)).min(1),
  anti_behaviors: z.array(z.enum(ACTIVITY_CATEGORIES)).default([]),
  success_metric: GoalSuccessMetricSchema.default({})
})
