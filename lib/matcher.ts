import Fuse from "fuse.js";

import {
  ScheduleActivity,
  MatchResult,
} from "@/types/schedule";

/* ---------------------------------------------------------
   TEXT NORMALIZATION
--------------------------------------------------------- */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------------------------------
   IDENTIFIER EXTRACTION
--------------------------------------------------------- */

function extractIdentifiers(text: string): string[] {
  const value = normalize(text);

  const identifiers: string[] = [];

  // Line 24, Line-24, Line 24-XX
  const lineMatches = value.match(
    /\bline\s*-?\s*\d+/g
  );

  if (lineMatches) {
    for (const match of lineMatches) {
      const number = match.match(/\d+/);

      if (number) {
        identifiers.push(`line:${number[0]}`);
      }
    }
  }

  // Zone A
  const zoneMatches = value.match(
    /\bzone\s*-?\s*[a-z0-9]+/g
  );

  if (zoneMatches) {
    for (const match of zoneMatches) {
      const valueMatch = match.match(
        /zone\s*-?\s*([a-z0-9]+)/
      );

      if (valueMatch) {
        identifiers.push(`zone:${valueMatch[1]}`);
      }
    }
  }

  // Area A
  const areaMatches = value.match(
    /\barea\s*-?\s*[a-z0-9]+/g
  );

  if (areaMatches) {
    for (const match of areaMatches) {
      const valueMatch = match.match(
        /area\s*-?\s*([a-z0-9]+)/
      );

      if (valueMatch) {
        identifiers.push(`area:${valueMatch[1]}`);
      }
    }
  }

  // Block B
  const blockMatches = value.match(
    /\bblock\s*-?\s*[a-z0-9]+/g
  );

  if (blockMatches) {
    for (const match of blockMatches) {
      const valueMatch = match.match(
        /block\s*-?\s*([a-z0-9]+)/
      );

      if (valueMatch) {
        identifiers.push(`block:${valueMatch[1]}`);
      }
    }
  }

  // Room B
  const roomMatches = value.match(
    /\broom\s*-?\s*[a-z0-9]+/g
  );

  if (roomMatches) {
    for (const match of roomMatches) {
      const valueMatch = match.match(
        /room\s*-?\s*([a-z0-9]+)/
      );

      if (valueMatch) {
        identifiers.push(`room:${valueMatch[1]}`);
      }
    }
  }

  return [...new Set(identifiers)];
}

/* ---------------------------------------------------------
   IDENTIFIER SCORE
--------------------------------------------------------- */

function identifierScore(
  updateText: string,
  activityText: string
): number {
  const updateIds =
    extractIdentifiers(updateText);

  const activityIds =
    extractIdentifiers(activityText);

  // No identifiers available
  if (
    updateIds.length === 0 ||
    activityIds.length === 0
  ) {
    return 0;
  }

  for (const updateId of updateIds) {
    if (activityIds.includes(updateId)) {
      return 1;
    }
  }

  return 0;
}

/* ---------------------------------------------------------
   OPERATION DETECTION
--------------------------------------------------------- */

function getOperation(text: string): string {
  const value = normalize(text);

  /*
    Each group represents the same execution operation
    even when different terminology is used.
  */

  if (
    value.includes("erect") ||
    value.includes("erection") ||
    value.includes("erected")
  ) {
    return "erection";
  }

  if (
    value.includes("weld") ||
    value.includes("welding") ||
    value.includes("welded")
  ) {
    return "welding";
  }

  if (
    value.includes("hydrotest") ||
    value.includes("hydro test")
  ) {
    return "hydrotest";
  }

  if (
    value.includes("install") ||
    value.includes("installation") ||
    value.includes("installed")
  ) {
    return "installation";
  }

  if (
    value.includes("insulation") ||
    value.includes("insulate") ||
    value.includes("insulated")
  ) {
    return "insulation";
  }

  if (
    value.includes("excavat") ||
    value.includes("excavation") ||
    value.includes("excavated")
  ) {
    return "excavation";
  }

  if (
    value.includes("rebar") ||
    value.includes("reinforcement") ||
    value.includes("reinforcing")
  ) {
    return "reinforcement";
  }

  if (
    value.includes("concrete") ||
    value.includes("pour") ||
    value.includes("poured") ||
    value.includes("pouring") ||
    value.includes("casting") ||
    value.includes("cast")
  ) {
    return "concrete";
  }

  if (
    value.includes("shuttering") ||
    value.includes("shutter") ||
    value.includes("formwork")
  ) {
    return "shuttering";
  }

  if (
    value.includes("termination") ||
    value.includes("terminated")
  ) {
    return "termination";
  }

  if (
    value.includes("earthing") ||
    value.includes("grounding")
  ) {
    return "earthing";
  }

  if (
    value.includes("transformer")
  ) {
    return "transformer";
  }

  if (
    value.includes("cable") &&
    (
      value.includes("pull") ||
      value.includes("pulling") ||
      value.includes("pulled")
    )
  ) {
    return "cable-pulling";
  }

  if (
    value.includes("testing") ||
    value.includes("test")
  ) {
    return "testing";
  }

  return "unknown";
}

/* ---------------------------------------------------------
   OPERATION SCORE
--------------------------------------------------------- */

function operationScore(
  updateText: string,
  activityText: string
): number {
  const updateOperation =
    getOperation(updateText);

  const activityOperation =
    getOperation(activityText);

  if (
    updateOperation === "unknown" ||
    activityOperation === "unknown"
  ) {
    return 0;
  }

  return updateOperation === activityOperation
    ? 1
    : 0;
}

/* ---------------------------------------------------------
   TOKEN OVERLAP
--------------------------------------------------------- */

function getTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(
      (token) => token.length > 2
    );
}

function tokenOverlapScore(
  updateText: string,
  activityText: string
): number {
  const updateTokens =
    new Set(getTokens(updateText));

  const activityTokens =
    new Set(getTokens(activityText));

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

/* ---------------------------------------------------------
   HYBRID MATCHING ENGINE
--------------------------------------------------------- */

export function matchProgressUpdate(
  updateText: string,
  discipline: string,
  activities: ScheduleActivity[]
): MatchResult[] {

  /*
    STEP 1
    Only compare activities from the same discipline.
  */

  const filteredActivities =
    activities.filter(
      (activity) =>
        activity.discipline.toLowerCase() ===
        discipline.toLowerCase()
    );

  if (filteredActivities.length === 0) {
    return [];
  }

  /*
    STEP 2
    Fuse provides fuzzy terminology similarity.
  */

  const fuse = new Fuse(
    filteredActivities,
    {
      keys: [
        "activityDescription",
      ],
      threshold: 0.8,
      includeScore: true,
    }
  );

  const fuzzyResults =
    fuse.search(updateText);

  /*
    STEP 3
    Calculate hybrid score.
  */

  const results =
    filteredActivities.map(
      (activity) => {

        const fuzzyResult =
          fuzzyResults.find(
            (result) =>
              result.item.activityId ===
              activity.activityId
          );

        const fuzzyScore =
          fuzzyResult?.score !== undefined
            ? 1 - fuzzyResult.score
            : 0;

        const idScore =
          identifierScore(
            updateText,
            activity.activityDescription
          );

        const opScore =
          operationScore(
            updateText,
            activity.activityDescription
          );

        const tokenScore =
          tokenOverlapScore(
            updateText,
            activity.activityDescription
          );

        /*
          Main hybrid scoring.

          Identifier = strongest signal
          Operation = second strongest
          Token = terminology similarity
          Fuzzy = general similarity
        */

        let finalScore =
          idScore * 0.45 +
          opScore * 0.30 +
          tokenScore * 0.15 +
          fuzzyScore * 0.10;

        /*
          IMPORTANT SAFETY RULE

          If both project identifier and
          execution operation match, this is
          a very strong candidate.

          Minimum confidence = 85%.
        */

        if (
          idScore === 1 &&
          opScore === 1
        ) {
          finalScore =
            Math.max(
              finalScore,
              0.85
            );
        }

        /*
          If identifier matches but operation
          does not, still give reasonable
          confidence but require review.
        */

        if (
          idScore === 1 &&
          opScore === 0
        ) {
          finalScore =
            Math.max(
              finalScore,
              0.55
            );
        }

        /*
          If operation matches but identifier
          does not, don't over-trust it.
        */

        if (
          idScore === 0 &&
          opScore === 1
        ) {
          finalScore =
            Math.max(
              finalScore,
              0.45
            );
        }

        const confidence =
          Math.round(
            Math.max(
              0,
              Math.min(
                1,
                finalScore
              )
            ) * 100
          );

        /* -------------------------------------------------
           EXPLANATION
        ------------------------------------------------- */

        let reason =
          "Terminology similarity detected";

        if (
          idScore === 1 &&
          opScore === 1
        ) {
          reason =
            "Matching project identifier and execution operation detected";
        } else if (
          idScore === 1
        ) {
          reason =
            "Matching project identifier detected";
        } else if (
          opScore === 1
        ) {
          reason =
            "Matching execution operation detected";
        }

        /*
          Temporary status.
          Final status is decided after
          comparing the top candidate.
        */

        let status:
          | "AUTO_LINK"
          | "PLANNER_REVIEW"
          | "UNMATCHED";

        if (confidence >= 80) {
          status = "AUTO_LINK";
        } else if (confidence >= 45) {
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

          breakdown: {
            identifier: Math.round(
              idScore * 100
            ),
            operation: Math.round(
              opScore * 100
            ),
            token: Math.round(
              tokenScore * 100
            ),
            fuzzy: Math.round(
              fuzzyScore * 100
            ),
          },
        };
      }
    );

  /*
    STEP 4
    Sort from strongest to weakest.
  */

  results.sort(
    (a, b) =>
      b.score - a.score
  );

  /*
    STEP 5
    Safety check for the strongest candidate.

    We only auto-link when:
      confidence >= 80
      AND it is sufficiently ahead
      of the second candidate.
  */

  if (results.length > 0) {

    const top = results[0];

    const second =
      results[1];

    const scoreGap =
      second
        ? top.confidence -
          second.confidence
        : 100;

    if (
      top.confidence >= 80 &&
      scoreGap >= 10
    ) {
      top.status =
        "AUTO_LINK";
    } else if (
      top.confidence >= 45
    ) {
      top.status =
        "PLANNER_REVIEW";
    } else {
      top.status =
        "UNMATCHED";
    }
  }

  /*
    STEP 6
    Return top 5 candidates.
  */

  return results.slice(0, 5);
}