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