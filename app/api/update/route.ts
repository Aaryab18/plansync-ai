import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

    /*
     * --------------------------------------------------
     * VALIDATION
     * --------------------------------------------------
     */

    if (!reportId || !activityId) {
      return NextResponse.json(
        {
          success: false,
          error: "reportId and activityId are required.",
        },
        { status: 400 }
      );
    }

    if (action !== "APPROVED" && action !== "REJECTED") {
      return NextResponse.json(
        {
          success: false,
          error: "action must be APPROVED or REJECTED.",
        },
        { status: 400 }
      );
    }

    /*
     * --------------------------------------------------
     * EXISTING APPROVAL CHECK
     * --------------------------------------------------
     *
     * Prevents the same report/activity pair from being
     * approved more than once.
     */

    if (action === "APPROVED") {
      const {
        data: existingApproval,
        error: existingApprovalError,
      } = await supabase
        .from("schedule_updates")
        .select(
          "id, report_id, activity_id, actual_start, actual_end, status, action, confidence, reason, updated_at"
        )
        .eq("report_id", reportId)
        .eq("activity_id", activityId)
        .eq("action", "APPROVED")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingApprovalError) {
        console.error(
          "SUPABASE DUPLICATE CHECK ERROR:",
          existingApprovalError
        );

        return NextResponse.json(
          {
            success: false,
            error: "Failed to validate existing schedule approval.",
            details: existingApprovalError.message,
          },
          { status: 500 }
        );
      }

      if (existingApproval) {
        const formattedExisting: ScheduleUpdate = {
          reportId: existingApproval.report_id,
          activityId: existingApproval.activity_id,
          actualStart: existingApproval.actual_start,
          actualEnd: existingApproval.actual_end,
          status: existingApproval.status,
          action: existingApproval.action,
          confidence: Number(existingApproval.confidence),
          reason: existingApproval.reason || "",
          updatedAt: existingApproval.updated_at,
        };

        return NextResponse.json({
          success: true,
          alreadyExists: true,
          message:
            "This schedule activity is already approved for this report. No duplicate update was created.",
          update: formattedExisting,
        });
      }
    }

    /*
     * --------------------------------------------------
     * INSERT SCHEDULE UPDATE
     * --------------------------------------------------
     */

    const newUpdate = {
      report_id: reportId,
      activity_id: activityId,
      actual_start: actualStart,
      actual_end: actualEnd,
      status: status || "UNKNOWN",
      action,
      confidence: Number(confidence) || 0,
      reason,
    };

    const { data, error } = await supabase
      .from("schedule_updates")
      .insert(newUpdate)
      .select()
      .single();

    /*
     * --------------------------------------------------
     * DUPLICATE DATABASE CONSTRAINT
     * --------------------------------------------------
     *
     * PostgreSQL error 23505 = unique constraint violation.
     *
     * This can happen when two approval requests arrive
     * almost simultaneously:
     *
     * Request A -> duplicate check -> nothing found
     * Request B -> duplicate check -> nothing found
     * Request A -> INSERT succeeds
     * Request B -> INSERT hits unique constraint
     *
     * The second request should still be treated as a
     * successful idempotent request, not as an error.
     */

    if (error) {
      console.error("SUPABASE UPDATE ERROR:", error);

      if (
        action === "APPROVED" &&
        error.code === "23505" &&
        error.message.includes("schedule_updates_approved_unique")
      ) {
        const {
          data: existingAfterConflict,
          error: lookupAfterConflictError,
        } = await supabase
          .from("schedule_updates")
          .select(
            "id, report_id, activity_id, actual_start, actual_end, status, action, confidence, reason, updated_at"
          )
          .eq("report_id", reportId)
          .eq("activity_id", activityId)
          .eq("action", "APPROVED")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lookupAfterConflictError) {
          console.error(
            "SUPABASE CONFLICT LOOKUP ERROR:",
            lookupAfterConflictError
          );

          return NextResponse.json(
            {
              success: false,
              error:
                "This approval already exists, but the existing record could not be loaded.",
              details: lookupAfterConflictError.message,
            },
            { status: 500 }
          );
        }

        if (existingAfterConflict) {
          const formattedExisting: ScheduleUpdate = {
            reportId: existingAfterConflict.report_id,
            activityId: existingAfterConflict.activity_id,
            actualStart: existingAfterConflict.actual_start,
            actualEnd: existingAfterConflict.actual_end,
            status: existingAfterConflict.status,
            action: existingAfterConflict.action,
            confidence: Number(existingAfterConflict.confidence),
            reason: existingAfterConflict.reason || "",
            updatedAt: existingAfterConflict.updated_at,
          };

          return NextResponse.json({
            success: true,
            alreadyExists: true,
            message:
              "This schedule activity is already approved for this report. No duplicate update was created.",
            update: formattedExisting,
          });
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save schedule update.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    /*
     * --------------------------------------------------
     * FORMAT SUCCESS RESPONSE
     * --------------------------------------------------
     */

    const formattedUpdate: ScheduleUpdate = {
      reportId: data.report_id,
      activityId: data.activity_id,
      actualStart: data.actual_start,
      actualEnd: data.actual_end,
      status: data.status,
      action: data.action,
      confidence: Number(data.confidence),
      reason: data.reason || "",
      updatedAt: data.updated_at,
    };

    return NextResponse.json({
      success: true,
      alreadyExists: false,
      message:
        action === "APPROVED"
          ? "Schedule activity updated successfully."
          : "Schedule update rejected and recorded.",
      update: formattedUpdate,
    });
  } catch (error) {
    console.error("UPDATE API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to save schedule update.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}