import { register } from "node:module";

register("tsx/esm", import.meta.url);

import("./server.ts").catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});