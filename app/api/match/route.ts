import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

import { ScheduleActivity } from "@/types/schedule";
import { matchProgressUpdate } from "@/lib/matcher";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      progressDescription,
      discipline,
    } = body;

    if (!progressDescription || !discipline) {
      return NextResponse.json(
        {
          error:
            "progressDescription and discipline are required",
        },
        { status: 400 }
      );
    }

    const filePath = path.join(
      process.cwd(),
      "data",
      "schedule_activities.csv"
    );

    const csv = fs.readFileSync(filePath, "utf8");

    const parsed =
      Papa.parse<ScheduleActivity>(csv, {
        header: true,
        skipEmptyLines: true,
      });

    const activities = parsed.data;

    const matches = matchProgressUpdate(
      progressDescription,
      discipline,
      activities
    );

    return NextResponse.json({
      success: true,
      update: {
        progressDescription,
        discipline,
      },
      matches,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to process progress update",
      },
      { status: 500 }
    );
  }
}