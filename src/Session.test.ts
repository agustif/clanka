import { describe, expect, it } from "vitest"
import {
  NodeServices,
} from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import * as NodeOs from "node:os"
import * as NodePath from "node:path"
import * as Session from "./Session.ts"

const withTempDir = async <A>(use: (directory: string) => Promise<A>) => {
  const directory = await mkdtemp(NodePath.join(NodeOs.tmpdir(), "clanka-session-"))
  try {
    return await use(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("SessionStore", () => {
  it("persists index, snapshots, events, and thread metadata per project session", async () => {
    await withTempDir(async (cwd) => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const sessions = yield* Session.SessionStore
          const before = yield* sessions.loadSnapshot<{ foo: string }>()

          expect(Option.isNone(before)).toBe(true)

          yield* sessions.saveSnapshot(
            {
              savedAt: "2026-03-14T00:00:00.000Z",
              cause: "test",
              state: { foo: "bar" },
            },
            {
              status: "running",
              activeRunId: 1,
              entries: 2,
              selectedEntry: 1,
              activeProvider: "mock",
              activeModel: "scripted-agent",
              footer: "testing",
            },
          )

          yield* sessions.appendEvent({
            savedAt: "2026-03-14T00:00:01.000Z",
            event: "System",
            summary: {
              status: "running",
              activeRunId: 1,
              entries: 2,
              selectedEntry: 1,
              activeProvider: "mock",
              activeModel: "scripted-agent",
              footer: "testing",
            },
            payload: {
              message: "hello",
            },
          })

          const thread = yield* sessions.createThread({
            title: "handoff thread",
            kind: "handoff",
            branchPointEntryId: "entry-123",
            handoffSummary: "Continue the session from the saved summary",
          })

          const threads = yield* sessions.listThreads()
          yield* sessions.switchThread(thread.id)

          const after = yield* sessions.loadSnapshot<{ foo: string }>()

          return {
            directory: sessions.directory,
            sessionId: sessions.sessionId,
            after,
            threadId: thread.id,
            threadCount: threads.length,
          }
        }).pipe(
          Effect.provide(
            Session.layer({
              cwd,
              title: "session test",
            }).pipe(Layer.provideMerge(NodeServices.layer)),
          ),
        ),
      )

      expect(Option.isSome(result.after)).toBe(true)
      if (Option.isSome(result.after)) {
        expect(result.after.value.state.foo).toBe("bar")
      }

      const index = JSON.parse(
        await readFile(NodePath.join(result.directory, "index.json"), "utf8"),
      )
      expect(index.currentSessionId).toBe(result.sessionId)
      expect(index.sessions[0].title).toBe("session test")
      expect(index.threads.some((thread: { id: string }) => thread.id === result.threadId)).toBe(true)
      expect(result.threadCount).toBe(2)

      const liveSession = await readFile(
        NodePath.join(result.directory, "live-session.jsonl"),
        "utf8",
      )
      expect(liveSession).toContain('"event":"System"')
      expect(liveSession).toContain('"event":"Handoff"')

      const threadLog = await readFile(
        NodePath.join(
          result.directory,
          "sessions",
          result.sessionId,
          "threads",
          "main.jsonl",
        ),
        "utf8",
      )
      expect(threadLog).toContain('"event":"System"')
    })
  })
})
