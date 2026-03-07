import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"
import {
  STORE_PREFIX,
  STORE_TOKEN_KEY,
  TokenData,
  toCodexAuthKeyValueStore,
  toTokenStore,
} from "./CodexAuth.ts"

describe("CodexAuth", () => {
  it.effect(
    "persists token data through the prefixed schema store",
    Effect.fn(function* () {
      const kvs = yield* KeyValueStore.KeyValueStore
      const tokenStore = toTokenStore(kvs)
      const token = new TokenData({
        access: "access-token",
        refresh: "refresh-token",
        expires: 1_700_000_000_000,
        accountId: Option.some("account_123"),
      })

      yield* Effect.orDie(tokenStore.set(STORE_TOKEN_KEY, token))

      const stored = yield* Effect.orDie(tokenStore.get(STORE_TOKEN_KEY))

      assert.strictEqual(Option.isSome(stored), true)
      if (Option.isNone(stored)) {
        return
      }

      assert.strictEqual(stored.value.access, token.access)
      assert.strictEqual(stored.value.refresh, token.refresh)
      assert.strictEqual(stored.value.expires, token.expires)
      assert.strictEqual(Option.isSome(stored.value.accountId), true)
      if (Option.isSome(stored.value.accountId)) {
        assert.strictEqual(stored.value.accountId.value, "account_123")
      }

      const rawValue = yield* Effect.orDie(
        kvs.get(`${STORE_PREFIX}${STORE_TOKEN_KEY}`),
      )
      const unprefixedValue = yield* Effect.orDie(kvs.get(STORE_TOKEN_KEY))

      assert.strictEqual(typeof rawValue, "string")
      assert.strictEqual(unprefixedValue, undefined)
    }, Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect(
    "round-trips missing account ids as Option.none",
    Effect.fn(function* () {
      const kvs = yield* KeyValueStore.KeyValueStore
      const prefixedStore = toCodexAuthKeyValueStore(kvs)
      const tokenStore = toTokenStore(kvs)
      const token = new TokenData({
        access: "access-token",
        refresh: "refresh-token",
        expires: 1_700_000_000_000,
        accountId: Option.none(),
      })

      yield* Effect.orDie(tokenStore.set(STORE_TOKEN_KEY, token))

      const stored = yield* Effect.orDie(tokenStore.get(STORE_TOKEN_KEY))

      assert.strictEqual(Option.isSome(stored), true)
      if (Option.isNone(stored)) {
        return
      }

      assert.strictEqual(Option.isNone(stored.value.accountId), true)
      assert.strictEqual(
        yield* Effect.orDie(prefixedStore.has(STORE_TOKEN_KEY)),
        true,
      )
    }, Effect.provide(KeyValueStore.layerMemory)),
  )
})
