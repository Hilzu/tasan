import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { asSplitID } from "@tasan/common/id";

process.env.TABLE_NAME ??= "TasanAppTable";
const { exportSplitBackup } = await import("@tasan/data");

const { values } = parseArgs({
  options: {
    "split-id": { type: "string" },
  },
});

const splitID = asSplitID(values["split-id"] ?? "");
const backup = await exportSplitBackup(splitID);

const date = new Date()
  .toISOString()
  .replaceAll(":", "")
  .replaceAll("-", "")
  .replace("T", "_")
  .replace(/\.\d\d\dZ$/, "");
const filename = `out/${splitID}-${date}.json`;
await writeFile(filename, backup);
