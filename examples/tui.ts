import { Effect, Layer, Option } from "effect"
import { Agent, Codex, Copilot, Tui } from "../src/index.ts"
import * as MockModel from "../src/MockModel.ts"
import {
  BunHttpClient,
  BunRuntime,
  BunServices,
  BunTerminal,
} from "@effect/platform-bun"
import { KeyValueStore } from "effect/unstable/persistence"
import * as NodePath from "node:path"
import * as OfflineHttpClient from "../src/OfflineHttpClient.ts"
import * as Session from "../src/Session.ts"

const XDG_CONFIG_HOME =
  process.env.XDG_CONFIG_HOME ||
  NodePath.join(process.env.HOME || "", ".config")

const ModelServices = KeyValueStore.layerFileSystem(
  NodePath.join(XDG_CONFIG_HOME, "clanka"),
).pipe(
  Layer.provide(BunServices.layer),
  Layer.merge(BunHttpClient.layer),
)

const CodexModel = Codex.model("gpt-5.3-codex", {
  reasoning: {
    effort: "high",
  },
}).pipe(Layer.provide(ModelServices))

const CopilotModel = Copilot.model("claude-opus-4.6", {
  thinking: { thinking_budget: 4000 },
}).pipe(Layer.provideMerge(ModelServices))

const LiveSubagentModel = Codex.model("gpt-5.4", {
  reasoning: {
    effort: "low",
    summary: "auto",
  },
}).pipe(Layer.provide(ModelServices))

const MockAgentModel = MockModel.model()
const MockSubagentModel = MockModel.model({
  modelName: "scripted-subagent",
})

const args = process.argv.slice(2)
const useMock = args.includes("--mock")
const useCopilot = args.includes("--copilot")
const runOnce = args.includes("--once")
const initialPrompt = MockModel.defaultPromptFromArgs(
  args.filter((arg) => !arg.startsWith("--")),
)

const AgentLayer = Agent.layerLocal({
  directory: process.cwd(),
}).pipe(
  Layer.provide(BunServices.layer),
  Layer.provide(useMock ? OfflineHttpClient.layer : BunHttpClient.layer),
)

const modelLayer = useMock
  ? MockAgentModel
  : useCopilot
    ? CopilotModel
    : CodexModel

const subagentLayer = useMock ? MockSubagentModel : LiveSubagentModel

Tui.run({
  title: useMock ? "clanka tui (mock)" : "clanka tui",
  initialPrompt: Option.getOrUndefined(initialPrompt),
  autoSubmit: runOnce || Option.isSome(initialPrompt),
  exitOnComplete: runOnce,
}).pipe(
  Effect.scoped,
  Effect.provide([
    modelLayer,
    Agent.layerSubagentModel(subagentLayer),
    AgentLayer,
    Session.layer({
      cwd: process.cwd(),
      title: useMock ? "mock tui session" : "live tui session",
    }).pipe(Layer.provideMerge(BunServices.layer)),
    BunTerminal.layer,
  ]),
  BunRuntime.runMain,
)
