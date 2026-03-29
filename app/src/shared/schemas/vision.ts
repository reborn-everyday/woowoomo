import { z } from 'zod'

import {
  ACTIVITY_CATEGORIES,
  LEGACY_TOOL_IN_VIDEO_VALUES,
  VISION_TASK_STATES
} from '../types'

export const VisionSchema = z.object({
  current_task: z.string().min(1),
  tool_in_video: z.enum(LEGACY_TOOL_IN_VIDEO_VALUES),
  category: z.enum(ACTIVITY_CATEGORIES),
  focus_score: z.number().int().min(0).max(100),
  task_state: z.enum(VISION_TASK_STATES),
  notes: z.string()
})

export const VisionBatchSchema = z.array(VisionSchema)
