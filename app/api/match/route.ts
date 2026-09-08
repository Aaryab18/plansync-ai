import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

import {
  ScheduleActivity,
} from "@/types/schedule";

import {
  matchProgressUpdate,
} from "@/lib/matcher";

import {
  extractExecutionEvent,
} from "@/lib/extractor";

export async function POST(
  request: Request
) {
  try {

    const body =
      await request.json();

    const {
      progressDescription,
      discipline,
      date = null,
    } = body;

    /*
     * Validate input.
     */
    if (
      !progressDescription ||
      !discipline
    ) {
      return NextResponse.json(
        {
          error:
            "progressDescription and discipline are required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * STEP 1
     * Extract structured execution information.
     */
    const executionEvent =
      extractExecutionEvent(
        progressDescription,
        discipline,
        date
      );

    /*
     * STEP 2
     * Load schedule CSV.
     */
    const filePath =
      path.join(
        process.cwd(),
        "data",
        "schedule_activities.csv"
      );

    if (
      !fs.existsSync(filePath)
    ) {
      return NextResponse.json(
        {
          error:
            "Schedule file not found.",
        },
        {
          status: 500,
        }
      );
    }

    const csv =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    /*
     * STEP 3
     * Parse CSV.
     */
    const parsed =
      Papa.parse<ScheduleActivity>(
        csv,
        {
          header: true,
          skipEmptyLines: true,
        }
      );

    if (
      parsed.errors.length > 0
    ) {
      console.error(
        "CSV parsing errors:",
        parsed.errors
      );
    }

    const activities =
      parsed.data.filter(
        (activity) =>
          activity.activityId &&
          activity.activityDescription &&
          activity.discipline
      );

    /*
     * STEP 4
     * Run hybrid matching.
     */
    const matches =
      matchProgressUpdate(
        progressDescription,
        discipline,
        activities
      );

    /*
     * STEP 5
     * Return everything needed by
     * the frontend.
     */
    return NextResponse.json({
      success: true,

      update: {
        progressDescription,
        discipline,
        date,
      },

      executionEvent,

      matches,
    });

  } catch (error) {

    console.error(
      "MATCH API ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to process progress update",
      },
      {
        status: 500,
      }
    );
  }
}