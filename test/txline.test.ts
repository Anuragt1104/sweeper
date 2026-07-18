import assert from "node:assert/strict";
import test from "node:test";
import { GamePhase, type Fixture } from "../lib/txline/types";
import {
  ScoreSequence,
  normalizeFixture,
  normalizeOddsRecords,
  normalizeScoreRecord,
  PayloadValidationError,
} from "../lib/txline/normalize";
import {
  LiveTickAssembler,
  TxlineHttpError,
  consumeSse,
  openLiveMatchFeed,
  txlineGetJson,
} from "../lib/txline/live";

const fixture: Fixture = {
  id: "18237038",
  competition: "World Cup",
  stage: "Semi-final",
  home: { id: "2", name: "Spain", code: "ESP", flag: "🇪🇸", rating: 85 },
  away: { id: "1", name: "France", code: "FRA", flag: "🇫🇷", rating: 86 },
  kickoff: "2026-07-14T19:00:00.000Z",
  venue: "—",
  status: "scheduled",
  participant1IsHome: false,
};

test("fixture parser accepts casing variants and reverses participant-one home mapping", () => {
  const parsed = normalizeFixture({
    fixtureId: 18237038,
    startTime: 1784055600000,
    competition: "World Cup",
    competitionId: 7,
    participant1Id: 1,
    participant1: "France",
    participant2Id: 2,
    participant2: "Spain",
    participant1IsHome: false,
    ts: 1784050000000,
  });
  assert.equal(parsed.home.name, "Spain");
  assert.equal(parsed.away.name, "France");
  assert.equal(parsed.participant1IsHome, false);
});

test("score parser accepts lower/Pascal case, dataSoccer, documented phases and home reversal", () => {
  const record = normalizeScoreRecord({
    FixtureId: 18237038,
    Seq: 12,
    Ts: 1784056800000,
    GameState: "H2",
    Participant1IsHome: false,
    Action: "score_update",
    ScoreSoccer: {
      Participant1: { Total: { Goals: 1, YellowCards: 2, RedCards: 0, Corners: 4 } },
      Participant2: { Total: { Goals: 2, YellowCards: 1, RedCards: 1, Corners: 3 } },
    },
    DataSoccer: { Minutes: 63, Participant: 1, Goal: true },
  }, fixture);
  assert.equal(record.snapshot.phase, GamePhase.SecondHalf);
  assert.deepEqual(record.snapshot.goals, { home: 2, away: 1 });
  assert.deepEqual(record.snapshot.red, { home: 1, away: 0 });
  assert.equal(record.explicitEvent?.side, "away");
  assert.equal(record.explicitEvent?.kind, "goal");
});

test("sequence assembler emits goals/cards, ignores duplicates and corrections, and degrades on gaps", () => {
  const sequence = new ScoreSequence(fixture);
  const first = sequence.accept(scoreRaw(1, 0, 0, 0, 0));
  assert.equal(first.accepted, true);
  const goal = sequence.accept(scoreRaw(2, 1, 0, 0, 0));
  assert.equal(goal.events[0]?.kind, "goal");
  assert.equal(goal.events[0]?.side, "home");
  assert.equal(sequence.accept(scoreRaw(2, 1, 0, 0, 0)).accepted, false);

  const correction = sequence.accept(scoreRaw(3, 0, 0, 0, 0));
  assert.deepEqual(correction.events, []);
  assert.equal(correction.correction, true);

  const restoration = sequence.accept(scoreRaw(4, 1, 0, 0, 0));
  assert.deepEqual(restoration.events, [], "restoring a corrected counter is not a new goal");

  const gap = sequence.accept(scoreRaw(7, 1, 0, 1, 0));
  assert.equal(gap.degraded, true);
  assert.deepEqual(gap.events, [], "unresolved gaps never invent a material event");
});

test("game_finalised and every documented soccer phase normalize without a malformed fallback", () => {
  const phases = ["SCHEDULED", "FINISHED", "NS", "H1", "HT", "H2", "F", "WET", "ET1", "HTET", "ET2", "FET", "WPE", "PE", "FPE", "I", "A", "C", "TXCC", "TXCS", "P", "END"];
  for (const gameState of phases) {
    const record = normalizeScoreRecord({ ...scoreRaw(1, 0, 0, 0, 0), gameState }, fixture);
    assert.ok(Number.isInteger(record.snapshot.phase), gameState);
  }
  const final = normalizeScoreRecord({ ...scoreRaw(2, 0, 0, 0, 0), action: "game_finalised" }, fixture);
  assert.equal(final.finalised, true);
});

test("cancel and coverage codes map to Cancelled / CoveragePaused with status notes", () => {
  const cancelled = normalizeScoreRecord({ ...scoreRaw(1, 0, 0, 0, 0), gameState: "C" }, fixture);
  assert.equal(cancelled.snapshot.phase, GamePhase.Cancelled);
  assert.equal(cancelled.snapshot.statusNote, "Cancelled");

  const paused = normalizeScoreRecord(
    { ...scoreRaw(2, 0, 0, 0, 0), gameState: "TXCS", coverageSecondaryData: false },
    fixture,
  );
  assert.equal(paused.snapshot.phase, GamePhase.CoveragePaused);
  assert.equal(paused.snapshot.statusNote, "Coverage suspended");
  assert.equal(paused.snapshot.coverageSecondary, false);
});

test("odds parser retains returned markets dynamically and detects a usable reversed 1X2", () => {
  const odds = normalizeOddsRecords([
    {
      fixtureId: 18237038,
      messageId: "m1",
      ts: 1784056800000,
      superOddsType: "1X2",
      marketPeriod: "Match",
      priceNames: ["1", "X", "2"],
      prices: [210, 340, 360],
      pct: ["47.619", "29.412", "27.778"],
    },
    {
      FixtureId: 18237038,
      MessageId: "m2",
      Ts: 1784056800100,
      SuperOddsType: "ASIAN_HANDICAP",
      MarketParameters: "+0.5",
      MarketPeriod: "Match",
      PriceNames: ["1", "2"],
      Prices: [188, 204],
      Pct: ["53.191", "49.020"],
    },
  ], fixture, 9);
  assert.equal(odds.markets.length, 2);
  const oneXTwo = odds.markets.find((market) => market.type === "match_result")!;
  assert.deepEqual(oneXTwo.selections.map((selection) => selection.key), ["away", "draw", "home"]);
  assert.ok(odds.markets.some((market) => market.type.startsWith("txline:")));
});

test("unsupported-only odds stand down and malformed frames fail runtime validation", () => {
  const odds = normalizeOddsRecords([{
    FixtureId: 18237038,
    MessageId: "m2",
    Ts: 1784056800100,
    SuperOddsType: "PLAYER_PROPS",
    PriceNames: ["A", "B"],
    Prices: [200, 200],
    Pct: ["50.000", "50.000"],
  }], fixture, 1);
  assert.equal(odds.markets.some((market) => market.type === "match_result"), false);
  assert.throws(() => normalizeScoreRecord({ nope: true }, fixture), PayloadValidationError);
  assert.throws(() => normalizeOddsRecords([{ FixtureId: 1 }], fixture, 1), PayloadValidationError);
});

test("live hydration combines real snapshots before emitting a tick", () => {
  const score = normalizeScoreRecord(scoreRaw(4, 1, 0, 1, 0), fixture);
  const assembler = new LiveTickAssembler(fixture);
  const tick = assembler.hydrate([score], [oneXTwoRaw("hydrate", 1784056800100)]);
  assert.equal(tick.score.goals.home, 1);
  assert.equal(tick.odds.markets[0].type, "match_result");
  assert.equal(tick.upstream?.scoreSeq, 4);
});

test("JSON requests renew a JWT once on 401 and make 403 fatal", async () => {
  let calls = 0;
  let refreshes = 0;
  const value = await txlineGetJson<{ ok: boolean }>("/test", {
    fetch: async () => {
      calls += 1;
      return calls === 1 ? new Response("expired", { status: 401 }) : Response.json({ ok: true });
    },
    headers: async () => ({ Authorization: "redacted" }),
    refresh: async () => { refreshes += 1; },
  });
  assert.deepEqual(value, { ok: true });
  assert.equal(refreshes, 1);

  await assert.rejects(
    txlineGetJson("/forbidden", {
      fetch: async () => new Response("invalid level", { status: 403 }),
      headers: async () => ({}),
      refresh: async () => undefined,
    }),
    (error) => error instanceof TxlineHttpError && error.status === 403,
  );
});

test("historical request adapter decodes TxLINE text/event-stream responses", async () => {
  const records = await txlineGetJson<{ seq: number }[]>("/historical", {
    fetch: async () => new Response(
      'data: {"seq":1}\n\nevent: heartbeat\ndata: {"Ts":2}\n\ndata: {"seq":2}\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ),
    headers: async () => ({}),
    refresh: async () => undefined,
  });
  assert.deepEqual(records, [{ seq: 1 }, { seq: 2 }]);
});

test("SSE parser preserves the latest event id and rejects malformed data upstream", async () => {
  const values: unknown[] = [];
  const stream = sseStream([
    `id: 100:1\ndata: {"ok":true}\n\n`,
    `event: heartbeat\ndata: {"Ts":100}\n\n`,
    `id: 101:2\ndata: not-json\n\n`,
  ]);
  const id = await consumeSse(stream, "", (value) => values.push(value));
  assert.equal(id, "101:2");
  assert.deepEqual(values, [{ ok: true }, undefined]);
});

test("dual SSE reconnect resumes both streams with Last-Event-ID", async () => {
  const requests: { kind: "score" | "odds"; headers: Headers }[] = [];
  let handle: Awaited<ReturnType<typeof openLiveMatchFeed>> | null = null;
  const feedPromise = openLiveMatchFeed(fixture, {
    onScore: () => undefined,
    onOdds: () => undefined,
  }, {
    token: async () => "redacted",
    jwt: async () => "jwt",
    refresh: async () => undefined,
    wait: async () => new Promise((resolve) => setTimeout(resolve, 1)),
    fetch: async (input, init) => {
      const kind = String(input).includes("/scores/") ? "score" : "odds";
      requests.push({ kind, headers: new Headers(init?.headers) });
      const payload = kind === "score" ? scoreRaw(10, 1, 0, 0, 0) : oneXTwoRaw("stream", 1784056800200);
      return new Response(sseStream([`id: ${kind}-cursor\ndata: ${JSON.stringify(payload)}\n\n`]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  handle = await feedPromise;
  await handle.accepted;
  for (let attempt = 0; attempt < 50 && !(["score", "odds"] as const).every((kind) => requests.filter((request) => request.kind === kind).length >= 2); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  handle.close();
  for (const kind of ["score", "odds"] as const) {
    const kindRequests = requests.filter((request) => request.kind === kind);
    assert.ok(kindRequests.length >= 2, `${kind} should reconnect`);
    assert.equal(kindRequests[1].headers.get("Last-Event-ID"), `${kind}-cursor`);
  }
});

test("SSE 403 reports fatal configuration and rejects acceptance", async () => {
  let fatals = 0;
  const handle = await openLiveMatchFeed(fixture, {
    onScore: () => undefined,
    onOdds: () => undefined,
    onFatal: () => { fatals += 1; },
  }, {
    token: async () => "redacted",
    jwt: async () => "jwt",
    refresh: async () => undefined,
    wait: async () => undefined,
    fetch: async () => new Response("forbidden", { status: 403 }),
  });
  await assert.rejects(handle.accepted, TxlineHttpError);
  await new Promise((resolve) => setTimeout(resolve, 0));
  handle.close();
  assert.equal(fatals, 2);
});

function scoreRaw(seq: number, p2Goals: number, p1Goals: number, p2Yellow: number, p1Yellow: number) {
  return {
    fixtureId: 18237038,
    seq,
    ts: 1784056800000 + seq * 1000,
    gameState: "H1",
    participant1IsHome: false,
    scoreSoccer: {
      Participant1: { Total: { Goals: p1Goals, YellowCards: p1Yellow, RedCards: 0, Corners: 0 } },
      Participant2: { Total: { Goals: p2Goals, YellowCards: p2Yellow, RedCards: 0, Corners: 0 } },
    },
    dataSoccer: { Minutes: 20 + seq },
  };
}

function oneXTwoRaw(messageId: string, ts: number) {
  return {
    fixtureId: 18237038,
    messageId,
    ts,
    superOddsType: "1X2",
    marketPeriod: "Match",
    priceNames: ["1", "X", "2"],
    prices: [210, 340, 360],
    pct: ["47.619", "29.412", "27.778"],
  };
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}
