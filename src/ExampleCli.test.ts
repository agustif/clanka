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

describe("examples/cli.ts", () => {
  it("runs in mock mode from a fresh checkout path", async () => {
    const { stdout } = await execFileAsync(
      "bun",
      ["run", "examples/cli.ts", "--mock", "list the workspace"],
      {
        cwd: root,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: NodePath.join(root, ".tmp-xdg"),
        },
      },
    )
    const output = stripAnsi(stdout)

    expect(output).toContain("Task complete")
    expect(output).toContain("Package: clanka@0.1.7")
  })
})
