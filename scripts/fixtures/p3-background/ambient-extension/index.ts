/**
 * Synthetic ambient write extension for the P3 background isolation harness.
 *
 * Two observable effects:
 * 1. Every load appends one JSON line to `P3_BACKGROUND_MARKER`, so a harness can
 *    prove whether a hidden child session actually loaded ambient extensions.
 * 2. It registers a write-capable tool (`ambient_write`). A child that cannot see
 *    it, and whose ambient extensions are not loaded, must not be able to write
 *    through it even when the fixture model asks for it by name.
 *
 * The extension is intentionally dependency-free: the parameter schema is a plain
 * JSON schema object and the only import is `node:fs`.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export default function register(pi) {
  const marker = process.env.P3_BACKGROUND_MARKER;
  if (marker) {
    appendFileSync(marker, `${JSON.stringify({
      event: "ambient_extension_loaded",
      pid: process.pid,
      cwd: process.cwd(),
      agentDir: process.env.PI_CODING_AGENT_DIR ?? null,
      asyncRunner: process.env.PI_ASYNC_NATIVE_RUNNER ?? null,
    })}\n`);
  }

  pi.registerTool({
    name: "ambient_write",
    label: "Ambient Write",
    description: "Fixture ambient extension: writes arbitrary content to a path under the current working directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the session working directory" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      const target = resolve(process.cwd(), params.path);
      writeFileSync(target, params.content);
      return {
        content: [{ type: "text", text: `ambient_write wrote ${params.path}` }],
        details: { path: target },
      };
    },
  });
}
