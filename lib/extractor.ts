import { ExecutionEvent } from "@/types/schedule";

function detectStatus(text: string): ExecutionEvent["status"] {
  const value = text.toLowerCase();

  if (
    value.includes("completed") ||
    value.includes("complete") ||
    value.includes("finished") ||
    value.includes("done")
  ) {
    return "COMPLETED";
  }

  if (
    value.includes("started") ||
    value.includes("start")
  ) {
    return "STARTED";
  }

  if (
    value.includes("progressing") ||
    value.includes("ongoing") ||
    value.includes("underway") ||
    value.includes("being")
  ) {
    return "IN_PROGRESS";
  }

  return "UNKNOWN";
}

function detectAction(text: string): string {
  const value = text.toLowerCase();

  const actions = [
    "excavation",
    "excavate",
    "reinforcement",
    "rebar",
    "concrete",
    "pouring",
    "casting",
    "shuttering",
    "erection",
    "erect",
    "welding",
    "weld",
    "installation",
    "install",
    "hydrotest",
    "hydro test",
    "insulation",
    "cable pulling",
    "termination",
    "earthing",
    "transformer",
    "testing",
  ];

  for (const action of actions) {
    if (value.includes(action)) {
      return action;
    }
  }

  return "unknown";
}

function detectObject(text: string): string {
  const value = text.toLowerCase();

  if (value.includes("spool")) return "spool";
  if (value.includes("pipe")) return "pipe";
  if (value.includes("support")) return "pipe support";
  if (value.includes("foundation")) return "foundation";
  if (value.includes("column")) return "column";
  if (value.includes("cable tray")) return "cable tray";
  if (value.includes("cable")) return "cable";
  if (value.includes("panel")) return "panel";
  if (value.includes("transformer")) return "transformer";
  if (value.includes("lighting")) return "lighting";
  if (value.includes("earthing")) return "earthing";

  return "unknown";
}

function extractIdentifiers(text: string): string[] {
  const identifiers: string[] = [];

  const patterns = [
    /\bline\s*-?\s*\d+[a-z-]*/gi,
    /\bzone\s*-?\s*[a-z0-9-]+/gi,
    /\barea\s*-?\s*[a-z0-9-]+/gi,
    /\bblock\s*-?\s*[a-z0-9-]+/gi,
    /\broom\s*-?\s*[a-z0-9-]+/gi,
    /\bpanel\s*-?\s*[a-z0-9-]+/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);

    if (matches) {
      identifiers.push(
        ...matches.map((item) => item.trim())
      );
    }
  }

  return [...new Set(identifiers)];
}

export function extractExecutionEvent(
  text: string,
  discipline: string,
  date: string | null = null
): ExecutionEvent {
  return {
    rawText: text,
    action: detectAction(text),
    object: detectObject(text),
    identifiers: extractIdentifiers(text),
    status: detectStatus(text),
    discipline,
    date,
  };
}