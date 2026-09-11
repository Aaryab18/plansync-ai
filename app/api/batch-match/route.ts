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

type RawCsvRow = Record<string, unknown>;

/*
 * --------------------------------------------------
 * HEADER NORMALIZATION
 * --------------------------------------------------
 */

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/*
 * --------------------------------------------------
 * GET VALUE FROM FLEXIBLE CSV COLUMNS
 * --------------------------------------------------
 */

function findValue(
  row: RawCsvRow,
  possibleNames: string[]
): string {
  const normalizedNames =
    possibleNames.map(normalizeHeader);

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey =
      normalizeHeader(key);

    if (
      normalizedNames.includes(normalizedKey)
    ) {
      const text =
        value === null ||
        value === undefined
          ? ""
          : String(value).trim();

      if (text) {
        return text;
      }
    }
  }

  return "";
}

/*
 * --------------------------------------------------
 * NORMALIZE ONE PROGRESS REPORT
 * --------------------------------------------------
 */

function normalizeProgressRow(
  row: RawCsvRow,
  index: number
): ProgressUpdate | null {
  let reportId = findValue(row, [
    "reportId",
    "report_id",
    "Report ID",
    "ReportId",
    "Report ID",
    "Report",
    "report",
    "ID",
  ]);

  const progressDescription =
    findValue(row, [
      "progressDescription",
      "progress_description",
      "Progress Description",
      "ProgressDescription",
      "description",
      "Description",
      "progress",
      "Progress",
      "progressUpdate",
      "Progress Update",
      "siteUpdate",
      "site_update",
      "Site Update",
      "siteReport",
      "Site Report",
      "activityDescription",
    ]);

  const date = findValue(row, [
    "date",
    "Date",
    "reportDate",
    "report_date",
    "Report Date",
    "actualDate",
    "actual_date",
    "Actual Date",
  ]);

  const discipline =
    findValue(row, [
      "discipline",
      "Discipline",
      "department",
      "Department",
      "dept",
      "Dept",
    ]);

  /*
   * If report ID is missing but the other three
   * required fields exist, generate an ID.
   *
   * This makes imported datasets more tolerant.
   */
  if (
    !reportId &&
    progressDescription &&
    date &&
    discipline
  ) {
    reportId =
      `RPT-IMPORT-${String(index + 1).padStart(3, "0")}`;
  }

  if (
    !reportId ||
    !progressDescription ||
    !date ||
    !discipline
  ) {
    return null;
  }

  return {
    reportId,
    progressDescription,
    date,
    discipline,
  };
}

/*
 * --------------------------------------------------
 * POSITIONAL FALLBACK
 * --------------------------------------------------
 *
 * Handles CSVs where the column names are unusual
 * but the first four columns are:
 *
 * Report ID
 * Progress Description
 * Date
 * Discipline
 * --------------------------------------------------
 */

function normalizePositionalRow(
  row: RawCsvRow,
  index: number
): ProgressUpdate | null {
  const values = Object.values(row)
    .map((value) =>
      value === null ||
      value === undefined
        ? ""
        : String(value).trim()
    );

  const nonEmptyValues =
    values.filter(Boolean);

  if (nonEmptyValues.length < 3) {
    return null;
  }

  const reportId =
    nonEmptyValues[0] ||
    `RPT-IMPORT-${String(index + 1).padStart(3, "0")}`;

  const progressDescription =
    nonEmptyValues[1];

  const date =
    nonEmptyValues[2];

  const discipline =
    nonEmptyValues[3] || "Unknown";

  if (
    !progressDescription ||
    !date
  ) {
    return null;
  }

  return {
    reportId,
    progressDescription,
    date,
    discipline,
  };
}

/*
 * --------------------------------------------------
 * SCHEDULE LOADER
 * --------------------------------------------------
 */

async function loadSchedule(): Promise<
  ScheduleActivity[]
> {
  const fs = await import("fs");
  const path = await import("path");

  const schedulePath =
    path.join(
      process.cwd(),
      "data",
      "schedule_activities.csv"
    );

  if (!fs.existsSync(schedulePath)) {
    throw new Error(
      "Schedule file not found at data/schedule_activities.csv."
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
        delimiter: "",
        transformHeader: (header) =>
          header
            .replace(/^\uFEFF/, "")
            .trim(),
      }
    );

  if (
    parsedSchedule.errors.length > 0
  ) {
    console.error(
      "Schedule CSV parsing errors:",
      parsedSchedule.errors
    );
  }

  return parsedSchedule.data.filter(
    (activity) =>
      activity.activityId &&
      activity.activityDescription &&
      activity.discipline
  );
}

/*
 * --------------------------------------------------
 * POST
 * --------------------------------------------------
 */

export async function POST(
  request: Request
) {
  try {
    const formData =
      await request.formData();

    const file =
      formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CSV file is required.",
        },
        {
          status: 400,
        }
      );
    }

    const fileText =
      await file.text();

    if (!fileText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Uploaded CSV file is empty.",
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      "BATCH UPLOAD FILE:",
      file.name
    );

    console.log(
      "BATCH UPLOAD SIZE:",
      fileText.length
    );

    console.log(
      "BATCH UPLOAD PREVIEW:",
      fileText.slice(0, 500)
    );

    /*
     * --------------------------------------------------
     * STEP 1
     * PARSE PROGRESS CSV
     * --------------------------------------------------
     *
     * delimiter: ""
     * allows PapaParse to automatically detect
     * comma, semicolon, tab, etc.
     */

    const parsedProgress =
      Papa.parse<RawCsvRow>(
        fileText,
        {
          header: true,
          skipEmptyLines: true,
          delimiter: "",
          transformHeader: (header) =>
            header
              .replace(/^\uFEFF/, "")
              .trim(),
        }
      );

    console.log(
      "DETECTED CSV COLUMNS:",
      parsedProgress.meta.fields
    );

    console.log(
      "DETECTED CSV DELIMITER:",
      parsedProgress.meta.delimiter
    );

    console.log(
      "CSV ROW COUNT:",
      parsedProgress.data.length
    );

    if (
      parsedProgress.errors.length > 0
    ) {
      console.error(
        "Progress CSV parsing errors:",
        parsedProgress.errors
      );
    }

    /*
     * --------------------------------------------------
     * STEP 2
     * NORMALIZE ROWS
     * --------------------------------------------------
     */

    let progressUpdates =
      parsedProgress.data
        .map((row, index) =>
          normalizeProgressRow(
            row,
            index
          )
        )
        .filter(
          (
            report
          ): report is ProgressUpdate =>
            report !== null
        );

    /*
     * --------------------------------------------------
     * STEP 3
     * POSITIONAL FALLBACK
     * --------------------------------------------------
     *
     * If named-column matching failed, try using
     * the first four meaningful columns.
     */

    if (
      progressUpdates.length === 0 &&
      parsedProgress.data.length > 0
    ) {
      console.warn(
        "Named-column matching found 0 reports. Trying positional CSV fallback."
      );

      progressUpdates =
        parsedProgress.data
          .map((row, index) =>
            normalizePositionalRow(
              row,
              index
            )
          )
          .filter(
            (
              report
            ): report is ProgressUpdate =>
              report !== null
          );
    }

    /*
     * --------------------------------------------------
     * STEP 4
     * FINAL VALIDATION
     * --------------------------------------------------
     */

    if (
      progressUpdates.length === 0
    ) {
      console.error(
        "NO VALID PROGRESS REPORTS.",
        {
          detectedColumns:
            parsedProgress.meta.fields ||
            [],

          delimiter:
            parsedProgress.meta.delimiter,

          firstRows:
            parsedProgress.data.slice(
              0,
              3
            ),
        }
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "No valid progress reports found in the uploaded CSV.",

          detectedColumns:
            parsedProgress.meta.fields ||
            [],

          detectedDelimiter:
            parsedProgress.meta.delimiter ||
            ",",

          rowsDetected:
            parsedProgress.data.length,
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      "VALID PROGRESS REPORTS:",
      progressUpdates.length
    );

    /*
     * --------------------------------------------------
     * STEP 5
     * LOAD SCHEDULE
     * --------------------------------------------------
     */

    const activities =
      await loadSchedule();

    if (
      activities.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid schedule activities found in schedule_activities.csv.",
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      "SCHEDULE ACTIVITIES:",
      activities.length
    );

    /*
     * --------------------------------------------------
     * STEP 6
     * MATCH EVERY REPORT
     * --------------------------------------------------
     */

    const results =
      progressUpdates.map(
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
              reportId:
                report.reportId,

              progressDescription:
                report.progressDescription,

              date:
                report.date,

              discipline:
                report.discipline,
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
     * STEP 7
     * SUMMARY
     * --------------------------------------------------
     */

    const autoLinkCount =
      results.filter(
        (result) =>
          result.bestMatch
            ?.status ===
          "AUTO_LINK"
      ).length;

    const reviewCount =
      results.filter(
        (result) =>
          result.bestMatch
            ?.status ===
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
     * STEP 8
     * RETURN RESULTS
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

        details:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      {
        status: 500,
      }
    );
  }
}