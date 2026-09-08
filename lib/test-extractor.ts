import { extractExecutionEvent } from "@/lib/extractor";

const examples = [
  {
    text: "Spool erection for Line 24 completed",
    discipline: "Piping",
  },
  {
    text: "Power cables pulled in Area A",
    discipline: "Electrical",
  },
  {
    text: "Foundation pit excavation completed in Zone A",
    discipline: "Civil",
  },
];

for (const example of examples) {
  console.log(
    extractExecutionEvent(
      example.text,
      example.discipline
    )
  );
}