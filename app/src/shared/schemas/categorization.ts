import { z } from 'zod'

import { ACTIVITY_CATEGORIES } from '../types'

export const CategorySchema = z.object({
  category: z.enum(ACTIVITY_CATEGORIES),
  tags: z.array(z.string().min(1))
})
