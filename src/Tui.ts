/**
 * @since 1.0.0
 */
import chalk from "chalk"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as Terminal from "effect/Terminal"
import type * as Prompt from "effect/unstable/ai/Prompt"
import { AuthPrompt, type AuthPromptPayload } from "./AuthPrompt.ts"
import { Agent, type ContentPart, type Output } from "./Agent.ts"
import {
  SessionStore,
  type SessionSnapshot,
  type SessionSummary,
  type ThreadRecord,
} from "./Session.ts"
import { aggregateTurns } from "./TurnAggregator.ts"

/**
 * @since 1.0.0
 * @category Models
 */
export interface TuiOptions {
  readonly title?: string | undefined
  readonly cwd?: string | undefined
  readonly initialPrompt?: string | undefined
  readonly autoSubmit?: boolean | undefined
  readonly exitOnComplete?: boolean | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TuiEntry {
  readonly id: number
  readonly title: string
  readonly body: string
  readonly kind:
    | "prompt"
    | "agent"
    | "reasoning"
    | "script"
    | "script-output"
    | "subagent"
    | "auth"
    | "system"
    | "summary"
    | "error"
  readonly runId: number
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface TuiState {
  readonly title: string
  readonly cwd: string
  readonly input: string
  readonly status: "idle" | "running" | "complete" | "error"
  readonly activeRunId: number
  readonly nextRunId: number
  readonly selectedEntry: number
  readonly entries: ReadonlyArray<TuiEntry>
  readonly activeModel: string | null
  readonly activeProvider: string | null
  readonly sessionId: string | null
  readonly threadId: string | null
  readonly threadTitle: string | null
  readonly threadCount: number
  readonly footer: string
  readonly currentBlock: CurrentBlock | null
}

interface CurrentBlock {
  readonly title: string
  readonly kind: TuiEntry["kind"]
  readonly runId: number
  readonly body: string
}

type Message =
  | {
      readonly _tag: "Input"
      readonly input: Terminal.UserInput
    }
  | {
      readonly _tag: "Output"
      readonly output: Output
      readonly runId: number
    }
  | {
      readonly _tag: "RunComplete"
      readonly summary: string
      readonly runId: number
    }
  | {
      readonly _tag: "RunError"
      readonly message: string
      readonly runId: number
    }
  | {
      readonly _tag: "System"
      readonly message: string
    }
  | {
      readonly _tag: "AuthPrompt"
      readonly payload: AuthPromptPayload
    }
  | {
      readonly _tag: "Quit"
    }

const enterAltScreen = "\u001b[?1049h\u001b[?25l"
const exitAltScreen = "\u001b[?25h\u001b[?1049l"
const clearScreen = "\u001b[2J\u001b[H"
const ansiPattern = new RegExp(String.raw`\u001B\[[0-9;?]*[A-Za-z]`, "g")
const summarizeState = (state: TuiState): SessionSummary => ({
  status: state.status,
  activeRunId: state.activeRunId,
  entries: state.entries.length,
  selectedEntry: state.selectedEntry,
  activeProvider: state.activeProvider,
  activeModel: state.activeModel,
  footer: state.footer,
})

const serializeContentPart = (part: ContentPart) => {
  switch (part._tag) {
    case "ReasoningStart":
    case "ReasoningEnd":
    case "ScriptStart":
    case "ScriptEnd":
      return { _tag: part._tag }
    case "ReasoningDelta":
    case "ScriptDelta":
      return { _tag: part._tag, delta: part.delta }
    case "ScriptOutput":
      return { _tag: part._tag, output: part.output }
  }
}

const serializeOutput = (output: Output) => {
  switch (output._tag) {
    case "AgentStart":
      return {
        _tag: output._tag,
        id: output.id,
        provider: output.provider,
        model: output.model,
        prompt: promptToString(output.prompt),
      }
    case "SubagentStart":
      return {
        _tag: output._tag,
        id: output.id,
        provider: output.provider,
        model: output.model,
        prompt: output.prompt,
      }
    case "SubagentComplete":
      return {
        _tag: output._tag,
        id: output.id,
        summary: output.summary,
      }
    case "SubagentPart":
      return {
        _tag: output._tag,
        id: output.id,
        part: serializeContentPart(output.part),
      }
    default:
      return serializeContentPart(output)
  }
}

const resumeState = (
  snapshot: SessionSnapshot<TuiState>,
  options?: TuiOptions,
): TuiState => {
  const resumed = snapshot.state
  const nextInput =
    options?.initialPrompt !== undefined ? options.initialPrompt : resumed.input

  if (resumed.status === "running") {
    return {
      ...resumed,
      input: nextInput,
      status: "idle",
      footer:
        "Recovered the last session. The previous run was still active when the app stopped.",
    }
  }

  return {
    ...resumed,
    input: nextInput,
    footer: "Recovered the previous session.",
  }
}

export const makeState = (options?: TuiOptions): TuiState => ({
  title: options?.title ?? "clanka tui",
  cwd: options?.cwd ?? process.cwd(),
  input: options?.initialPrompt ?? "",
  status: "idle",
  activeRunId: 0,
  nextRunId: 1,
  selectedEntry: 0,
  entries: [],
  activeModel: null,
  activeProvider: null,
  sessionId: null,
  threadId: null,
  threadTitle: null,
  threadCount: 0,
  footer:
    "Enter=start or steer | Up/Down=select | Esc=clear | Ctrl-C=quit",
  currentBlock: null,
})

const appendEntry = (
  state: TuiState,
  entry: Omit<TuiEntry, "id">,
): TuiState => {
  const nextEntry = {
    ...entry,
    id: state.entries.length + 1,
  } satisfies TuiEntry

  return {
    ...state,
    entries: [...state.entries, nextEntry],
    selectedEntry: state.entries.length,
  }
}

const flushCurrentBlock = (state: TuiState): TuiState => {
  if (state.currentBlock === null || state.currentBlock.body.length === 0) {
    return {
      ...state,
      currentBlock: null,
    }
  }

  return appendEntry(
    {
      ...state,
      currentBlock: null,
    },
    state.currentBlock,
  )
}

const resetForThread = (
  state: TuiState,
  thread: {
    readonly threadId: string
    readonly threadTitle: string
    readonly threadCount: number
  },
  notice: string,
): TuiState =>
  appendEntry(
    {
      ...state,
      status: "idle",
      activeRunId: 0,
      input: "",
      entries: [],
      selectedEntry: 0,
      activeModel: null,
      activeProvider: null,
      currentBlock: null,
      threadId: thread.threadId,
      threadTitle: thread.threadTitle,
      threadCount: thread.threadCount,
      footer: notice,
    },
    {
      runId: 0,
      kind: "system",
      title: "Thread changed",
      body: notice,
    },
  )

const entryKindFromTurnRole = (role: "user" | "agent" | "auth" | "system" | "result"): TuiEntry["kind"] => {
  switch (role) {
    case "user":
      return "prompt"
    case "agent":
      return "agent"
    case "auth":
      return "auth"
    case "system":
      return "system"
    case "result":
      return "script-output"
  }
}

const renderThreadTree = (
  threads: ReadonlyArray<ThreadRecord>,
  activeThreadId: string | null,
) => {
  const depthOf = (thread: ThreadRecord) => {
    let depth = 0
    let parentId = thread.parentThreadId
    while (parentId !== undefined) {
      const parent = threads.find((candidate) => candidate.id === parentId)
      if (parent === undefined) break
      depth++
      parentId = parent.parentThreadId
    }
    return depth
  }

  return threads
    .map((thread) => {
      const marker = thread.id === activeThreadId ? "*" : "-"
      const indent = "  ".repeat(depthOf(thread))
      return `${marker} ${indent}${thread.kind} ${thread.title} (${thread.id})`
    })
    .join("\n")
}

const loadThreadView = Effect.fn(function* (
  sessions: SessionStore,
  threadId: string,
  notice: string,
  state: TuiState,
) {
  const current = yield* sessions.current()
  const events = yield* sessions.readEvents(threadId)
  const turns = aggregateTurns(events)
  let nextState = {
    ...state,
    status: "idle" as const,
    activeRunId: 0,
    input: "",
    entries: [],
    selectedEntry: 0,
    activeModel: null,
    activeProvider: null,
    currentBlock: null,
    threadId: current.threadId,
    threadTitle: current.threadTitle,
    threadCount: current.threadCount,
    footer: notice,
  }

  for (const turn of turns) {
    nextState = appendEntry(nextState, {
      runId: turn.runId,
      kind: entryKindFromTurnRole(turn.role),
      title: turn.title,
      body:
        turn.evidence.length > 0
          ? `${turn.summary}\n\n${turn.evidence.join("\n\n")}`
          : turn.summary,
    })
  }

  return appendEntry(nextState, {
    runId: 0,
    kind: "system",
    title: "Thread changed",
    body: notice,
  })
})

const withSessionMeta = (
  state: TuiState,
  current: {
    readonly sessionId: string
    readonly threadId: string
    readonly threadTitle: string
    readonly threadCount: number
  },
): TuiState => ({
  ...state,
  sessionId: current.sessionId,
  threadId: current.threadId,
  threadTitle: current.threadTitle,
  threadCount: current.threadCount,
})

const beginRun = (state: TuiState, prompt: string): TuiState =>
  appendEntry(
    {
      ...state,
      status: "running",
      activeRunId: state.nextRunId,
      nextRunId: state.nextRunId + 1,
      input: "",
      footer: "Running... Enter sends steer instructions to the active agent.",
      currentBlock: null,
    },
    {
      runId: state.nextRunId,
      kind: "prompt",
      title: `Prompt #${state.nextRunId}`,
      body: prompt,
    },
  )

const applyOutput = (state: TuiState, output: Output, runId: number): TuiState => {
  const flushAndApply = (nextState: TuiState, entry: Omit<TuiEntry, "id">) =>
    appendEntry(flushCurrentBlock(nextState), entry)

  if (output._tag === "SubagentPart") {
    return applySubagentPart(state, output.id, output.part, runId)
  }

  switch (output._tag) {
    case "AgentStart":
      return flushAndApply(
        {
          ...state,
          activeModel: output.model,
          activeProvider: output.provider,
        },
        {
          runId,
          kind: "agent",
          title: `Agent #${output.id} starting`,
          body: `${output.modelAndProvider}\n\n${promptToString(output.prompt)}`,
        },
      )
    case "SubagentStart":
      return flushAndApply(state, {
        runId,
        kind: "subagent",
        title: `Subagent #${output.id} starting`,
        body: `${output.modelAndProvider}\n\n${output.prompt}`,
      })
    case "SubagentComplete":
      return flushAndApply(state, {
        runId,
        kind: "subagent",
        title: `Subagent #${output.id} complete`,
        body: output.summary,
      })
    case "ReasoningStart":
      return {
        ...flushCurrentBlock(state),
        currentBlock: {
          runId,
          kind: "reasoning",
          title: "Reasoning",
          body: "",
        },
      }
    case "ReasoningDelta":
      return {
        ...state,
        currentBlock: {
          runId,
          kind: "reasoning",
          title: "Reasoning",
          body: (state.currentBlock?.body ?? "") + output.delta,
        },
      }
    case "ReasoningEnd":
      return flushCurrentBlock(state)
    case "ScriptStart":
      return {
        ...flushCurrentBlock(state),
        currentBlock: {
          runId,
          kind: "script",
          title: "Script",
          body: "",
        },
      }
    case "ScriptDelta":
      return {
        ...state,
        currentBlock: {
          runId,
          kind: "script",
          title: "Script",
          body: (state.currentBlock?.body ?? "") + output.delta,
        },
      }
    case "ScriptEnd":
      return flushCurrentBlock(state)
    case "ScriptOutput":
      return flushAndApply(state, {
        runId,
        kind: "script-output",
        title: "Script output",
        body: output.output,
      })
  }
}

const applySubagentPart = (
  state: TuiState,
  id: number,
  output: ContentPart,
  runId: number,
): TuiState => {
  const prefix = `Subagent #${id}`
  switch (output._tag) {
    case "ReasoningStart":
      return {
        ...flushCurrentBlock(state),
        currentBlock: {
          runId,
          kind: "reasoning",
          title: `${prefix} reasoning`,
          body: "",
        },
      }
    case "ReasoningDelta":
      return {
        ...state,
        currentBlock: {
          runId,
          kind: "reasoning",
          title: `${prefix} reasoning`,
          body: (state.currentBlock?.body ?? "") + output.delta,
        },
      }
    case "ReasoningEnd":
      return flushCurrentBlock(state)
    case "ScriptStart":
      return {
        ...flushCurrentBlock(state),
        currentBlock: {
          runId,
          kind: "script",
          title: `${prefix} script`,
          body: "",
        },
      }
    case "ScriptDelta":
      return {
        ...state,
        currentBlock: {
          runId,
          kind: "script",
          title: `${prefix} script`,
          body: (state.currentBlock?.body ?? "") + output.delta,
        },
      }
    case "ScriptEnd":
      return flushCurrentBlock(state)
    case "ScriptOutput":
      return appendEntry(flushCurrentBlock(state), {
        runId,
        kind: "script-output",
        title: `${prefix} output`,
        body: output.output,
      })
    default:
      return state
  }
}

/**
 * Apply a runtime message to the TUI state.
 *
 * Exposed for tests and higher-level composition.
 *
 * @since 1.0.0
 * @category Models
 */
export const update = (state: TuiState, message: Exclude<Message, { _tag: "Input" | "Quit" }>) => {
  switch (message._tag) {
    case "System":
      return appendEntry(flushCurrentBlock(state), {
        runId: state.activeRunId,
        kind: "system",
        title: "System",
        body: message.message,
      })
    case "AuthPrompt":
      return appendEntry(
        {
          ...flushCurrentBlock(state),
          footer:
            "Complete the device login in your browser. The active run will continue automatically when auth succeeds.",
        },
        {
          runId: state.activeRunId,
          kind: "auth",
          title:
            message.payload.provider === "codex"
              ? "OpenAI login required"
              : "GitHub login required",
          body: `Open ${message.payload.url}\n\nEnter code: ${message.payload.code}`,
        },
      )
    case "Output":
      return applyOutput(state, message.output, message.runId)
    case "RunComplete":
      return appendEntry(
        {
          ...flushCurrentBlock(state),
          status: "complete",
          footer:
            "Run complete. Enter starts a follow-up prompt. Up/Down selects previous output.",
        },
        {
          runId: message.runId,
          kind: "summary",
          title: "Task complete",
          body: message.summary,
        },
      )
    case "RunError":
      return appendEntry(
        {
          ...flushCurrentBlock(state),
          status: "error",
          footer: "The run failed. Review the error details or retry with a new prompt.",
        },
        {
          runId: message.runId,
          kind: "error",
          title: "Run failed",
          body: message.message,
        },
      )
  }
}

const promptToString = (prompt: Prompt.Prompt): string => {
  const chunks = [] as Array<string>
  for (const message of prompt.content) {
    if (message.role !== "user") continue
    for (const part of message.content) {
      if (part.type === "text") {
        chunks.push(part.text)
      }
    }
  }
  return chunks.join("\n")
}

const plainLength = (line: string) =>
  line.replaceAll(ansiPattern, "").length

const padLine = (line: string, width: number) => {
  const length = plainLength(line)
  return length >= width ? line.slice(0, width) : line + " ".repeat(width - length)
}

const wrapText = (text: string, width: number) => {
  const lines = [] as Array<string>
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("")
      continue
    }

    let remaining = rawLine
    while (remaining.length > width) {
      const slice = remaining.slice(0, width)
      const breakIndex = slice.lastIndexOf(" ")
      const splitAt = breakIndex > Math.floor(width / 3) ? breakIndex : width
      lines.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt).trimStart()
    }
    lines.push(remaining)
  }
  return lines
}

const sectionHeader = (title: string, width: number) =>
  chalk.bold(title) + chalk.dim(` ${"·".repeat(Math.max(width - title.length - 1, 0))}`)

const kindLabel = (kind: TuiEntry["kind"]) => {
  switch (kind) {
    case "prompt":
      return chalk.cyan("YOU")
    case "agent":
      return chalk.green("CLANKA")
    case "reasoning":
      return chalk.yellow("THINK")
    case "script":
      return chalk.blue("ACTION")
    case "script-output":
      return chalk.magenta("EVIDENCE")
    case "subagent":
      return chalk.magenta("SUBAGENT")
    case "auth":
      return chalk.yellowBright("LOGIN")
    case "summary":
      return chalk.green("DONE")
    case "error":
      return chalk.red("ERROR")
    case "system":
      return chalk.gray("NOTE")
  }
}

interface ConversationCard {
  readonly heading: string
  readonly eyebrow: string
  readonly body: ReadonlyArray<string>
  readonly footer?: string | undefined
}

const summarizeTask = (state: TuiState) => {
  const latest = state.entries[state.entries.length - 1]
  if (latest === undefined) {
    return "Ready for a new request"
  }
  switch (latest.kind) {
    case "prompt":
      return "Starting a new run"
    case "agent":
      return "Connecting the agent to the current task"
    case "reasoning":
      return "Thinking through the best next move"
    case "script":
      return "Preparing executable work"
    case "script-output":
      return "Inspecting workspace evidence"
    case "subagent":
      return "Coordinating delegated work"
    case "auth":
      return "Waiting on browser login"
    case "summary":
      return "Finished the current task"
    case "error":
      return "Blocked on a runtime error"
    case "system":
      return "Updating run state"
  }
}

const summarizeNextAction = (state: TuiState) => {
  const latest = state.entries[state.entries.length - 1]
  if (latest === undefined) {
    return "Ask clanka to inspect, patch, debug, or plan."
  }
  if (latest.kind === "auth") {
    return "Open the login URL in your browser and enter the code."
  }
  if (state.status === "running") {
    return "Wait for more output or steer the run with a follow-up instruction."
  }
  if (state.status === "error") {
    return "Inspect the failure and retry with a clearer instruction."
  }
  return "Ask a follow-up question or start a new task."
}

const formatEntryForConversation = (
  entry: TuiEntry,
  width: number,
  selected: boolean,
): ConversationCard => {
  const bodyWidth = Math.max(width - 4, 28)
  const takeLines = selected ? 12 : 5
  const wrapped = wrapText(entry.body, bodyWidth).slice(0, takeLines)

  switch (entry.kind) {
    case "prompt":
      return {
        heading: "You asked clanka",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "agent":
      return {
        heading: "Clanka started working",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "reasoning":
      return {
        heading: "Clanka is thinking through the task",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "script":
      return {
        heading: "Clanka prepared an action plan",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "script-output":
      return {
        heading: "Clanka observed concrete output",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "subagent":
      return {
        heading: "Clanka delegated part of the work",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "auth":
      return {
        heading: "Login required to continue",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: "browser approval needed",
      }
    case "summary":
      return {
        heading: "Clanka finished the run",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "error":
      return {
        heading: "Clanka hit a problem",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
        footer: `run #${entry.runId}`,
      }
    case "system":
      return {
        heading: "System note",
        eyebrow: kindLabel(entry.kind),
        body: wrapped,
      }
  }
}

const renderConversationCard = (
  card: ConversationCard,
  width: number,
  selected: boolean,
) => {
  const innerWidth = Math.max(width - 4, 24)
  const border = selected ? chalk.green("│") : chalk.dim("│")
  const accent = selected ? chalk.green("●") : chalk.dim("●")
  const out = [
    padLine(`${accent} ${card.eyebrow} ${chalk.bold(card.heading)}`, width),
    padLine(chalk.dim(" ".repeat(2) + "─".repeat(Math.max(innerWidth - 1, 1))), width),
    ...card.body.map((line) => padLine(`${border} ${line}`, width)),
  ]
  if (card.footer) {
    out.push(padLine(chalk.dim(`${border} ${card.footer}`), width))
  }
  out.push("")
  return out
}

const renderColumn = (
  title: string,
  lines: ReadonlyArray<string>,
  width: number,
  height: number,
) => {
  const visible = lines.slice(0, Math.max(height - 2, 0))
  const out = [padLine(sectionHeader(title, width), width)]
  out.push(padLine(chalk.dim("─".repeat(Math.max(width - 1, 1))), width))
  for (let i = 0; i < height - 2; i++) {
    out.push(padLine(visible[i] ?? "", width))
  }
  return out
}

/**
 * Render a full-screen frame for the current TUI state.
 *
 * @since 1.0.0
 * @category Rendering
 */
export const render = (state: TuiState, options?: {
  readonly columns?: number | undefined
  readonly rows?: number | undefined
}) => {
  const columns = Math.max(options?.columns ?? process.stdout.columns ?? 120, 80)
  const rows = Math.max(options?.rows ?? process.stdout.rows ?? 30, 18)
  const railWidth = Math.max(Math.floor(columns * 0.2), 26)
  const mainWidth = Math.max(columns - railWidth - 3, 52)
  const bodyHeight = rows - 11
  const selected = state.entries[state.selectedEntry]

  const status = (
    state.status === "running"
      ? chalk.bgGreen.black(" RUNNING ")
      : state.status === "complete"
        ? chalk.bgGreen.black(" COMPLETE ")
        : state.status === "error"
          ? chalk.bgRed.white(" ERROR ")
          : chalk.bgBlue.black(" IDLE ")
  )
  const model =
    state.activeProvider === null || state.activeModel === null
      ? chalk.dim("provider n/a")
      : chalk.dim(`${state.activeProvider}/${state.activeModel}`)
  const mode = chalk.dim(state.status === "running" ? "steer mode" : "prompt mode")
  const taskLine = `${chalk.bold("Current task:")} ${summarizeTask(state)}`
  const nextLine = `${chalk.bold("Next:")} ${summarizeNextAction(state)}`
  const headerLines = [
    `${chalk.bold.green(state.title)} ${chalk.dim("agent console")} ${status} ${model}`,
    `${chalk.dim(state.cwd)} ${chalk.dim("·")} ${mode}`,
    taskLine,
    chalk.dim(nextLine),
  ]

  const railLines = state.entries
    .slice(Math.max(state.entries.length - 8, 0))
    .map((entry, index, visibleEntries) => {
      const actualIndex = state.entries.length - visibleEntries.length + index
      const marker = actualIndex === state.selectedEntry ? chalk.green(">") : " "
      return `${marker} ${kindLabel(entry.kind)} ${entry.title}`
    })

  const feedLines = selected === undefined
    ? [
        chalk.bold("Ready"),
        "",
        ...wrapText(
          "Ask clanka naturally. The agent will inspect, reason, execute, and report back here as a conversational stream.",
          mainWidth,
        ),
        "",
        chalk.dim("Try asking:"),
        ...wrapText("Inspect the current repo and explain what matters", mainWidth),
        ...wrapText("Fix the auth wiring and tell me what changed", mainWidth),
        ...wrapText("Plan the next feature like a senior engineer", mainWidth),
      ]
    : state.entries
        .slice(Math.max(state.entries.length - 5, 0))
        .flatMap((entry, index, visibleEntries) => {
          const actualIndex = state.entries.length - visibleEntries.length + index
          return renderConversationCard(
            formatEntryForConversation(
              entry,
              mainWidth,
              actualIndex === state.selectedEntry,
            ),
            mainWidth,
            actualIndex === state.selectedEntry,
          )
        })
        .slice(-bodyHeight)

  const rightRailLines = [
    chalk.bold("Context"),
    chalk.dim(`status  ${state.status}`),
    chalk.dim(`provider ${state.activeProvider ?? "n/a"}`),
    chalk.dim(`model ${state.activeModel ?? "n/a"}`),
    chalk.dim(`session ${state.sessionId ?? "n/a"}`),
    chalk.dim(`thread ${state.threadTitle ?? state.threadId ?? "n/a"}`),
    chalk.dim(`threads ${state.threadCount}`),
    chalk.dim(`entries ${state.entries.length}`),
    "",
    chalk.bold("Focus"),
    ...(selected === undefined
      ? [chalk.dim("No selection")]
      : [
          chalk.dim(selected.title),
          chalk.dim(`${selected.kind} · run #${selected.runId}`),
        ]),
    "",
    chalk.bold("Activity"),
    ...railLines,
  ]

  const left = renderColumn(
    state.entries.length === 0 ? "Conversation" : "Clanka",
    feedLines,
    mainWidth,
    bodyHeight,
  )
  const right = renderColumn("Sidebar", rightRailLines, railWidth, bodyHeight)
  const body = left.map((line, index) =>
    `${line} ${chalk.dim("│")} ${right[index] ?? ""}`,
  )

  const footer = chalk.dim(state.footer)
  const inputPrefix =
    state.status === "running"
      ? chalk.bold("steer")
      : chalk.bold("ask clanka")
  const inputValue =
    state.input.length === 0
      ? chalk.dim("talk to the agent naturally...")
      : state.input
  const inputLine = [
    chalk.dim("─".repeat(columns)),
    padLine(
      `${inputPrefix}: ${inputValue}`,
      columns,
    ),
    padLine(
      chalk.dim(
        state.status === "running"
          ? "Steer the active run, refine the plan, or redirect the work."
          : "Describe the outcome you want. Clanka will inspect, reason, act, and report back.",
      ),
      columns,
    ),
  ].join("\n")

  return [
    clearScreen,
    ...headerLines,
    "",
    ...body,
    "",
    footer,
    inputLine,
  ].join("\n")
}

const formatFailure = (error: unknown) => {
  if (typeof error === "string") {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message
    if (typeof message === "string") {
      return message
    }
  }
  return String(error)
}

const submit = Effect.fn(function* (
  stateRef: Ref.Ref<TuiState>,
  queue: Queue.Queue<Message>,
  prompt: string,
) {
  const agent = yield* Agent
  let runId = 0
  yield* Ref.update(stateRef, (state) => {
    runId = state.nextRunId
    return beginRun(state, prompt)
  })

  yield* agent.send({ prompt }).pipe(
    Effect.flatMap((stream) =>
      stream.pipe(
        Stream.runForEach((output) =>
          Queue.offer(queue, {
            _tag: "Output",
            output,
            runId,
          }),
        ),
      ),
    ),
    Effect.catchTag("AgentFinished", (finished) =>
      Queue.offer(queue, {
        _tag: "RunComplete",
        summary: finished.summary,
        runId,
      }),
    ),
    Effect.catch((error: unknown) =>
      Queue.offer(queue, {
        _tag: "RunError",
        message: formatFailure(error),
        runId,
      }),
    ),
    Effect.forkScoped,
    Effect.asVoid,
  )
})

const sendSteer = Effect.fn(function* (
  stateRef: Ref.Ref<TuiState>,
  queue: Queue.Queue<Message>,
  prompt: string,
) {
  const agent = yield* Agent
  yield* Ref.update(stateRef, (state) => ({
    ...state,
    input: "",
  }))

  yield* agent.steer(prompt).pipe(
    Effect.andThen(
      Queue.offer(queue, {
        _tag: "System",
        message: `Steered active run with: ${prompt}`,
      }),
    ),
    Effect.forkScoped,
    Effect.asVoid,
  )
})

const handleInput = Effect.fn(function* (
  stateRef: Ref.Ref<TuiState>,
  queue: Queue.Queue<Message>,
  input: Terminal.UserInput,
) {
  const sessions = yield* SessionStore
  const state = yield* Ref.get(stateRef)
  if (input.key.name === "up") {
    yield* Ref.update(stateRef, (current) => ({
      ...current,
      selectedEntry: Math.max(current.selectedEntry - 1, 0),
    }))
    return
  }
  if (input.key.name === "down") {
    yield* Ref.update(stateRef, (current) => ({
      ...current,
      selectedEntry: Math.min(
        current.selectedEntry + 1,
        Math.max(current.entries.length - 1, 0),
      ),
    }))
    return
  }
  if (input.key.name === "escape") {
    yield* Ref.update(stateRef, (current) => ({
      ...current,
      input: "",
    }))
    return
  }
  if (input.key.name === "backspace") {
    yield* Ref.update(stateRef, (current) => ({
      ...current,
      input: current.input.slice(0, -1),
    }))
    return
  }
  if (input.key.name === "return" || input.key.name === "enter") {
    const prompt = state.input.trim()
    if (prompt.length === 0) {
      return
    }
    if (prompt.startsWith("/thread ")) {
      const command = prompt.slice("/thread ".length).trim()
      if (command === "list") {
        const threads = yield* sessions.listThreads()
        yield* Ref.update(stateRef, (current) => ({
          ...current,
          input: "",
        }))
        yield* Queue.offer(queue, {
          _tag: "System",
          message: threads
            .map((thread) =>
              `${thread.id === state.threadId ? "*" : "-"} ${thread.id} ${thread.kind} ${thread.title}`,
            )
            .join("\n"),
        })
        return
      }

      if (command === "tree") {
        const threads = yield* sessions.listThreads()
        yield* Ref.update(stateRef, (current) => ({
          ...current,
          input: "",
        }))
        yield* Queue.offer(queue, {
          _tag: "System",
          message: renderThreadTree(threads, state.threadId),
        })
        return
      }

      if (command.startsWith("branch ")) {
        const title = command.slice("branch ".length).trim()
        if (title.length === 0) {
          yield* Queue.offer(queue, {
            _tag: "System",
            message: "Usage: /thread branch <title>",
          })
          return
        }

        const thread = yield* sessions.createThread({
          title,
          kind: "branch",
        })
        const currentState = yield* Ref.get(stateRef)
        const nextState = yield* loadThreadView(
          sessions,
          thread.id,
          `Started branch thread "${title}" (${thread.id}).`,
          currentState,
        )
        yield* Ref.set(stateRef, nextState)
        return
      }

      if (command.startsWith("switch ")) {
        const threadId = command.slice("switch ".length).trim()
        if (threadId.length === 0) {
          yield* Queue.offer(queue, {
            _tag: "System",
            message: "Usage: /thread switch <thread-id>",
          })
          return
        }

        yield* sessions.switchThread(threadId)
        const currentState = yield* Ref.get(stateRef)
        const nextState = yield* loadThreadView(
          sessions,
          threadId,
          `Switched to thread "${threadId}".`,
          currentState,
        )
        yield* Ref.set(stateRef, nextState)
        return
      }

      yield* Queue.offer(queue, {
        _tag: "System",
        message:
          "Supported thread commands: /thread list, /thread tree, /thread branch <title>, /thread switch <thread-id>",
      })
      return
    }

    if (prompt.startsWith("/handoff ")) {
      const summary = prompt.slice("/handoff ".length).trim()
      if (summary.length === 0) {
        yield* Queue.offer(queue, {
          _tag: "System",
          message: "Usage: /handoff <summary>",
        })
        return
      }

      const thread = yield* sessions.createThread({
        title: "handoff",
        kind: "handoff",
        handoffSummary: summary,
      })
      const currentState = yield* Ref.get(stateRef)
      const nextState = yield* loadThreadView(
        sessions,
        thread.id,
        `Created handoff thread "${thread.id}" with summary: ${summary}`,
        currentState,
      )
      yield* Ref.set(stateRef, nextState)
      return
    }
    if (state.status === "running") {
      yield* sendSteer(stateRef, queue, prompt)
    } else {
      yield* submit(stateRef, queue, prompt)
    }
    return
  }

  if (input.input !== undefined && !input.key.ctrl && !input.key.meta) {
    yield* Ref.update(stateRef, (current) => ({
      ...current,
      input: current.input + input.input,
    }))
  }
})

/**
 * Run the full-screen terminal UI for the currently provided `Agent`.
 *
 * The UI is Effect-native: input is consumed from `Terminal`, agent output is
 * modeled as typed `Output` events, and rendering is a pure projection of the
 * accumulated state.
 *
 * @since 1.0.0
 * @category Runtime
 */
export const run = (options?: TuiOptions) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal
    const input = yield* terminal.readInput
    const sessions = yield* SessionStore
    const previous = yield* sessions.loadSnapshot<TuiState>()
    const current = yield* sessions.current()
    const stateRef = yield* Ref.make(
      Option.match(previous, {
        onNone: () => withSessionMeta(makeState(options), current),
        onSome: (snapshot) => withSessionMeta(resumeState(snapshot, options), current),
      }),
    )
    const queue = yield* Queue.unbounded<Message>()
    const authPromptLayer = AuthPrompt.serviceMap((payload: AuthPromptPayload) =>
      Queue.offer(queue, {
        _tag: "AuthPrompt",
        payload,
      }),
    )
    const persistState = (cause: string) =>
      Ref.get(stateRef).pipe(
        Effect.flatMap((state) =>
          sessions.saveSnapshot(
            {
              savedAt: new Date().toISOString(),
              cause,
              state,
            },
            summarizeState(state),
          ),
        ),
      )

    const persistEvent = (message: Exclude<Message, { _tag: "Quit" }>) =>
      Ref.get(stateRef).pipe(
        Effect.flatMap((state) =>
          Effect.gen(function* () {
            const savedAt = new Date().toISOString()
            const summary = summarizeState(state)
            switch (message._tag) {
              case "Input":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "Input",
                  summary,
                  payload: {
                    key: message.input.key,
                    input: message.input.input,
                  },
                })
              case "Output":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "Output",
                  summary,
                  payload: serializeOutput(message.output),
                })
              case "RunComplete":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "RunComplete",
                  summary,
                  payload: {
                    runId: message.runId,
                    summary: message.summary,
                  },
                })
              case "RunError":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "RunError",
                  summary,
                  payload: {
                    runId: message.runId,
                    message: message.message,
                  },
                })
              case "System":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "System",
                  summary,
                  payload: {
                    message: message.message,
                  },
                })
              case "AuthPrompt":
                return yield* sessions.appendEvent({
                  savedAt,
                  event: "AuthPrompt",
                  summary,
                  payload: message.payload,
                })
            }
          }),
        ),
      )

    const persistLifecycle = (event: "startup" | "resume" | "auto-submit") =>
      Ref.get(stateRef).pipe(
        Effect.flatMap((state) =>
          sessions.appendEvent({
            savedAt: new Date().toISOString(),
            event,
            summary: summarizeState(state),
          }),
        ),
      )

    const renderState = Ref.get(stateRef).pipe(
      Effect.flatMap((state) => terminal.display(render(state))),
      Effect.orDie,
    )

    yield* terminal.display(enterAltScreen).pipe(Effect.orDie)
    yield* Effect.addFinalizer(() =>
      terminal.display(exitAltScreen).pipe(Effect.orDie),
    )

    yield* Stream.fromQueue(input).pipe(
      Stream.runForEach((event) =>
        Queue.offer(queue, {
          _tag: "Input",
          input: event,
        }),
      ),
      Effect.ensuring(
        Queue.offer(queue, {
          _tag: "Quit",
        }),
      ),
      Effect.forkScoped,
    )

    yield* renderState
    yield* persistState(Option.isNone(previous) ? "startup" : "resume")
    yield* persistLifecycle(Option.isNone(previous) ? "startup" : "resume")

    if (
      options?.autoSubmit === true &&
      (options.initialPrompt?.trim().length ?? 0) > 0
    ) {
      yield* submit(stateRef, queue, options.initialPrompt!.trim()).pipe(
        Effect.provide(authPromptLayer),
      )
      yield* renderState
      yield* persistState("auto-submit")
      yield* persistLifecycle("auto-submit")
    }

    while (true) {
      const message = yield* Queue.take(queue)
      if (message._tag === "Quit") {
        return
      }

      if (message._tag === "Input") {
        yield* handleInput(stateRef, queue, message.input).pipe(
          Effect.provide(authPromptLayer),
        )
      } else {
        yield* Ref.update(stateRef, (state) => update(state, message))
      }

      yield* renderState
      yield* persistState(message._tag)
      yield* persistEvent(message)

      if (
        options?.exitOnComplete === true &&
        (message._tag === "RunComplete" || message._tag === "RunError")
      ) {
        return
      }
    }
  })
