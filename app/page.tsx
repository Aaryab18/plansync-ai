"use client";

import {
  ChangeEvent,
  useEffect,
  useState,
} from "react";

import {
  MatchResult,
} from "@/types/schedule";

type DashboardData = {
  totalActivities: number;
  reportsProcessed: number;
  approvedUpdates: number;
  linkedActivities: number;
  autoLinkCandidates: number;
  reviewCandidates: number;
  unmatchedCandidates: number;

  schedule: Array<{
    activityId: string;
    activityDescription: string;
    discipline: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    currentStatus: string;
    confidence: number | null;
    linkedReportId: string | null;
  }>;

  recentUpdates: Array<{
    reportId: string;
    activityId: string;
    status: string;
    action: string;
    confidence: number;
    reason?: string;
    updatedAt: string;
  }>;
};

type BatchResult = {
  report: {
    reportId: string;
    progressDescription: string;
    date: string;
    discipline: string;
  };

  executionEvent: {
    action: string;
    object: string;
    identifiers: string[];
    status: string;
    discipline: string;
    date: string | null;
  };

  matches: MatchResult[];

  bestMatch: MatchResult | null;
};

type BatchSummary = {
  totalReports: number;
  autoLinkCandidates: number;
  reviewCandidates: number;
  unmatchedCandidates: number;
};

export default function Home() {
  /*
   * --------------------------------------------------
   * DASHBOARD STATE
   * --------------------------------------------------
   */

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [loadingDashboard, setLoadingDashboard] =
    useState(true);

  const [dashboardError, setDashboardError] =
    useState("");

  /*
   * --------------------------------------------------
   * SINGLE REPORT MATCHING STATE
   * --------------------------------------------------
   */

  const [reportId, setReportId] =
    useState("RPT-006");

  const [discipline, setDiscipline] =
    useState("Piping");

  const [actualDate, setActualDate] =
    useState("2026-09-07");

  const [status, setStatus] =
    useState("COMPLETED");

  const [progressDescription, setProgressDescription] =
    useState(
      "Spool erection for Line 24 completed"
    );

  const [matches, setMatches] =
    useState<MatchResult[]>([]);

  const [selectedMatch, setSelectedMatch] =
    useState<MatchResult | null>(null);

  const [matching, setMatching] =
    useState(false);

  const [actionMessage, setActionMessage] =
    useState("");

  /*
   * IMPORTANT:
   * Tracks whether the latest matching attempt
   * completed successfully, even when matches = [].
   *
   * This allows the UI to display the
   * UNMATCHED card instead of showing nothing.
   */

  const [matchCompleted, setMatchCompleted] =
    useState(false);

  /*
   * --------------------------------------------------
   * BATCH UPLOAD STATE
   * --------------------------------------------------
   */

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [batchResults, setBatchResults] =
    useState<BatchResult[]>([]);

  const [batchSummary, setBatchSummary] =
    useState<BatchSummary | null>(null);

  const [batchLoading, setBatchLoading] =
    useState(false);

  const [batchMessage, setBatchMessage] =
    useState("");

  /*
   * --------------------------------------------------
   * SCHEDULE SEARCH STATE
   * --------------------------------------------------
   */

  const [scheduleSearch, setScheduleSearch] =
    useState("");

  const [scheduleDiscipline, setScheduleDiscipline] =
    useState("ALL");

  const [scheduleStatus, setScheduleStatus] =
    useState("ALL");

  const [showScheduleDetails, setShowScheduleDetails] =
    useState(false);

  const [pendingActionKey, setPendingActionKey] =
    useState("");

  /*
   * --------------------------------------------------
   * LOAD DASHBOARD
   * --------------------------------------------------
   */

  async function loadDashboard() {
    try {
      setLoadingDashboard(true);
      setDashboardError("");

      const response =
        await fetch("/api/dashboard");

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load dashboard."
        );
      }

      setDashboard(data);
    } catch (error) {
      console.error(error);

      setDashboardError(
        error instanceof Error
          ? error.message
          : "Failed to load dashboard."
      );
    } finally {
      setLoadingDashboard(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  /*
   * --------------------------------------------------
   * SINGLE REPORT MATCHING
   * --------------------------------------------------
   */

  async function handleMatch() {
    try {
      setMatching(true);
      setActionMessage("");

      // Clear previous result.
      setMatches([]);
      setSelectedMatch(null);

      // New matching attempt has not completed yet.
      setMatchCompleted(false);

      const response =
        await fetch("/api/match", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            progressDescription,
            discipline,
            date: actualDate,
          }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to match report."
        );
      }

      /*
       * The API may legitimately return
       * an empty matches array.
       *
       * Example:
       * Mechanical + unknown activity
       *
       * In that case we still want the UI
       * to show UNMATCHED.
       */

      setMatches(
        data.matches || []
      );

      // Matching completed successfully.
      setMatchCompleted(true);

    } catch (error) {
      console.error(error);

      setActionMessage(
        error instanceof Error
          ? error.message
          : "Failed to process report."
      );

      // Do not show UNMATCHED for an API error.
      setMatchCompleted(false);

    } finally {
      setMatching(false);
    }
  }

  /*
   * --------------------------------------------------
   * APPROVE / REJECT SINGLE MATCH
   * --------------------------------------------------
   */

  async function handleScheduleAction(
    action: "APPROVED" | "REJECTED",
    result: MatchResult
  ) {
    const actionKey = `${reportId}-${result.activity.activityId}`;

    // Prevent accidental double-clicks while the request is in flight.
    if (pendingActionKey === actionKey) {
      return;
    }

    // An already-linked activity should never be approved again for the
    // same report. The backend also enforces this as an idempotency guard.
    const existingActivity = dashboard?.schedule.find(
      (activity) =>
        activity.activityId === result.activity.activityId
    );

    if (
      action === "APPROVED" &&
      existingActivity?.linkedReportId === reportId
    ) {
      setSelectedMatch(result);
      setActionMessage(
        `${result.activity.activityId} is already approved for ${reportId}.`
      );
      setScheduleSearch(result.activity.activityId);
      setShowScheduleDetails(true);
      return;
    }

    try {
      setPendingActionKey(actionKey);
      setActionMessage("");

      const response =
        await fetch("/api/update", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            reportId,

            activityId:
              result.activity.activityId,

            actualStart:
              actualDate,

            actualEnd:
              status === "COMPLETED"
                ? actualDate
                : null,

            status,

            action,

            confidence:
              result.confidence,

            reason:
              result.reason,
          }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to update schedule."
        );
      }

      setActionMessage(
        data.message ||
          "Schedule updated successfully."
      );

      setSelectedMatch(result);

      // Put the updated activity at the top of the schedule view and
      // open the compact table so the judge can immediately see the change.
      setScheduleSearch(
        result.activity.activityId
      );
      setShowScheduleDetails(true);

      await loadDashboard();

    } catch (error) {
      console.error(error);

      setActionMessage(
        error instanceof Error
          ? error.message
          : "Failed to update schedule."
      );
    } finally {
      setPendingActionKey("");
    }
  }

  /*
   * --------------------------------------------------
   * FILE SELECTION
   * --------------------------------------------------
   */

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0] ||
      null;

    setSelectedFile(file);
    setBatchResults([]);
    setBatchSummary(null);
    setBatchMessage("");
  }

  /*
   * --------------------------------------------------
   * BATCH CSV PROCESSING
   * --------------------------------------------------
   */

  async function handleBatchUpload() {
    if (!selectedFile) {
      setBatchMessage(
        "Please select a CSV file first."
      );

      return;
    }

    try {
      setBatchLoading(true);
      setBatchMessage("");
      setBatchResults([]);
      setBatchSummary(null);

      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile
      );

      const response =
        await fetch(
          "/api/batch-match",
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to process CSV."
        );
      }

      setBatchResults(
        data.results || []
      );

      setBatchSummary(
        data.summary || null
      );

      setBatchMessage(
        `Successfully processed ${
          data.summary?.totalReports || 0
        } progress reports.`
      );

    } catch (error) {
      console.error(error);

      setBatchMessage(
        error instanceof Error
          ? error.message
          : "Failed to process CSV."
      );

    } finally {
      setBatchLoading(false);
    }
  }

  /*
   * --------------------------------------------------
   * BATCH APPROVAL
   * --------------------------------------------------
   */

  async function approveBatchResult(
    result: BatchResult
  ) {
    if (!result.bestMatch) {
      return;
    }

    try {
      const response =
        await fetch("/api/update", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            reportId:
              result.report.reportId,

            activityId:
              result.bestMatch.activity
                .activityId,

            actualStart:
              result.report.date,

            actualEnd:
              result.executionEvent.status ===
              "COMPLETED"
                ? result.report.date
                : null,

            status:
              result.executionEvent.status,

            action: "APPROVED",

            confidence:
              result.bestMatch.confidence,

            reason:
              result.bestMatch.reason,
          }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to approve update."
        );
      }

      setBatchResults(
        (previous) =>
          previous.map(
            (item) =>
              item.report.reportId ===
              result.report.reportId
                ? {
                    ...item,

                    bestMatch:
                      item.bestMatch
                        ? {
                            ...item.bestMatch,

                            status:
                              "AUTO_LINK",
                          }
                        : null,
                  }
                : item
          )
      );

      setBatchMessage(
        `Approved ${result.report.reportId} → ${result.bestMatch.activity.activityId}`
      );

      await loadDashboard();

    } catch (error) {
      console.error(error);

      setBatchMessage(
        error instanceof Error
          ? error.message
          : "Failed to approve update."
      );
    }
  }

  /*
   * --------------------------------------------------
   * FILTER SCHEDULE
   * --------------------------------------------------
   */

  const sortedSchedule =
    [...(dashboard?.schedule ?? [])].sort(
      (a, b) => {
        // Linked/updated activities always appear first. This makes a
        // freshly approved activity immediately visible to the planner.
        const aLinked = a.linkedReportId ? 1 : 0;
        const bLinked = b.linkedReportId ? 1 : 0;

        if (bLinked !== aLinked) {
          return bLinked - aLinked;
        }

        const statusRank: Record<string, number> = {
          COMPLETED: 3,
          IN_PROGRESS: 2,
          STARTED: 1,
          NOT_STARTED: 0,
        };

        const aStatus = statusRank[a.currentStatus] ?? 0;
        const bStatus = statusRank[b.currentStatus] ?? 0;

        if (bStatus !== aStatus) {
          return bStatus - aStatus;
        }

        return a.plannedStart.localeCompare(b.plannedStart);
      }
    );

  const filteredSchedule =
    sortedSchedule.filter(
      (activity) => {
        const search =
          scheduleSearch
            .toLowerCase()
            .trim();

        const matchesSearch =
          !search ||
          activity.activityId
            .toLowerCase()
            .includes(search) ||
          activity.activityDescription
            .toLowerCase()
            .includes(search);

        const matchesDiscipline =
          scheduleDiscipline ===
            "ALL" ||
          activity.discipline ===
            scheduleDiscipline;

        const matchesStatus =
          scheduleStatus === "ALL" ||
          activity.currentStatus ===
            scheduleStatus;

        return (
          matchesSearch &&
          matchesDiscipline &&
          matchesStatus
        );
      }
    );

  // Keep one latest decision per report/activity pair. Older duplicate
  // approvals remain in the audit database, but are never shown repeatedly
  // in the presentation dashboard.
  const uniqueRecentUpdates =
    dashboard?.recentUpdates
      ? Array.from(
          new Map(
            [...dashboard.recentUpdates]
              .sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime()
              )
              .map((update) => [
                `${update.reportId}-${update.activityId}`,
                update,
              ])
          ).values()
        ).slice(0, 4)
      : [];

  /*
   * --------------------------------------------------
   * UI
   * --------------------------------------------------
   */

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px",
        background: "#f5f7fb",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* --------------------------------------------------
            HEADER
        -------------------------------------------------- */}

        <section
          style={{
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#2563eb",
              marginBottom: "8px",
              letterSpacing: "0.05em",
            }}
          >
            KARYASANKET
          </div>

          <h1
            style={{
              fontSize: "36px",
              fontWeight: 800,
              margin: 0,
              marginBottom: "8px",
            }}
          >
            Planning-to-Execution
            Intelligence Layer
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "16px",
            }}
          >
            Connect messy construction site
            updates with structured L5/L6
            project schedules — with confidence,
            planner validation, and an audit trail.
          </p>
        </section>

        {/* --------------------------------------------------
            ERROR
        -------------------------------------------------- */}

        {dashboardError && (
          <div
            style={{
              background: "#fee2e2",
              border:
                "1px solid #fecaca",
              padding: "14px",
              borderRadius: "10px",
              marginBottom: "20px",
              color: "#991b1b",
            }}
          >
            {dashboardError}
          </div>
        )}

        {/* --------------------------------------------------
            DASHBOARD CARDS
        -------------------------------------------------- */}

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <DashboardCard
            title="Schedule Activities"
            value={
              loadingDashboard
                ? "..."
                : dashboard?.totalActivities ??
                  0
            }
          />

          <DashboardCard
            title="Reports Processed"
            value={
              loadingDashboard
                ? "..."
                : dashboard?.reportsProcessed ??
                  0
            }
          />

          <DashboardCard
            title="Linked Activities"
            value={
              loadingDashboard
                ? "..."
                : dashboard?.linkedActivities ??
                  0
            }
          />

          <DashboardCard
            title="Approved Updates"
            value={
              loadingDashboard
                ? "..."
                : dashboard?.approvedUpdates ??
                  0
            }
          />
        </section>

        {/* --------------------------------------------------
            AI PIPELINE
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "22px",
            marginBottom: "28px",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: "18px",
              fontSize: "20px",
            }}
          >
            AI Pipeline
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <PipelineCard
              title="1. Capture"
              description="Site report / CSV"
            />

            <PipelineCard
              title="2. Extract"
              description="Execution event"
            />

            <PipelineCard
              title="3. Match"
              description="Hybrid AI matching"
            />

            <PipelineCard
              title="4. Verify"
              description="Planner approval"
            />

            <PipelineCard
              title="5. Update"
              description="Schedule + audit trail"
            />
          </div>
        </section>

        {/* --------------------------------------------------
            BATCH CSV UPLOAD
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                }}
              >
                Batch Site Report Ingestion
              </h2>

              <p
                style={{
                  margin:
                    "6px 0 0",
                  color: "#6b7280",
                }}
              >
                Upload a CSV containing
                multiple daily site progress
                reports and let KaryaSanket
                link them to the schedule.
              </p>
            </div>

            <div
              style={{
                padding:
                  "8px 12px",
                borderRadius: "999px",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              CSV INGESTION
            </div>
          </div>

          <div
            style={{
              border:
                "2px dashed #d1d5db",
              borderRadius: "12px",
              padding: "24px",
              background: "#fafafa",
            }}
          >
            <input
              type="file"
              accept=".csv"
              onChange={
                handleFileChange
              }
              style={{
                display: "block",
                marginBottom: "14px",
              }}
            />

            {selectedFile && (
              <div
                style={{
                  marginBottom: "14px",
                  fontSize: "14px",
                  color: "#374151",
                }}
              >
                Selected file:{" "}
                <strong>
                  {selectedFile.name}
                </strong>
              </div>
            )}

            <button
              onClick={
                handleBatchUpload
              }
              disabled={batchLoading}
              style={{
                border: "none",
                borderRadius: "9px",
                padding:
                  "11px 18px",
                background:
                  batchLoading
                    ? "#9ca3af"
                    : "#2563eb",
                color: "white",
                fontWeight: 700,
                cursor:
                  batchLoading
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {batchLoading
                ? "Processing Reports..."
                : "Process CSV Reports"}
            </button>

            {batchMessage && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#f0fdf4",
                  color: "#166534",
                  fontSize: "14px",
                }}
              >
                {batchMessage}
              </div>
            )}
          </div>

          {/* --------------------------------------------------
              BATCH SUMMARY
          -------------------------------------------------- */}

          {batchSummary && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <SummaryCard
                title="Reports"
                value={
                  batchSummary.totalReports
                }
              />

              <SummaryCard
                title="Auto Link"
                value={
                  batchSummary.autoLinkCandidates
                }
              />

              <SummaryCard
                title="Planner Review"
                value={
                  batchSummary.reviewCandidates
                }
              />

              <SummaryCard
                title="Unmatched"
                value={
                  batchSummary.unmatchedCandidates
                }
              />
            </div>
          )}

          {/* --------------------------------------------------
              BATCH RESULTS
          -------------------------------------------------- */}

          {batchResults.length > 0 && (
            <div
              style={{
                marginTop: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  marginBottom: "14px",
                }}
              >
                Batch Matching Results
              </h3>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                }}
              >
                {batchResults.map(
                  (result) => {
                    const best =
                      result.bestMatch;

                    const isApproved =
                      best?.status ===
                      "AUTO_LINK";

                    return (
                      <div
                        key={
                          result.report
                            .reportId
                        }
                        style={{
                          border:
                            "1px solid #e5e7eb",
                          borderRadius:
                            "12px",
                          padding: "18px",
                          background:
                            isApproved
                              ? "#f0fdf4"
                              : "white",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "flex-start",
                            gap: "16px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              minWidth:
                                "280px",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                gap: "8px",
                                alignItems:
                                  "center",
                                marginBottom:
                                  "8px",
                                flexWrap:
                                  "wrap",
                              }}
                            >
                              <strong>
                                {
                                  result
                                    .report
                                    .reportId
                                }
                              </strong>

                              <StatusBadge
                                status={
                                  best?.status ||
                                  "UNMATCHED"
                                }
                              />

                              <span
                                style={{
                                  fontSize:
                                    "12px",
                                  color:
                                    "#6b7280",
                                }}
                              >
                                {
                                  result
                                    .report
                                    .discipline
                                }
                              </span>
                            </div>

                            <p
                              style={{
                                margin:
                                  "0 0 12px",
                                fontWeight:
                                  600,
                              }}
                            >
                              {
                                result
                                  .report
                                  .progressDescription
                              }
                            </p>

                            {best ? (
                              <>
                                <div
                                  style={{
                                    padding:
                                      "12px",
                                    borderRadius:
                                      "8px",
                                    background:
                                      "#f9fafb",
                                    marginBottom:
                                      "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize:
                                        "13px",
                                      color:
                                        "#6b7280",
                                      marginBottom:
                                        "4px",
                                    }}
                                  >
                                    Suggested
                                    schedule
                                    activity
                                  </div>

                                  <strong>
                                    {
                                      best
                                        .activity
                                        .activityId
                                    }
                                  </strong>

                                  <div
                                    style={{
                                      marginTop:
                                        "3px",
                                      fontSize:
                                        "14px",
                                    }}
                                  >
                                    {
                                      best
                                        .activity
                                        .activityDescription
                                    }
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display:
                                      "flex",
                                    gap: "18px",
                                    flexWrap:
                                      "wrap",
                                    fontSize:
                                      "13px",
                                  }}
                                >
                                  <span>
                                    <strong>
                                      Confidence:
                                    </strong>{" "}
                                    {Math.round(
                                      best.confidence
                                    )}
                                    %
                                  </span>

                                  <span>
                                    <strong>
                                      Score:
                                    </strong>{" "}
                                    {best.score.toFixed(
                                      1
                                    )}
                                  </span>
                                </div>

                                <p
                                  style={{
                                    margin:
                                      "10px 0 0",
                                    color:
                                      "#4b5563",
                                    fontSize:
                                      "13px",
                                  }}
                                >
                                  {
                                    best.reason
                                  }
                                </p>
                              </>
                            ) : (
                              <div
                                style={{
                                  padding:
                                    "12px",
                                  borderRadius:
                                    "8px",
                                  background:
                                    "#fef2f2",
                                  color:
                                    "#991b1b",
                                }}
                              >
                                No confident
                                schedule
                                activity found.
                              </div>
                            )}
                          </div>

                          <div>
                            {best &&
                              !isApproved && (
                                <button
                                  onClick={() =>
                                    approveBatchResult(
                                      result
                                    )
                                  }
                                  style={{
                                    border:
                                      "none",
                                    borderRadius:
                                      "8px",
                                    padding:
                                      "10px 14px",
                                    background:
                                      "#16a34a",
                                    color:
                                      "white",
                                    fontWeight:
                                      700,
                                    cursor:
                                      "pointer",
                                  }}
                                >
                                  Approve & Update
                                </button>
                              )}

                            {isApproved && (
                              <div
                                style={{
                                  padding:
                                    "10px 14px",
                                  borderRadius:
                                    "8px",
                                  background:
                                    "#dcfce7",
                                  color:
                                    "#166534",
                                  fontWeight:
                                    700,
                                  fontSize:
                                    "13px",
                                }}
                              >
                                ✓ APPROVED
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </section>

        {/* --------------------------------------------------
            AI LINKING ANALYTICS
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                }}
              >
                AI Linking Analytics
              </h2>

              <p
                style={{
                  margin:
                    "6px 0 0",
                  color: "#6b7280",
                }}
              >
                Real-time view of how site
                reports are being connected
                to the project schedule.
              </p>
            </div>

            <div
              style={{
                padding:
                  "8px 12px",
                borderRadius: "999px",
                background: "#ecfdf5",
                color: "#047857",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              AI MATCHING ACTIVE
            </div>
          </div>

          {dashboard && (
            <>
              {/* ANALYTICS CARDS */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "14px",
                  marginBottom: "22px",
                }}
              >
                <AnalyticsCard
                  title="Auto-Link Candidates"
                  value={
                    dashboard.autoLinkCandidates
                  }
                  description="High-confidence matches"
                />

                <AnalyticsCard
                  title="Planner Review"
                  value={
                    dashboard.reviewCandidates
                  }
                  description="Requires human verification"
                />

                <AnalyticsCard
                  title="Unmatched"
                  value={
                    dashboard.unmatchedCandidates
                  }
                  description="No confident schedule link"
                />

                <AnalyticsCard
                  title="Match Coverage"
                  value={`${calculateLinkingRate(
                    dashboard
                  )}%`}
                  description="Reports mapped to a schedule candidate"
                />
              </div>

              {/* LINKING DISTRIBUTION */}

              <div
                style={{
                  marginBottom: "22px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    marginBottom: "8px",
                    fontSize: "13px",
                    color: "#6b7280",
                  }}
                >
                  <span>
                    Matching confidence
                  </span>

                  <span>
                    {
                      dashboard.reportsProcessed
                    }{" "}
                    reports processed
                  </span>
                </div>

                <div
                  style={{
                    height: "14px",
                    width: "100%",
                    background:
                      "#f3f4f6",
                    borderRadius:
                      "999px",
                    overflow:
                      "hidden",
                    display: "flex",
                  }}
                >
                  {dashboard.reportsProcessed >
                    0 && (
                    <>
                      <div
                        style={{
                          width: `${(
                            (dashboard.autoLinkCandidates /
                              dashboard.reportsProcessed) *
                            100
                          ).toFixed(2)}%`,
                          background:
                            "#16a34a",
                        }}
                        title="Auto-link candidates"
                      />

                      <div
                        style={{
                          width: `${(
                            (dashboard.reviewCandidates /
                              dashboard.reportsProcessed) *
                            100
                          ).toFixed(2)}%`,
                          background:
                            "#f59e0b",
                        }}
                        title="Planner review candidates"
                      />

                      <div
                        style={{
                          width: `${(
                            (dashboard.unmatchedCandidates /
                              dashboard.reportsProcessed) *
                            100
                          ).toFixed(2)}%`,
                          background:
                            "#ef4444",
                        }}
                        title="Unmatched candidates"
                      />
                    </>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "18px",
                    flexWrap: "wrap",
                    marginTop: "10px",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  <span>
                    ● Auto-link
                  </span>

                  <span>
                    ● Planner review
                  </span>

                  <span>
                    ● Unmatched
                  </span>
                </div>
              </div>

              {/* DISCIPLINE SUMMARY */}

              <div>
                <h3
                  style={{
                    margin:
                      "0 0 12px",
                    fontSize: "16px",
                  }}
                >
                  Schedule Coverage
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {[
                    "Civil",
                    "Piping",
                    "Electrical",
                    "Instrumentation",
                    "Mechanical",
                    "HSE",
                  ].map(
                    (disciplineName) => {
                      const total =
                        dashboard.schedule.filter(
                          (activity) =>
                            activity.discipline ===
                            disciplineName
                        ).length;

                      const linked =
                        dashboard.schedule.filter(
                          (activity) =>
                            activity.discipline ===
                              disciplineName &&
                            activity.linkedReportId
                        ).length;

                      return (
                        <div
                          key={
                            disciplineName
                          }
                          style={{
                            border:
                              "1px solid #e5e7eb",
                            borderRadius:
                              "10px",
                            padding:
                              "13px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                              marginBottom:
                                "5px",
                            }}
                          >
                            {
                              disciplineName
                            }
                          </div>

                          <div
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                "space-between",
                              alignItems:
                                "center",
                            }}
                          >
                            <strong
                              style={{
                                fontSize:
                                  "20px",
                              }}
                            >
                              {linked}
                            </strong>

                            <span
                              style={{
                                fontSize:
                                  "12px",
                                color:
                                  "#6b7280",
                              }}
                            >
                              / {total} linked
                            </span>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {/* --------------------------------------------------
            SCHEDULE STATUS OVERVIEW
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                }}
              >
                Schedule Status Overview
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#6b7280",
                }}
              >
                Updated activities are prioritized; the full schedule stays compact.
              </p>
            </div>

            <button
              onClick={() =>
                setShowScheduleDetails(
                  (previous) => !previous
                )
              }
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                padding: "9px 13px",
                background: "white",
                color: "#111827",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {showScheduleDetails
                ? "Hide Schedule"
                : `View ${dashboard?.totalActivities ?? 0} Activities`}
            </button>
          </div>

          {dashboard && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              <SummaryCard
                title="Total Activities"
                value={dashboard.totalActivities}
              />

              <SummaryCard
                title="Linked / Updated"
                value={dashboard.linkedActivities}
              />

              <SummaryCard
                title="Not Started"
                value={
                  dashboard.schedule.filter(
                    (activity) =>
                      activity.currentStatus ===
                      "NOT_STARTED"
                  ).length
                }
              />
            </div>
          )}

          {!showScheduleDetails && dashboard && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px 16px",
                border: "1px solid #dcfce7",
                borderRadius: "10px",
                background: "#f0fdf4",
              }}
            >
              {sortedSchedule[0]?.linkedReportId ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        color: "#166534",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Latest Linked Activity
                    </div>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "4px",
                      }}
                    >
                      {sortedSchedule[0].activityId} — {sortedSchedule[0].activityDescription}
                    </strong>
                    <span
                      style={{
                        color: "#4b5563",
                        fontSize: "13px",
                      }}
                    >
                      Report {sortedSchedule[0].linkedReportId} · {sortedSchedule[0].currentStatus.replace("_", " ")}
                    </span>
                  </div>

                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    AI LINKED
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    color: "#4b5563",
                    fontSize: "14px",
                  }}
                >
                  No schedule activity has been approved yet.
                </div>
              )}
            </div>
          )}

          {showScheduleDetails && (
            <div style={{ marginTop: "18px" }}>
              {/* FILTERS */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr",
                  gap: "10px",
                  marginBottom: "14px",
                }}
              >
                <input
                  value={scheduleSearch}
                  onChange={(event) =>
                    setScheduleSearch(event.target.value)
                  }
                  placeholder="Search activity ID or description..."
                  style={{
                    padding: "11px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />

                <select
                  value={scheduleDiscipline}
                  onChange={(event) =>
                    setScheduleDiscipline(event.target.value)
                  }
                  style={{
                    padding: "11px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                  }}
                >
                  <option value="ALL">All Disciplines</option>
                  <option value="Civil">Civil</option>
                  <option value="Piping">Piping</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Instrumentation">Instrumentation</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="HSE">HSE</option>
                </select>

                <select
                  value={scheduleStatus}
                  onChange={(event) =>
                    setScheduleStatus(event.target.value)
                  }
                  style={{
                    padding: "11px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="STARTED">Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    maxHeight: "390px",
                    overflow: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "14px",
                    }}
                  >
                    <thead
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "#f9fafb",
                        zIndex: 1,
                      }}
                    >
                      <tr>
                        <th style={tableHeaderStyle}>Activity</th>
                        <th style={tableHeaderStyle}>Discipline</th>
                        <th style={tableHeaderStyle}>Planned</th>
                        <th style={tableHeaderStyle}>Actual</th>
                        <th style={tableHeaderStyle}>Status</th>
                        <th style={tableHeaderStyle}>AI Link</th>
                        <th style={tableHeaderStyle}>Confidence</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredSchedule.map((activity) => (
                        <tr
                          key={activity.activityId}
                          style={{
                            background: activity.linkedReportId
                              ? "#f0fdf4"
                              : "white",
                          }}
                        >
                          <td style={tableCellStyle}>
                            <strong>{activity.activityId}</strong>
                            <div
                              style={{
                                marginTop: "4px",
                                color: "#6b7280",
                              }}
                            >
                              {activity.activityDescription}
                            </div>
                          </td>

                          <td style={tableCellStyle}>
                            {activity.discipline}
                          </td>

                          <td style={tableCellStyle}>
                            {activity.plannedStart} → {activity.plannedEnd}
                          </td>

                          <td style={tableCellStyle}>
                            {activity.actualStart
                              ? `${activity.actualStart}${
                                  activity.actualEnd
                                    ? ` → ${activity.actualEnd}`
                                    : ""
                                }`
                              : "—"}
                          </td>

                          <td style={tableCellStyle}>
                            <StatusBadge status={activity.currentStatus} />
                          </td>

                          <td style={tableCellStyle}>
                            {activity.linkedReportId ? (
                              <span
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                {activity.linkedReportId}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td style={tableCellStyle}>
                            {activity.confidence !== null
                              ? `${Math.round(activity.confidence)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {filteredSchedule.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px",
                    color: "#6b7280",
                  }}
                >
                  No schedule activities match the current filters.
                </div>
              )}

              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                Showing {filteredSchedule.length} of {dashboard?.totalActivities ?? 0} activities · linked activities are prioritized.
              </div>
            </div>
          )}
        </section>

        {/* --------------------------------------------------
            SINGLE REPORT AI MATCHING
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontSize: "22px",
            }}
          >
            AI Schedule Linking
          </h2>

          <p
            style={{
              color: "#6b7280",
              marginBottom: "20px",
            }}
          >
            Test an individual site update
            and review the AI-generated
            schedule link.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <input
              value={reportId}
              onChange={(event) =>
                setReportId(
                  event.target.value
                )
              }
              placeholder="Report ID"
              style={inputStyle}
            />

            <select
              value={discipline}
              onChange={(event) =>
                setDiscipline(
                  event.target.value
                )
              }
              style={inputStyle}
            >
              <option value="Civil">
                Civil
              </option>

              <option value="Piping">
                Piping
              </option>

              <option value="Electrical">
                Electrical
              </option>

              <option value="Instrumentation">
                Instrumentation
              </option>

              <option value="Mechanical">
                Mechanical
              </option>

              <option value="HSE">
                HSE
              </option>
            </select>

            <input
              type="date"
              value={actualDate}
              onChange={(event) =>
                setActualDate(
                  event.target.value
                )
              }
              style={inputStyle}
            />

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value
                )
              }
              style={inputStyle}
            >
              <option value="STARTED">
                Started
              </option>

              <option value="IN_PROGRESS">
                In Progress
              </option>

              <option value="COMPLETED">
                Completed
              </option>

              <option value="UNKNOWN">
                Unknown
              </option>
            </select>
          </div>

          <textarea
            value={
              progressDescription
            }
            onChange={(event) =>
              setProgressDescription(
                event.target.value
              )
            }
            placeholder="Enter site progress update..."
            rows={4}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px",
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
              resize: "vertical",
              marginBottom: "12px",
              fontFamily:
                "inherit",
            }}
          />

          <button
            onClick={handleMatch}
            disabled={matching}
            style={{
              border: "none",
              borderRadius: "8px",
              padding:
                "11px 18px",
              background:
                matching
                  ? "#9ca3af"
                  : "#111827",
              color: "white",
              fontWeight: 700,
              cursor:
                matching
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {matching
              ? "Matching..."
              : "Find Schedule Activity"}
          </button>

          {actionMessage && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
              }}
            >
              {actionMessage}
            </div>
          )}

          {/* --------------------------------------------------
              MATCH RESULTS
          -------------------------------------------------- */}

          {matchCompleted && (
            <div
              style={{
                marginTop: "24px",
              }}
            >
              <h3
                style={{
                  marginBottom: "14px",
                }}
              >
                AI Matching Results
              </h3>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                }}
              >
                {matches.length === 0 ? (
                  /* --------------------------------------------------
                     NO MATCH / UNMATCHED CARD
                  -------------------------------------------------- */

                  <div
                    style={{
                      border:
                        "2px solid #ef4444",
                      borderRadius: "10px",
                      padding: "20px",
                      background:
                        "#fef2f2",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                        gap: "20px",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          minWidth:
                            "280px",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "10px",
                            marginBottom:
                              "8px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <strong
                            style={{
                              fontSize:
                                "18px",
                              color:
                                "#991b1b",
                            }}
                          >
                            UNMATCHED
                          </strong>

                          <span
                            style={{
                              padding:
                                "5px 9px",
                              borderRadius:
                                "999px",
                              background:
                                "#fee2e2",
                              color:
                                "#991b1b",
                              fontSize:
                                "12px",
                              fontWeight:
                                800,
                            }}
                          >
                            NO CONFIDENT MATCH
                          </span>
                        </div>

                        <div
                          style={{
                            color:
                              "#374151",
                            lineHeight:
                              1.5,
                          }}
                        >
                          No suitable
                          schedule
                          activity was
                          found for
                          this execution
                          update.
                        </div>

                        <div
                          style={{
                            marginTop:
                              "10px",
                            fontSize:
                              "13px",
                            color:
                              "#6b7280",
                            lineHeight:
                              1.5,
                          }}
                        >
                          The update may
                          represent a
                          new or
                          unplanned
                          activity.
                          Planner review
                          is recommended
                          instead of
                          forcing an
                          incorrect
                          schedule link.
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign:
                            "right",
                          minWidth:
                            "90px",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              "30px",
                            fontWeight:
                              800,
                            color:
                              "#991b1b",
                          }}
                        >
                          0%
                        </div>

                        <div
                          style={{
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                          }}
                        >
                          Confidence
                        </div>
                      </div>
                    </div>
                  </div>

                ) : (

                  /* --------------------------------------------------
                     MATCH RESULTS
                  -------------------------------------------------- */

                  matches.map(
                    (
                      result,
                      index
                    ) => (
                      <div
                        key={
                          result
                            .activity
                            .activityId
                        }
                        style={{
                          border:
                            index === 0
                              ? "2px solid #2563eb"
                              : "1px solid #e5e7eb",
                          borderRadius:
                            "10px",
                          padding:
                            "16px",
                          background:
                            index === 0
                              ? "#ffffff"
                              : "#fafafa",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            gap: "12px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          {/* MATCH INFORMATION */}

                          <div
                            style={{
                              flex: 1,
                              minWidth:
                                "280px",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                gap: "8px",
                                alignItems:
                                  "center",
                                marginBottom:
                                  "6px",
                                flexWrap:
                                  "wrap",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize:
                                    "17px",
                                }}
                              >
                                {
                                  result
                                    .activity
                                    .activityId
                                }
                              </strong>

                              <StatusBadge
                                status={
                                  result.status
                                }
                              />

                              {index ===
                                0 && (
                                <span
                                  style={{
                                    padding:
                                      "5px 8px",
                                    borderRadius:
                                      "999px",
                                    background:
                                      "#dbeafe",
                                    color:
                                      "#1d4ed8",
                                    fontSize:
                                      "11px",
                                    fontWeight:
                                      800,
                                  }}
                                >
                                  RECOMMENDED MATCH
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  "15px",
                                fontWeight:
                                  600,
                              }}
                            >
                              {
                                result
                                  .activity
                                  .activityDescription
                              }
                            </div>

                            <div
                              style={{
                                marginTop:
                                  "8px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                background: index === 0 ? "#eff6ff" : "#f3f4f6",
                                color: "#374151",
                                fontSize: "13px",
                                lineHeight: 1.5,
                              }}
                            >
                              <strong style={{ color: "#1d4ed8" }}>
                                Why this match:</strong>
                              {result.reason}
                            </div>
                          </div>

                          {/* CONFIDENCE */}

                          <div
                            style={{
                              textAlign:
                                "right",
                              minWidth:
                                "100px",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  "28px",
                                fontWeight:
                                  800,
                                color:
                                  result.confidence >=
                                  80
                                    ? "#166534"
                                    : result.confidence >=
                                      45
                                    ? "#92400e"
                                    : "#991b1b",
                              }}
                            >
                              {Math.round(
                                result.confidence
                              )}
                              %
                            </div>

                            <div
                              style={{
                                fontSize:
                                  "12px",
                                color:
                                  "#6b7280",
                              }}
                            >
                              Confidence
                            </div>
                          </div>
                        </div>

                        {/* MATCHING BREAKDOWN */}

                        {result.breakdown && (
                          <div
                            style={{
                              display:
                                "flex",
                              gap: "10px",
                              flexWrap:
                                "wrap",
                              marginTop:
                                "12px",
                              fontSize:
                                "12px",
                            }}
                          >
                            <ScorePill
                              label="Identifier"
                              value={
                                result
                                  .breakdown
                                  .identifier
                              }
                            />

                            <ScorePill
                              label="Operation"
                              value={
                                result
                                  .breakdown
                                  .operation
                              }
                            />

                            <ScorePill
                              label="Token"
                              value={
                                result
                                  .breakdown
                                  .token
                              }
                            />

                            <ScorePill
                              label="Fuzzy"
                              value={
                                result
                                  .breakdown
                                  .fuzzy
                              }
                            />
                          </div>
                        )}

                        {/* SCORE + DECISION */}

                        <div
                          style={{
                            display:
                              "flex",
                            gap: "18px",
                            flexWrap:
                              "wrap",
                            marginTop:
                              "12px",
                            fontSize:
                              "13px",
                            color:
                              "#374151",
                          }}
                        >
                          <span>
                            <strong>
                              Match Score:
                            </strong>{" "}
                            {result.score.toFixed(
                              1
                            )}
                          </span>

                          <span>
                            <strong>
                              Decision:
                            </strong>{" "}
                            {result.status.replace(
                              "_",
                              " "
                            )}
                          </span>
                        </div>

                        {/* APPROVE / REJECT */}

                        {index === 0 &&
                          result.status !== "UNMATCHED" && (() => {
                            const alreadyApproved =
                              dashboard?.schedule.some(
                                (activity) =>
                                  activity.activityId ===
                                    result.activity.activityId &&
                                  activity.linkedReportId === reportId
                              ) ?? false;

                            const isPending =
                              pendingActionKey ===
                              `${reportId}-${result.activity.activityId}`;

                            return (
                              <div
                                style={{
                                  marginTop: "14px",
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <button
                                  disabled={alreadyApproved || isPending}
                                  onClick={() =>
                                    handleScheduleAction(
                                      "APPROVED",
                                      result
                                    )
                                  }
                                  style={{
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "9px 13px",
                                    background:
                                      alreadyApproved
                                        ? "#9ca3af"
                                        : isPending
                                        ? "#86efac"
                                        : "#16a34a",
                                    color: "white",
                                    fontWeight: 700,
                                    cursor:
                                      alreadyApproved || isPending
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  {alreadyApproved
                                    ? "✓ Already Approved"
                                    : isPending
                                    ? "Saving..."
                                    : "Approve & Update Schedule"}
                                </button>

                                {!alreadyApproved && (
                                  <button
                                    disabled={isPending}
                                    onClick={() =>
                                      handleScheduleAction(
                                        "REJECTED",
                                        result
                                      )
                                    }
                                    style={{
                                      border: "1px solid #d1d5db",
                                      borderRadius: "8px",
                                      padding: "9px 13px",
                                      background: "white",
                                      color: "#374151",
                                      fontWeight: 700,
                                      cursor: isPending
                                        ? "not-allowed"
                                        : "pointer",
                                    }}
                                  >
                                    Reject Match
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}

        </section>

        {/* --------------------------------------------------
            RECENT SCHEDULE DECISIONS
        -------------------------------------------------- */}

        <section
          style={{
            background: "white",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "14px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                }}
              >
                Recent Schedule Decisions
              </h2>
              <p
                style={{
                  margin: "5px 0 0",
                  color: "#6b7280",
                  fontSize: "13px",
                }}
              >
                Latest decision per report/activity pair.
              </p>
            </div>

            <span
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                background: "#f3f4f6",
                color: "#374151",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              {uniqueRecentUpdates.length} recent
            </span>
          </div>

          {uniqueRecentUpdates.length ? (
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {uniqueRecentUpdates.map(
                (
                  update,
                  index
                ) => (
                  <div
                    key={`${update.reportId}-${index}`}
                    style={{
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "9px",
                      padding:
                        "12px 14px",
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: "12px",
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div>
                      <strong>
                        {
                          update.reportId
                        }
                      </strong>

                      {" → "}

                      <strong>
                        {
                          update.activityId
                        }
                      </strong>

                      <div
                        style={{
                          fontSize:
                            "13px",
                          color:
                            "#6b7280",
                          marginTop:
                            "4px",
                        }}
                      >
                        {
                          update.reason
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight:
                          700,
                        fontSize:
                          "13px",
                      }}
                    >
                      {
                        update.action
                      }{" "}
                      ·{" "}
                      {Math.round(
                        update.confidence
                      )}
                      %
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <p
              style={{
                color: "#6b7280",
              }}
            >
              No schedule decisions
              recorded yet.
            </p>
          )}
        </section>

        {/* --------------------------------------------------
            WORKFLOW
        -------------------------------------------------- */}

        <section
          style={{
            background: "#111827",
            color: "white",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontSize: "22px",
            }}
          >
            KaryaSanket Workflow
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              marginTop: "18px",
            }}
          >
            {[
              "Messy Site Update",
              "AI Extraction",
              "Hybrid Matching",
              "Confidence + Explanation",
              "Planner Approval",
              "Schedule Update",
              "Execution Audit Trail",
            ].map(
              (
                step,
                index
              ) => (
                <div
                  key={step}
                  style={{
                    padding: "14px",
                    border:
                      "1px solid #374151",
                    borderRadius:
                      "10px",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "12px",
                      color:
                        "#9ca3af",
                      marginBottom:
                        "6px",
                    }}
                  >
                    STEP {index + 1}
                  </div>

                  <strong>
                    {step}
                  </strong>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* --------------------------------------------------
   COMPONENTS
-------------------------------------------------- */

function AnalyticsCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <div
      style={{
        border:
          "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "16px",
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#6b7280",
          marginBottom: "7px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "26px",
          fontWeight: 800,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "#6b7280",
        }}
      >
        {description}
      </div>
    </div>
  );
}

function calculateLinkingRate(
  dashboard: DashboardData
) {
  if (
    dashboard.reportsProcessed === 0
  ) {
    return 0;
  }

  const linked =
    dashboard.autoLinkCandidates +
    dashboard.reviewCandidates;

  return Math.round(
    (linked /
      dashboard.reportsProcessed) *
      100
  );
}

function DashboardCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        background: "white",
        border:
          "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "20px",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: "13px",
          marginBottom: "8px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "28px",
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PipelineCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: "16px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "10px",
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          fontWeight: 800,
          marginBottom: "5px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "13px",
          color: "#6b7280",
        }}
      >
        {description}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding: "15px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "10px",
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#6b7280",
          marginBottom: "5px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "24px",
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  let background = "#f3f4f6";
  let color = "#374151";

  if (status === "AUTO_LINK") {
    background = "#dcfce7";
    color = "#166534";
  }

  if (status === "PLANNER_REVIEW") {
    background = "#fef3c7";
    color = "#92400e";
  }

  if (status === "UNMATCHED") {
    background = "#fee2e2";
    color = "#991b1b";
  }

  if (status === "COMPLETED") {
    background = "#dcfce7";
    color = "#166534";
  }

  if (status === "IN_PROGRESS") {
    background = "#dbeafe";
    color = "#1d4ed8";
  }

  if (status === "STARTED") {
    background = "#e0e7ff";
    color = "#3730a3";
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 8px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "11px",
        fontWeight: 800,
      }}
    >
      {status.replace(
        "_",
        " "
      )}
    </span>
  );
}

function ScorePill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span
      style={{
        padding: "5px 8px",
        borderRadius: "6px",
        background: "#f3f4f6",
      }}
    >
      {label}:{" "}
      <strong>
        {Math.round(value)}
      </strong>
    </span>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  padding: "11px 12px",
  border:
    "1px solid #d1d5db",
  borderRadius: "8px",
};

const tableHeaderStyle = {
  textAlign:
    "left" as const,
  padding: "12px",
  borderBottom:
    "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: "12px",
  textTransform:
    "uppercase" as const,
};

const tableCellStyle = {
  padding: "13px 12px",
  borderBottom:
    "1px solid #f3f4f6",
  verticalAlign:
    "top" as const,
};