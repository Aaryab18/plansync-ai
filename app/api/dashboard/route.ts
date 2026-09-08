import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

import {
  ScheduleActivity,
  ProgressUpdate,
} from "@/types/schedule";

import { matchProgressUpdate } from "@/lib/matcher";

/* --------------------------------------------------
   TYPES
-------------------------------------------------- */

type ScheduleUpdate = {
  reportId: string;
  activityId: string;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
  action: "APPROVED" | "REJECTED";
  confidence: number;
  reason?: string;
  updatedAt: string;
};

type ScheduleRow = ScheduleActivity & {
  actualStart: string | null;
  actualEnd: string | null;
  currentStatus: string;
  confidence: number | null;
  linkedReportId: string | null;
};

/* --------------------------------------------------
   HELPER: READ JSON
-------------------------------------------------- */

function readScheduleUpdates(): ScheduleUpdate[] {
  const filePath = path.join(
    process.cwd(),
    "data",
    "schedule_updates.json"
  );

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");

    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch (error) {
    console.error(
      "Failed to read schedule_updates.json:",
      error
    );

    return [];
  }
}

/* --------------------------------------------------
   HELPER: STATUS
-------------------------------------------------- */

function normalizeStatus(status: string): string {
  const value = status.toUpperCase();

  if (
    value === "COMPLETED" ||
    value === "COMPLETE"
  ) {
    return "COMPLETED";
  }

  if (
    value === "IN_PROGRESS" ||
    value === "STARTED"
  ) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
}

/* --------------------------------------------------
   GET DASHBOARD DATA
-------------------------------------------------- */

export async function GET() {
  try {
    /* ----------------------------------------------
       FILE PATHS
    ---------------------------------------------- */

    const schedulePath = path.join(
      process.cwd(),
      "data",
      "schedule_activities.csv"
    );

    const progressPath = path.join(
      process.cwd(),
      "data",
      "daily_progress.csv"
    );

    /* ----------------------------------------------
       CHECK FILES
    ---------------------------------------------- */

    if (!fs.existsSync(schedulePath)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "schedule_activities.csv not found.",
        },
        {
          status: 500,
        }
      );
    }

    if (!fs.existsSync(progressPath)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "daily_progress.csv not found.",
        },
        {
          status: 500,
        }
      );
    }

    /* ----------------------------------------------
       READ SCHEDULE CSV
    ---------------------------------------------- */

    const scheduleCsv = fs.readFileSync(
      schedulePath,
      "utf8"
    );

    const parsedSchedule =
      Papa.parse<ScheduleActivity>(
        scheduleCsv,
        {
          header: true,
          skipEmptyLines: true,
        }
      );

    const activities =
      parsedSchedule.data.filter(
        (activity) =>
          activity.activityId &&
          activity.activityDescription &&
          activity.discipline
      );

    /* ----------------------------------------------
       READ DAILY PROGRESS CSV
    ---------------------------------------------- */

    const progressCsv = fs.readFileSync(
      progressPath,
      "utf8"
    );

    const parsedProgress =
      Papa.parse<ProgressUpdate>(
        progressCsv,
        {
          header: true,
          skipEmptyLines: true,
        }
      );

    const progressReports =
      parsedProgress.data.filter(
        (report) =>
          report.reportId &&
          report.progressDescription &&
          report.discipline
      );

    /* ----------------------------------------------
       READ AUDIT TRAIL
    ---------------------------------------------- */

    const updates = readScheduleUpdates();

    /* ----------------------------------------------
       FIND LATEST APPROVED UPDATE
       FOR EACH ACTIVITY
    ---------------------------------------------- */

    const latestApproved = new Map<
      string,
      ScheduleUpdate
    >();

    const approvedUpdates =
      updates.filter(
        (update) =>
          update.action === "APPROVED"
      );

    for (const update of approvedUpdates) {
      const existing = latestApproved.get(
        update.activityId
      );

      if (
        !existing ||
        new Date(update.updatedAt).getTime() >
          new Date(existing.updatedAt).getTime()
      ) {
        latestApproved.set(
          update.activityId,
          update
        );
      }
    }

    /* ----------------------------------------------
       BUILD SCHEDULE VIEW
    ---------------------------------------------- */

    const schedule: ScheduleRow[] =
      activities.map((activity) => {
        const update = latestApproved.get(
          activity.activityId
        );

        if (!update) {
          return {
            ...activity,
            actualStart: null,
            actualEnd: null,
            currentStatus: "NOT_STARTED",
            confidence: null,
            linkedReportId: null,
          };
        }

        return {
          ...activity,
          actualStart: update.actualStart,
          actualEnd: update.actualEnd,
          currentStatus: normalizeStatus(
            update.status
          ),
          confidence: update.confidence,
          linkedReportId: update.reportId,
        };
      });

    /* ----------------------------------------------
       CLASSIFY ALL PROGRESS REPORTS

       This allows the dashboard to show:
       - Auto-link candidates
       - Planner review candidates
       - Unmatched candidates
    ---------------------------------------------- */

    let autoLinkCandidates = 0;
    let reviewCandidates = 0;
    let unmatchedCandidates = 0;

    for (const report of progressReports) {
      try {
        const matches =
          matchProgressUpdate(
            report.progressDescription,
            report.discipline,
            activities
          );

        const topMatch = matches[0];

        if (!topMatch) {
          unmatchedCandidates++;
          continue;
        }

        if (topMatch.status === "AUTO_LINK") {
          autoLinkCandidates++;
        } else if (
          topMatch.status === "PLANNER_REVIEW"
        ) {
          reviewCandidates++;
        } else {
          unmatchedCandidates++;
        }
      } catch (error) {
        console.error(
          `Failed to classify ${report.reportId}:`,
          error
        );

        unmatchedCandidates++;
      }
    }

    /* ----------------------------------------------
       UNIQUE LINKED ACTIVITIES
    ---------------------------------------------- */

    const linkedActivityIds = new Set(
      approvedUpdates.map(
        (update) => update.activityId
      )
    );

    /* ----------------------------------------------
       UNIQUE APPROVED REPORTS
    ---------------------------------------------- */

    const approvedReportIds = new Set(
      approvedUpdates.map(
        (update) => update.reportId
      )
    );

    /* ----------------------------------------------
       RECENT UPDATES
    ---------------------------------------------- */

    const recentUpdates = [...updates]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() -
          new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);

    /* ----------------------------------------------
       RESPONSE
    ---------------------------------------------- */

    return NextResponse.json({
      success: true,

      totalActivities: activities.length,

      reportsProcessed:
        progressReports.length,

      approvedUpdates:
        approvedReportIds.size,

      linkedActivities:
        linkedActivityIds.size,

      autoLinkCandidates,

      reviewCandidates,

      unmatchedCandidates,

      schedule,

      recentUpdates,
    });
  } catch (error) {
    console.error(
      "DASHBOARD API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load dashboard data.",
      },
      {
        status: 500,
      }
    );
  }
}