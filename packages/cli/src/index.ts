import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { startServer } from "./server.js";

const { values } = parseArgs({
  options: {
    root: { type: "string", short: "r", default: process.cwd() },
    port: { type: "string", short: "p", default: "4242" },
    open: { type: "boolean", default: true },
    "no-open": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const root = resolve(values["root"] as string);
const port = parseInt(values["port"] as string, 10);
const open = !values["no-open"] && (values["open"] as boolean);

await startServer({ root, port, open });
