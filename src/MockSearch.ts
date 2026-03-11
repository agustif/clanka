import { Effect, ServiceMap } from "effect"

export class MockSearch extends ServiceMap.Service<
  MockSearch,
  {
    search(query: string): Effect.Effect<
      Array<{
        readonly url: string
        readonly title: string
        readonly snippet: string
      }>
    >
  }
>()("clanka/MockSearch") {}
