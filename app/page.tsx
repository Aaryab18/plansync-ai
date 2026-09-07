"use client";

import { useState } from "react";

interface Match {
  activity: {
    activityId: string;
    activityDescription: string;
    discipline: string;
    plannedStart: string;
    plannedEnd: string;
  };
  confidence: number;
  status: "AUTO_LINK" | "PLANNER_REVIEW" | "UNMATCHED";
  reason: string;
}

export default function Home() {
  const [progressDescription, setProgressDescription] =
    useState("");

  const [discipline, setDiscipline] =
    useState("Piping");

  const [matches, setMatches] = useState<Match[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  async function findMatch() {
    if (!progressDescription.trim()) {
      setError("Please enter a site progress update.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          progressDescription,
          discipline,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setMatches(data.matches || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to find matches."
      );
    } finally {
      setLoading(false);
    }
  }

  function getStatusLabel(status: Match["status"]) {
    if (status === "AUTO_LINK") {
      return "AUTO-LINK";
    }

    if (status === "PLANNER_REVIEW") {
      return "PLANNER REVIEW";
    }

    return "UNMATCHED";
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">

        {/* Header */}
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium text-blue-400">
            PLAN SYNC AI
          </p>

          <h1 className="text-4xl font-bold tracking-tight">
            Planning-to-Execution Intelligence
          </h1>

          <p className="mt-3 max-w-2xl text-slate-400">
            Convert messy site progress updates into
            reliable L5/L6 schedule links using hybrid
            matching and confidence-based review.
          </p>
        </div>

        {/* Input Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Site Progress Update
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Enter an update reported by a site supervisor.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_220px]">

            <div>
              <label className="mb-2 block text-sm font-medium">
                Progress Description
              </label>

              <textarea
                value={progressDescription}
                onChange={(e) =>
                  setProgressDescription(e.target.value)
                }
                placeholder="Example: Spool erection for Line 24 completed"
                className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none transition focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Discipline
              </label>

              <select
                value={discipline}
                onChange={(e) =>
                  setDiscipline(e.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none"
              >
                <option>Civil</option>
                <option>Piping</option>
                <option>Electrical</option>
                <option>Instrumentation</option>
                <option>Mechanical</option>
                <option>HSE</option>
              </select>
            </div>

          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={findMatch}
            disabled={loading}
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Analyzing..."
              : "Find Schedule Activity"}
          </button>

        </section>

        {/* Results */}
        {matches.length > 0 && (
          <section className="mt-8">

            <div className="mb-5">
              <h2 className="text-xl font-semibold">
                AI Schedule Linking Results
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Ranked candidates from the hybrid matching engine.
              </p>
            </div>

            <div className="space-y-4">

              {matches.map((match, index) => (
                <div
                  key={match.activity.activityId}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >

                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500">
                          #{index + 1}
                        </span>

                        <span className="font-mono text-sm text-blue-400">
                          {match.activity.activityId}
                        </span>

                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                          {getStatusLabel(match.status)}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-semibold">
                        {match.activity.activityDescription}
                      </h3>

                      <p className="mt-2 text-sm text-slate-400">
                        {match.reason}
                      </p>
                    </div>

                    <div className="min-w-32 text-left md:text-right">
                      <p className="text-3xl font-bold">
                        {match.confidence}%
                      </p>

                      <p className="text-xs text-slate-500">
                        confidence
                      </p>
                    </div>

                  </div>

                  <div className="mt-5 grid gap-3 border-t border-slate-800 pt-4 text-sm md:grid-cols-3">

                    <div>
                      <p className="text-slate-500">
                        Discipline
                      </p>

                      <p className="mt-1">
                        {match.activity.discipline}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500">
                        Planned Start
                      </p>

                      <p className="mt-1">
                        {match.activity.plannedStart}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500">
                        Planned End
                      </p>

                      <p className="mt-1">
                        {match.activity.plannedEnd}
                      </p>
                    </div>

                  </div>

                </div>
              ))}

            </div>
          </section>
        )}

        {/* Empty State */}
        {!loading &&
          progressDescription &&
          matches.length === 0 &&
          !error && (
            <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
              <h2 className="text-xl font-semibold">
                No Confident Match
              </h2>

              <p className="mt-2 text-slate-400">
                This update could not be linked to a
                suitable schedule activity.
              </p>

              <p className="mt-4 text-sm text-amber-400">
                Planner review required — possible new activity.
              </p>
            </section>
          )}

      </div>
    </main>
  );
}