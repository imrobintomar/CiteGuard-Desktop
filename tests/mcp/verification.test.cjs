// Unit tests for MCP verification logic
// Run with: node --test tests/mcp/verification.test.js
// (Node 18+ built-in test runner — no extra deps)

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ── Inline the pure functions under test ──────────────────────────────────────
// We extract and test the pure scoring functions in isolation.

function normalizeAuthorName(name) {
  return name.toLowerCase().replace(/[.,]/g, "").trim();
}

function extractLastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return normalizeAuthorName(parts[parts.length - 1] ?? fullName);
}

function scoreAuthorOverlap(provided, found) {
  if (!provided?.length && !found?.length) return 0;
  if (!provided?.length || !found?.length) return 0.2;
  const toKey = (authors) =>
    (authors ?? []).map((a) => {
      let family = "", initial = "";
      if (a.family) {
        family = a.family.toLowerCase().replace(/[.,]/g, "").trim();
        initial = a.given ? a.given[0].toLowerCase() : "";
      } else if (a.name) {
        const parts = a.name.trim().split(/\s+/);
        family = (parts[parts.length - 1] ?? a.name).toLowerCase().replace(/[.,]/g, "").trim();
        initial = parts.length > 1 ? parts[0][0].toLowerCase() : "";
      }
      return family ? (initial ? `${family}:${initial}` : family) : "";
    }).filter(Boolean);
  const keysA = toKey(provided);
  const keysB = toKey(found);
  const lnA = new Set(keysA.map((k) => k.split(":")[0]));
  const lnB = new Set(keysB.map((k) => k.split(":")[0]));
  const union = new Set([...lnA, ...lnB]);
  if (union.size === 0) return 0;
  let score = 0;
  for (const ln of lnA) {
    if (!lnB.has(ln)) continue;
    const initA = keysA.filter((k) => k.split(":")[0] === ln && k.includes(":")).map((k) => k.split(":")[1]);
    const initB = keysB.filter((k) => k.split(":")[0] === ln && k.includes(":")).map((k) => k.split(":")[1]);
    const bothHaveInitial = initA.length > 0 && initB.length > 0;
    const initialsMatch = bothHaveInitial && initA.some((ia) => initB.includes(ia));
    score += bothHaveInitial && !initialsMatch ? 0.5 : 1;
  }
  return score / union.size;
}

function normWords(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3);
}

function titleJaccard(a, b) {
  const wa = new Set(normWords(a));
  const wb = new Set(normWords(b));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(wa.size, wb.size, 1);
}

// Fraud score computation (mirrors MCP logic)
function computeFraudScore(confidence, indicators, isHallucinated) {
  let score = Math.round((1 - confidence) * 40);
  for (const ind of indicators) {
    score += ind.severity === "high" ? 20 : ind.severity === "medium" ? 10 : 5;
  }
  if (isHallucinated) score = Math.max(score, 70);
  return Math.min(score, 100);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scoreAuthorOverlap", () => {
  it("returns 0 when both lists are empty", () => {
    assert.equal(scoreAuthorOverlap([], []), 0);
  });

  it("returns 0.2 when one side is missing", () => {
    assert.equal(scoreAuthorOverlap([{ family: "Smith" }], []), 0.2);
  });

  it("returns 1 for identical single author", () => {
    const auth = [{ family: "Smith", given: "J" }];
    assert.equal(scoreAuthorOverlap(auth, auth), 1);
  });

  it("penalizes conflicting initials (0.5 credit)", () => {
    const provided = [{ family: "Smith", given: "J" }];
    const found = [{ family: "Smith", given: "K" }]; // same last, different first
    const score = scoreAuthorOverlap(provided, found);
    assert.ok(score < 1, `Expected < 1, got ${score}`);
    assert.ok(score >= 0.4, `Expected >= 0.4, got ${score}`); // 0.5 / 1 union
  });

  it("gives full credit when initials agree", () => {
    const provided = [{ family: "Jones", given: "A" }];
    const found = [{ family: "Jones", given: "A" }];
    assert.equal(scoreAuthorOverlap(provided, found), 1);
  });

  it("gives full credit when one side has no initial", () => {
    const provided = [{ family: "Wang" }]; // no initial
    const found = [{ family: "Wang", given: "L" }];
    assert.equal(scoreAuthorOverlap(provided, found), 1);
  });
});

describe("titleJaccard", () => {
  it("returns 1 for identical titles", () => {
    const t = "CRISPR gene editing in cancer cells";
    assert.equal(titleJaccard(t, t), 1);
  });

  it("returns 0 for completely different titles", () => {
    assert.equal(titleJaccard("apple banana mango fruit", "ocean waves storm"), 0);
  });

  it("returns value >= 0.5 for mostly matching titles", () => {
    const a = "CTNNB1 mutations associated with Wilms Tumor development";
    const b = "CTNNB1 mutations associated with Wilms Tumor";
    assert.ok(titleJaccard(a, b) >= 0.5);
  });

  it("ignores short words (stop word filter)", () => {
    // "the" and "and" are < 4 chars and filtered
    assert.equal(titleJaccard("the", "and"), 0);
  });
});

describe("computeFraudScore", () => {
  it("high confidence clean reference gets low score", () => {
    const score = computeFraudScore(0.95, [], false);
    assert.ok(score <= 5, `Expected <= 5, got ${score}`);
  });

  it("hallucinated reference gets at least 70", () => {
    const score = computeFraudScore(0, [], true);
    assert.ok(score >= 70);
  });

  it("zero confidence with high-severity indicators approaches 100", () => {
    const score = computeFraudScore(0, [
      { severity: "high" }, { severity: "high" }, { severity: "high" }
    ], true);
    assert.equal(score, 100);
  });

  it("caps at 100", () => {
    const score = computeFraudScore(0, Array(10).fill({ severity: "high" }), true);
    assert.equal(score, 100);
  });

  it("medium indicator adds 10 points", () => {
    const base = computeFraudScore(0.8, [], false);
    const withMed = computeFraudScore(0.8, [{ severity: "medium" }], false);
    assert.equal(withMed - base, 10);
  });
});

describe("DOI normalization edge cases", () => {
  function normalizeDoi(doi) {
    return doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase().trim();
  }

  it("strips https://doi.org prefix", () => {
    assert.equal(normalizeDoi("https://doi.org/10.1234/test"), "10.1234/test");
  });

  it("strips http://dx.doi.org prefix", () => {
    assert.equal(normalizeDoi("http://dx.doi.org/10.1234/test"), "10.1234/test");
  });

  it("leaves bare DOI unchanged", () => {
    assert.equal(normalizeDoi("10.1234/test"), "10.1234/test");
  });

  it("lowercases for consistent matching", () => {
    assert.equal(normalizeDoi("10.1234/TEST.ABC"), "10.1234/test.abc");
  });
});

describe("quota enforcement logic", () => {
  function canVerify(profile, todayDate) {
    if (!profile) return { allowed: false, remaining: 0, error: "SERVICE_UNAVAILABLE" };
    if (profile.tier === "lifetime") return { allowed: true, remaining: Infinity };
    const FREE_DAILY_LIMIT = 20;
    const count = profile.lastVerificationDate === todayDate ? profile.verificationsToday : 0;
    const remaining = Math.max(0, FREE_DAILY_LIMIT - count);
    return { allowed: remaining > 0, remaining };
  }

  const today = "2026-05-29";

  it("fails closed when profile is null (service unavailable)", () => {
    const result = canVerify(null, today);
    assert.equal(result.allowed, false);
    assert.equal(result.error, "SERVICE_UNAVAILABLE");
  });

  it("grants unlimited for lifetime tier", () => {
    const result = canVerify({ tier: "lifetime" }, today);
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, Infinity);
  });

  it("blocks when daily limit reached", () => {
    const profile = { tier: "free", verificationsToday: 20, lastVerificationDate: today };
    const result = canVerify(profile, today);
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
  });

  it("resets count on new day", () => {
    const profile = { tier: "free", verificationsToday: 20, lastVerificationDate: "2026-05-28" };
    const result = canVerify(profile, today);
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 20);
  });

  it("allows when under daily limit", () => {
    const profile = { tier: "free", verificationsToday: 5, lastVerificationDate: today };
    const result = canVerify(profile, today);
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 15);
  });
});
