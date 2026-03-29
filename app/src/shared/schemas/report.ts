import { z } from 'zod'

export const FocusCurvePointSchema = z.object({
  time: z.string().min(1),
  score: z.number().int().min(0).max(100)
})

export const TomorrowNudgeSchema = z.object({
  when: z.string().min(1),
  what: z.string().min(1),
  why: z.string().min(1)
})

export const BottleneckSchema = z.object({
  bottleneck: z.string().min(1),
  recommendation: z.string().min(1),
  delegate_prompt: z.string().min(1).nullable().optional()
})

export const InterruptedTaskSchema = z.object({
  task: z.string().min(1),
  interrupted_at: z.string().min(1),
  context: z.string().min(1),
  suggested_next_step: z.string().min(1).nullable().optional()
})

export const ReportSchema = z.object({
  focus_curve: z.array(FocusCurvePointSchema),
  nudges: z.array(TomorrowNudgeSchema),
  bottlenecks: z.array(BottleneckSchema),
  interrupted_tasks: z.array(InterruptedTaskSchema),
  goal_alignment_score: z.number().min(0).max(1).nullable(),
  deviation_patterns: z.array(z.string().min(1)).nullable(),
  why_analysis: z.array(z.string().min(1)).nullable(),
  how_suggestions: z.array(z.string().min(1)).nullable()
})
