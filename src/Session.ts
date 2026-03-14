/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ServiceMap from "effect/ServiceMap"

/**
 * @since 1.0.0
 * @category Constants
 */
export const SESSION_DIR_ENV = "CLANKA_SESSION_DIR"

const INDEX_FILE = "index.json"
const LIVE_STATE_FILE = "live-state.json"
const LIVE_SESSION_FILE = "live-session.jsonl"

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionSummary {
  readonly status: string
  readonly activeRunId: number
  readonly entries: number
  readonly selectedEntry: number
  readonly activeProvider: string | null
  readonly activeModel: string | null
  readonly footer: string
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionSnapshot<State> {
  readonly savedAt: string
  readonly cause: string
  readonly state: State
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionEvent<Payload = unknown> {
  readonly savedAt: string
  readonly sessionId: string
  readonly threadId: string
  readonly entryId: string
  readonly event: string
  readonly summary: SessionSummary
  readonly payload?: Payload | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionRecord {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly currentThreadId: string
  readonly status: string
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface ThreadRecord {
  readonly id: string
  readonly title: string
  readonly kind: "main" | "branch" | "handoff"
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: string
  readonly parentThreadId?: string | undefined
  readonly branchPointEntryId?: string | undefined
  readonly handoffSummary?: string | undefined
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionIndex {
  readonly version: 1
  readonly projectRoot: string
  readonly currentSessionId: string
  readonly currentThreadId: string
  readonly updatedAt: string
  readonly sessions: ReadonlyArray<SessionRecord>
  readonly threads: ReadonlyArray<ThreadRecord>
}

type SessionIndexInput =
  Omit<SessionIndex, "threads"> & { readonly threads?: ReadonlyArray<ThreadRecord> | undefined }

/**
 * @since 1.0.0
 * @category Models
 */
export interface SessionStore {
  readonly directory: string
  readonly sessionId: string
  readonly threadId: string
  current(): Effect.Effect<{
    readonly sessionId: string
    readonly threadId: string
    readonly threadTitle: string
    readonly threadCount: number
  }>
  listThreads(): Effect.Effect<ReadonlyArray<ThreadRecord>>
  switchThread(threadId: string): Effect.Effect<void>
  createThread(options: {
    readonly title: string
    readonly kind: "branch" | "handoff"
    readonly parentThreadId?: string | undefined
    readonly branchPointEntryId?: string | undefined
    readonly handoffSummary?: string | undefined
    readonly activate?: boolean | undefined
  }): Effect.Effect<ThreadRecord>
  readEvents<Payload = unknown>(
    threadId?: string | undefined,
  ): Effect.Effect<ReadonlyArray<SessionEvent<Payload>>>
  loadSnapshot<State>(): Effect.Effect<Option.Option<SessionSnapshot<State>>>
  saveSnapshot<State>(
    snapshot: SessionSnapshot<State>,
    summary: SessionSummary,
  ): Effect.Effect<void>
  appendEvent<Payload>(
    event: Omit<SessionEvent<Payload>, "sessionId" | "threadId" | "entryId">,
  ): Effect.Effect<void>
}

/**
 * @since 1.0.0
 * @category Services
 */
export const SessionStore =
  ServiceMap.Service<SessionStore>("clanka/SessionStore")

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`

const resolveDirectory = (cwd: string) =>
  process.env[SESSION_DIR_ENV] ?? `${cwd}/session`

const parseJsonOption = <A>(raw: string): Option.Option<A> => {
  try {
    return Option.some(JSON.parse(raw) as A)
  } catch {
    return Option.none()
  }
}

const makeIndex = (options: {
  readonly cwd: string
  readonly title?: string | undefined
}): SessionIndex => {
  const now = new Date().toISOString()
  const sessionId = makeId("session")
  const threadId = "main"
  const mainThread: ThreadRecord = {
    id: threadId,
    title: options.title ?? "main",
    kind: "main",
    createdAt: now,
    updatedAt: now,
    status: "idle",
  }
  return {
    version: 1,
    projectRoot: options.cwd,
    currentSessionId: sessionId,
    currentThreadId: threadId,
    updatedAt: now,
    sessions: [
      {
        id: sessionId,
        title: options.title ?? "clanka session",
        createdAt: now,
        updatedAt: now,
        currentThreadId: threadId,
        status: "idle",
      },
    ],
    threads: [mainThread],
  }
}

const normalizeIndex = (index: SessionIndexInput): SessionIndex => {
  const fallbackThread: ThreadRecord = {
    id: index.currentThreadId || "main",
    title: "main",
    kind: "main",
    createdAt: index.updatedAt,
    updatedAt: index.updatedAt,
    status:
      index.sessions.find((session) => session.id === index.currentSessionId)?.status ??
      "idle",
  }

  const threads =
    index.threads !== undefined && index.threads.length > 0
      ? index.threads
      : [fallbackThread]

  return {
    ...index,
    currentThreadId: index.currentThreadId || threads[0]!.id,
    threads,
  }
}

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (options: {
  readonly cwd: string
  readonly title?: string | undefined
}): Layer.Layer<SessionStore, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    SessionStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = resolveDirectory(options.cwd)
      const indexPath = path.join(directory, INDEX_FILE)

      const readJson = <A>(filePath: string) =>
        fs.readFileString(filePath).pipe(
          Effect.map(parseJsonOption<A>),
          Effect.catchReason("PlatformError", "NotFound", () =>
            Effect.succeed(Option.none<A>()),
          ),
          Effect.orDie,
        )

      const writeJson = (filePath: string, value: unknown) =>
        fs.writeFileString(filePath, JSON.stringify(value, null, 2)).pipe(
          Effect.orDie,
        )

      const ensureDirectory = (dir: string) =>
        fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie)

      let currentIndex: SessionIndex = normalizeIndex(
        Option.getOrElse(
          yield* readJson<SessionIndexInput>(indexPath),
          () => makeIndex(options),
        ),
      )

      const currentSessionPath = () =>
        path.join(directory, "sessions", currentIndex.currentSessionId)
      const currentThreadEventsPath = () =>
        path.join(
          currentSessionPath(),
          "threads",
          `${currentIndex.currentThreadId}.jsonl`,
        )
      const currentStatePath = () =>
        path.join(currentSessionPath(), "state.json")
      const liveStatePath = () => path.join(directory, LIVE_STATE_FILE)
      const liveSessionPath = () => path.join(directory, LIVE_SESSION_FILE)

      const persistIndex = (summary: SessionSummary) =>
        Effect.gen(function* () {
          const now = new Date().toISOString()
          currentIndex = {
            ...currentIndex,
            updatedAt: now,
            sessions: currentIndex.sessions.map((session) =>
              session.id === currentIndex.currentSessionId
                ? {
                    ...session,
                    updatedAt: now,
                    currentThreadId: currentIndex.currentThreadId,
                    status: summary.status,
                  }
                : session,
            ),
            threads: currentIndex.threads.map((thread) =>
              thread.id === currentIndex.currentThreadId
                ? {
                    ...thread,
                    updatedAt: now,
                    status: summary.status,
                  }
                : thread,
            ),
          }
          yield* ensureDirectory(directory)
          yield* writeJson(indexPath, currentIndex)
        })

      const currentSummary = (): SessionSummary => {
        const activeSession = currentIndex.sessions.find(
          (session) => session.id === currentIndex.currentSessionId,
        )
        return {
          status: activeSession?.status ?? "idle",
          activeRunId: 0,
          entries: 0,
          selectedEntry: 0,
          activeProvider: null,
          activeModel: null,
          footer: "",
        }
      }

      yield* ensureDirectory(path.join(directory, "sessions"))
      yield* ensureDirectory(path.join(currentSessionPath(), "threads"))
      yield* writeJson(indexPath, currentIndex)

      return SessionStore.of({
        directory,
        sessionId: currentIndex.currentSessionId,
        threadId: currentIndex.currentThreadId,
        current: () =>
          Effect.sync(() => {
            const thread = currentIndex.threads.find(
              (thread) => thread.id === currentIndex.currentThreadId,
            )
            return {
              sessionId: currentIndex.currentSessionId,
              threadId: currentIndex.currentThreadId,
              threadTitle: thread?.title ?? currentIndex.currentThreadId,
              threadCount: currentIndex.threads.length,
            }
          }),
        listThreads: () => Effect.sync(() => currentIndex.threads),
        switchThread: (threadId) =>
          Effect.gen(function* () {
            const next = currentIndex.threads.find((thread) => thread.id === threadId)
            if (next === undefined) {
              return yield* Effect.die(
                new Error(`Thread not found: ${threadId}`),
              )
            }
            currentIndex = {
              ...currentIndex,
              currentThreadId: threadId,
              sessions: currentIndex.sessions.map((session) =>
                session.id === currentIndex.currentSessionId
                  ? {
                      ...session,
                      currentThreadId: threadId,
                    }
                  : session,
              ),
            }
            yield* ensureDirectory(path.join(currentSessionPath(), "threads"))
            yield* writeJson(indexPath, currentIndex)
          }),
        createThread: (options) =>
          Effect.gen(function* () {
            const now = new Date().toISOString()
            const thread: ThreadRecord = {
              id: makeId("thread"),
              title: options.title,
              kind: options.kind,
              createdAt: now,
              updatedAt: now,
              status: "idle",
              parentThreadId:
                options.parentThreadId ?? currentIndex.currentThreadId,
              branchPointEntryId: options.branchPointEntryId,
              handoffSummary: options.handoffSummary,
            }

            currentIndex = {
              ...currentIndex,
              currentThreadId: options.activate === false
                ? currentIndex.currentThreadId
                : thread.id,
              threads: [...currentIndex.threads, thread],
              sessions: currentIndex.sessions.map((session) =>
                session.id === currentIndex.currentSessionId
                  ? {
                      ...session,
                      currentThreadId:
                        options.activate === false
                          ? session.currentThreadId
                          : thread.id,
                    }
                  : session,
              ),
            }

            yield* ensureDirectory(path.join(currentSessionPath(), "threads"))
            yield* fs.writeFileString(
              path.join(currentSessionPath(), "threads", `${thread.id}.jsonl`),
              "",
            ).pipe(Effect.orDie)
            yield* writeJson(indexPath, currentIndex)
            yield* fs.writeFileString(
              liveSessionPath(),
              JSON.stringify({
                savedAt: now,
                sessionId: currentIndex.currentSessionId,
                threadId: thread.id,
                entryId: makeId("entry"),
                event: options.kind === "handoff" ? "Handoff" : "ThreadForked",
                summary: currentSummary(),
                payload: {
                  title: thread.title,
                  parentThreadId: thread.parentThreadId,
                  branchPointEntryId: thread.branchPointEntryId,
                  handoffSummary: thread.handoffSummary,
                },
              }) + "\n",
              { flag: "a" },
            ).pipe(Effect.orDie)
            return thread
          }),
        readEvents: <Payload>(threadId?: string | undefined) =>
          Effect.gen(function* () {
            const filePath = path.join(
              currentSessionPath(),
              "threads",
              `${threadId ?? currentIndex.currentThreadId}.jsonl`,
            )
            const raw = yield* fs.readFileString(filePath).pipe(
              Effect.catchReason("PlatformError", "NotFound", () =>
                Effect.succeed(""),
              ),
              Effect.orDie,
            )
            const lines = raw
              .split("\n")
              .filter((line) => line.trim().length > 0)
            return lines.flatMap((line) => {
              const parsed = parseJsonOption<SessionEvent<Payload>>(line)
              return Option.isSome(parsed) ? [parsed.value] : []
            })
          }),
        loadSnapshot: <State>() =>
          readJson<SessionSnapshot<State>>(currentStatePath()).pipe(
            Effect.flatMap((snapshot) =>
              Option.isSome(snapshot)
                ? Effect.succeed(snapshot)
                : readJson<SessionSnapshot<State>>(liveStatePath()),
            ),
          ),
        saveSnapshot: <State>(
          snapshot: SessionSnapshot<State>,
          summary: SessionSummary,
        ) =>
          Effect.gen(function* () {
            yield* ensureDirectory(currentSessionPath())
            yield* writeJson(currentStatePath(), snapshot)
            yield* writeJson(liveStatePath(), snapshot)
            yield* persistIndex(summary)
          }),
        appendEvent: <Payload>(
          event: Omit<SessionEvent<Payload>, "sessionId" | "threadId" | "entryId">,
        ) =>
          Effect.gen(function* () {
            const entry = {
              ...event,
              sessionId: currentIndex.currentSessionId,
              threadId: currentIndex.currentThreadId,
              entryId: makeId("entry"),
            } satisfies SessionEvent<Payload>

            yield* ensureDirectory(path.dirname(currentThreadEventsPath()))
            yield* fs.writeFileString(
              currentThreadEventsPath(),
              JSON.stringify(entry) + "\n",
              { flag: "a" },
            ).pipe(Effect.orDie)
            yield* fs.writeFileString(
              liveSessionPath(),
              JSON.stringify(entry) + "\n",
              { flag: "a" },
            ).pipe(Effect.orDie)
            yield* persistIndex(event.summary)
          }),
      })
    }),
  )
