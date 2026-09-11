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
     * IDEMPOTENCY GUARD
     * -----------------
     * The same report/activity pair can only be approved once.
     * This protects the audit trail even if a user double-clicks,
     * refreshes, or sends the same request again.
     *
     * Different reports may still update the same activity over time,
     * which is valid for progressive construction execution updates.
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

    if (error) {
      console.error("SUPABASE UPDATE ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save schedule update.",
          details: error.message,
        },
        { status: 500 }
      );
    }

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
      },
      { status: 500 }
    );
  }
}
