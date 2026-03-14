import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import * as NodePath from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
const ansiPattern = new RegExp(String.raw`\u001B\[[0-9;?]*[A-Za-z]`, "g")
const stripAnsi = (text: string) =>
  text.replaceAll(ansiPattern, "")

describe("examples/tui.ts", () => {
  it("renders a mock run and exits cleanly in once mode", async () => {
    const { stdout } = await execFileAsync(
      "bun",
      ["run", "examples/tui.ts", "--mock", "--once", "list the workspace"],
      {
        cwd: root,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: NodePath.join(root, ".tmp-xdg"),
          CLANKA_SESSION_DIR: NodePath.join(root, ".tmp-session-tui"),
        },
      },
    )
    const output = stripAnsi(stdout)

    expect(output).toContain("clanka tui (mock)")
    expect(output).toContain("Task complete")
    expect(output).toContain("EVIDENCE Clanka observed concrete output")
  })
})
