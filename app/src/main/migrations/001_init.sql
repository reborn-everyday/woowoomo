CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  app_name TEXT,
  window_title TEXT,
  category TEXT,
  duration_sec INTEGER
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  target_behaviors TEXT,
  anti_behaviors TEXT,
  success_metric TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screenshot_analyses (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  screenshot_path TEXT,
  application TEXT,
  description TEXT,
  category TEXT,
  tags TEXT,
  focus_score INTEGER,
  task_state TEXT,
  tool_in_video TEXT,
  full_response TEXT,
  display_id INTEGER
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  focus_curve_data TEXT,
  tomorrow_nudges TEXT,
  bottlenecks TEXT,
  interrupted_tasks TEXT,
  goal_alignment_score REAL,
  deviation_patterns TEXT,
  why_analysis TEXT,
  how_suggestions TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  report_id INTEGER,
  item_type TEXT,
  rating INTEGER,
  created_at TEXT NOT NULL
);
