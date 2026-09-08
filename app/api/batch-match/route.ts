import { NextResponse } from "next/server";
import Papa from "papaparse";

import {
  ProgressUpdate,
  ScheduleActivity,
} from "@/types/schedule";

import {
  matchProgressUpdate,
} from "@/lib/matcher";

import {
  extractExecutionEvent,
} from "@/lib/extractor";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "CSV file is required.",
        },
        {
          status: 400,
        }
      );
    }

    const fileText = await file.text();

    if (!fileText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploaded CSV file is empty.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------
     * STEP 1
     * Parse uploaded progress CSV
     * --------------------------------------------------
     */

    const parsedProgress =
      Papa.parse<ProgressUpdate>(
        fileText,
        {
          header: true,
          skipEmptyLines: true,
        }
      );

    if (parsedProgress.errors.length > 0) {
      console.error(
        "Progress CSV parsing errors:",
        parsedProgress.errors
      );
    }

    const progressUpdates =
      parsedProgress.data.filter(
        (report) =>
          report.reportId &&
          report.progressDescription &&
          report.date &&
          report.discipline
      );

    if (progressUpdates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid progress reports found in the uploaded CSV.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------
     * STEP 2
     * Load schedule from CSV
     * --------------------------------------------------
     */

    const fs = await import("fs");
    const path = await import("path");

    const schedulePath = path.join(
      process.cwd(),
      "data",
      "schedule_activities.csv"
    );

    if (!fs.existsSync(schedulePath)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Schedule file not found.",
        },
        {
          status: 500,
        }
      );
    }

    const scheduleCsv =
      fs.readFileSync(
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

    if (parsedSchedule.errors.length > 0) {
      console.error(
        "Schedule CSV parsing errors:",
        parsedSchedule.errors
      );
    }

    const activities =
      parsedSchedule.data.filter(
        (activity) =>
          activity.activityId &&
          activity.activityDescription &&
          activity.discipline
      );

    /*
     * --------------------------------------------------
     * STEP 3
     * Match every progress report
     * --------------------------------------------------
     */

    const results = progressUpdates.map(
      (report) => {
        const executionEvent =
          extractExecutionEvent(
            report.progressDescription,
            report.discipline,
            report.date
          );

        const matches =
          matchProgressUpdate(
            report.progressDescription,
            report.discipline,
            activities
          );

        return {
          report: {
            reportId: report.reportId,
            progressDescription:
              report.progressDescription,
            date: report.date,
            discipline: report.discipline,
          },

          executionEvent,

          matches,

          bestMatch:
            matches.length > 0
              ? matches[0]
              : null,
        };
      }
    );

    /*
     * --------------------------------------------------
     * STEP 4
     * Calculate summary
     * --------------------------------------------------
     */

    const autoLinkCount =
      results.filter(
        (result) =>
          result.bestMatch?.status ===
          "AUTO_LINK"
      ).length;

    const reviewCount =
      results.filter(
        (result) =>
          result.bestMatch?.status ===
          "PLANNER_REVIEW"
      ).length;

    const unmatchedCount =
      results.filter(
        (result) =>
          !result.bestMatch ||
          result.bestMatch.status ===
            "UNMATCHED"
      ).length;

    /*
     * --------------------------------------------------
     * STEP 5
     * Return batch results
     * --------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      summary: {
        totalReports:
          results.length,

        autoLinkCandidates:
          autoLinkCount,

        reviewCandidates:
          reviewCount,

        unmatchedCandidates:
          unmatchedCount,
      },

      results,
    });
  } catch (error) {
    console.error(
      "BATCH MATCH API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to process batch progress file.",
      },
      {
        status: 500,
      }
    );
  }
}