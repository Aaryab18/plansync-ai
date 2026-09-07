export interface ScheduleActivity {
  activityId: string;
  activityDescription: string;
  discipline: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface ProgressUpdate {
  reportId: string;
  progressDescription: string;
  date: string;
  discipline: string;
}

export type MatchStatus =
  | "AUTO_LINK"
  | "PLANNER_REVIEW"
  | "UNMATCHED";

export interface MatchResult {
  activity: ScheduleActivity;
  score: number;
  confidence: number;
  status: MatchStatus;
  reason: string;
}