import Fuse from "fuse.js";
import {
  ScheduleActivity,
  MatchResult,
} from "@/types/schedule";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 2);
}

function extractLineNumber(text: string): string | null {
  const match = text.match(/\bline\s*-?\s*(\d+)/i);
  return match ? match[1] : null;
}

function extractLocationIdentifiers(text: string): string[] {
  const patterns = [
    /\bline\s*-?\s*\d+/gi,
    /\bzone\s*-?\s*[a-z0-9-]+/gi,
    /\barea\s*-?\s*[a-z0-9-]+/gi,
    /\bblock\s*-?\s*[a-z0-9-]+/gi,
    /\broom\s*-?\s*[a-z0-9-]+/gi,
    /\bpanel\s*-?\s*[a-z0-9-]+/gi,
  ];

  const identifiers: string[] = [];

  for (const pattern of patterns) {
    const matches = text.match(pattern);

    if (matches) {
      identifiers.push(
        ...matches.map((item) => normalize(item))
      );
    }
  }

  return identifiers;
}

function identifierScore(
  updateText: string,
  activityText: string
): number {
  const updateIdentifiers =
    extractLocationIdentifiers(updateText);

  const activityIdentifiers =
    extractLocationIdentifiers(activityText);

  if (
    updateIdentifiers.length === 0 ||
    activityIdentifiers.length === 0
  ) {
    return 0;
  }

  let matched = 0;

  for (const updateId of updateIdentifiers) {
    for (const activityId of activityIdentifiers) {
      if (updateId === activityId) {
        matched++;
      }
    }
  }

  return matched > 0 ? 1 : 0;
}

function operationScore(
  updateText: string,
  activityText: string
): number {
  const update = normalize(updateText);
  const activity = normalize(activityText);

  const operationGroups = [
    ["erect", "erection", "erected"],
    ["install", "installation", "installed"],
    ["weld", "welding", "welded"],
    ["hydrotest", "hydro", "testing", "test"],
    ["insulation", "insulate", "insulated"],
    ["excavat", "excavation", "excavated"],
    ["reinforcement", "rebar", "reinforcing", "bars"],
    ["concrete", "pour", "pouring", "poured", "casting", "cast"],
    ["shuttering", "shutter", "formwork"],
    ["cable", "cables", "pulling", "pulled"],
    ["termination", "terminate", "terminated"],
    ["earthing", "grounding"],
    ["transformer"],
  ];

  for (const group of operationGroups) {
    const updateHas = group.some((word) =>
      update.includes(word)
    );

    const activityHas = group.some((word) =>
      activity.includes(word)
    );

    if (updateHas && activityHas) {
      return 1;
    }
  }

  return 0;
}

function tokenOverlapScore(
  updateText: string,
  activityText: string
): number {
  const updateTokens = new Set(getTokens(updateText));
  const activityTokens = new Set(getTokens(activityText));

  if (updateTokens.size === 0) {
    return 0;
  }

  let matched = 0;

  for (const token of updateTokens) {
    if (activityTokens.has(token)) {
      matched++;
    }
  }

  return matched / updateTokens.size;
}

export function matchProgressUpdate(
  updateText: string,
  discipline: string,
  activities: ScheduleActivity[]
): MatchResult[] {
  const filteredActivities = activities.filter(
    (activity) =>
      activity.discipline.toLowerCase() ===
      discipline.toLowerCase()
  );

  const fuse = new Fuse(filteredActivities, {
    keys: ["activityDescription"],
    threshold: 0.8,
    includeScore: true,
  });

  const fuzzyResults = fuse.search(updateText);

  const results = filteredActivities.map((activity) => {
    const fuzzyResult = fuzzyResults.find(
      (result) =>
        result.item.activityId === activity.activityId
    );

    const fuzzyScore =
      1 - (fuzzyResult?.score ?? 1);

    const idScore = identifierScore(
      updateText,
      activity.activityDescription
    );

    const opScore = operationScore(
      updateText,
      activity.activityDescription
    );

    const tokenScore = tokenOverlapScore(
      updateText,
      activity.activityDescription
    );

    /*
      Hybrid score:

      Identifier match  = 40%
      Operation match   = 30%
      Token similarity  = 20%
      Fuzzy similarity  = 10%
    */

    const finalScore =
      idScore * 0.4 +
      opScore * 0.3 +
      tokenScore * 0.2 +
      fuzzyScore * 0.1;

    const confidence = Math.round(
      Math.max(0, Math.min(1, finalScore)) * 100
    );

    let reason = "Terminology similarity";

    if (idScore === 1 && opScore === 1) {
      reason =
        "Matching line identifier and execution operation detected";
    } else if (idScore === 1) {
      reason =
        "Matching project identifier detected";
    } else if (opScore === 1) {
      reason =
        "Matching execution operation detected";
    }

    let status: "AUTO_LINK" | "PLANNER_REVIEW" | "UNMATCHED";

if (confidence >= 80) {
  status = "AUTO_LINK";
} else if (confidence >= 50) {
  status = "PLANNER_REVIEW";
} else {
  status = "UNMATCHED";
}

return {
  activity,
  score: finalScore,
  confidence,
  status,
  reason,
};
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}