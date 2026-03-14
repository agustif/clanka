import { readFile, writeFile } from "node:fs/promises";

const inputPath = "session/live-session.jsonl";
const outputPath = "session/live-session-export.json";

const raw = await readFile(inputPath, "utf8");
const lines = raw.split("\n").filter((line) => line.trim().length > 0);

const entries = lines.map((line, i) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid JSONL at line ${i + 1}: ${String(error)}`);
  }
});

await writeFile(
  outputPath,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: inputPath,
      count: entries.length,
      entries,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`Exported ${entries.length} entries from ${inputPath} to ${outputPath}`);
