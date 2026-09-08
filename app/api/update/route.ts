import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

/* ---------------------------------------------------------
   POST /api/update
--------------------------------------------------------- */

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      reportId,
      activityId,
      actualStart = null,
      actualEnd = null,
      status,
      action,
      confidence,
      reason = "",
    } = body;

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!reportId || !activityId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "reportId and activityId are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      action !== "APPROVED" &&
      action !== "REJECTED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "action must be APPROVED or REJECTED.",
        },
        {
          status: 400,
        }
      );
    }

    /* -----------------------------------------------------
       UPDATE FILE
    ----------------------------------------------------- */

    const filePath = path.join(
      process.cwd(),
      "data",
      "schedule_updates.json"
    );

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        "[]",
        "utf8"
      );
    }

    /* -----------------------------------------------------
       READ EXISTING UPDATES
    ----------------------------------------------------- */

    const fileContent =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    let updates: ScheduleUpdate[] = [];

    try {
      updates =
        JSON.parse(fileContent);
    } catch {
      updates = [];
    }

    /* -----------------------------------------------------
       CREATE NEW UPDATE
    ----------------------------------------------------- */

    const newUpdate: ScheduleUpdate = {
      reportId,
      activityId,
      actualStart,
      actualEnd,
      status:
        status || "UNKNOWN",
      action,
      confidence:
        Number(confidence) || 0,
      reason,
      updatedAt:
        new Date().toISOString(),
    };

    /* -----------------------------------------------------
       STORE UPDATE
    ----------------------------------------------------- */

    updates.push(newUpdate);

    fs.writeFileSync(
      filePath,
      JSON.stringify(
        updates,
        null,
        2
      ),
      "utf8"
    );

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    return NextResponse.json({
      success: true,

      message:
        action === "APPROVED"
          ? "Schedule activity updated successfully."
          : "Schedule update rejected and recorded.",

      update: newUpdate,

      totalUpdates:
        updates.length,
    });

  } catch (error) {

    console.error(
      "UPDATE API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to save schedule update.",
      },
      {
        status: 500,
      }
    );
  }
}