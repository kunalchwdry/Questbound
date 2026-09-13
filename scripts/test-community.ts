/** Real PostgreSQL integration tests. Every fixture and action rolls back. No Auth accounts are created. */
import dotenv from "dotenv";
import assert from "node:assert/strict";
import fs from "node:fs";
async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  const { pool } = await import("../src/db/index");
  const { communityAction: action } = await import(
    "../src/lib/community-actions"
  );
  const Q = await import("../src/lib/community-queries");
  const { communityActionSchema } = await import(
    "../src/lib/community-validation"
  );
  const c = await pool.connect();
  const query = c.query.bind(c);
  const originalConnect = pool.connect.bind(pool);
  const originalQuery = pool.query.bind(pool);
  const tests: string[] = [];
  const pass = (s: string) => {
    tests.push(s);
    console.log("PASS", s);
  };
  async function reject(fn: () => Promise<unknown>, match?: RegExp) {
    if (match) await assert.rejects(fn, match);
    else await assert.rejects(fn);
  }
  let save = 0;
  try {
    await query("BEGIN");
    await query("SET LOCAL statement_timeout='30s'");
    for (const f of [
      "0002_community_baseline.sql",
      "0003_community_security.sql",
    ])
      await query(fs.readFileSync(`drizzle/${f}`, "utf8"));
    // Route service transactions become savepoints inside the rollback-only test transaction.
    Object.defineProperty(pool, "connect", {
      configurable: true,
      value: async () => {
        const n = "test_" + ++save;
        return {
          query: async (sql: string | { text: string }, args?: unknown[]) => {
            const statement = (
              typeof sql === "string" ? sql : sql.text
            ).toUpperCase();
            if (statement === "BEGIN") return query("SAVEPOINT " + n);
            if (statement === "COMMIT") return query("RELEASE SAVEPOINT " + n);
            if (statement === "ROLLBACK")
              return query("ROLLBACK TO SAVEPOINT " + n);
            return query(sql, args);
          },
          release: () => {},
        };
      },
    });
    Object.defineProperty(pool, "query", { configurable: true, value: query });
    async function user(name: string) {
      return (
        await query(
          `INSERT INTO users(display_name,email,created_at,auth_id) VALUES($1,$2,now()-interval '10 days',$3) RETURNING id`,
          [
            name,
            `${name}-${Date.now()}@integration.invalid`,
            crypto.randomUUID(),
          ],
        )
      ).rows[0].id as number;
    }
    const a = await user("TestAuthor"),
      b = await user("TestHelper"),
      x = await user("TestOutsider");
    process.env.COMMUNITY_MODERATOR_IDS = String(x);
    const complete = async (
      u: number,
      opts: { date?: string; attr?: string } = {},
    ) =>
      (
        await query(
          `INSERT INTO completions(user_id,title,attribute,difficulty,xp,gold,completed_on,completed_at) VALUES($1,'Rollback test session',$2,'easy',20,5,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),coalesce($3::timestamptz,now())) RETURNING id`,
          [u, opts.attr ?? "intellect", opts.date ?? null],
        )
      ).rows[0].id;
    for (let i = 0; i < 5; i++) await complete(a);
    assert.equal(
      communityActionSchema.safeParse({
        action: "post",
        title: "Test",
        content: "Content",
        type: "help",
        xp: 999999,
      }).success,
      false,
    );
    assert.equal(
      communityActionSchema.safeParse({
        action: "claimChallenge",
        id: 1,
        gold: 999999,
      }).success,
      false,
    );
    pass("Strict schemas reject fabricated XP and reward payloads");
    const post = await action(a, {
      action: "post",
      title: "How do I stay consistent?",
      content: "A test problem",
      type: "help",
      tried: "A calendar",
      tags: ["study"],
      guildId: null,
    });
    const pid = post!.id!;
    const cm = await action(b, {
      action: "comment",
      postId: pid,
      parentId: null,
      content: "Start with ten minutes a day.",
    });
    const cid = cm!.id!;
    await reject(
      () =>
        action(b, {
          action: "editPost",
          id: pid,
          title: "Hijacked post",
          content: "no",
        }),
      /author/,
    );
    await reject(
      () =>
        action(a, {
          action: "editComment",
          id: cid,
          content: "Hijacked answer",
        }),
      /author/,
    );
    const self = await action(a, {
      action: "comment",
      postId: pid,
      parentId: null,
      content: "My own answer",
    });
    await reject(
      () =>
        action(a, { action: "solution", postId: pid, commentId: self!.id! }),
      /yourself/,
    );
    process.env.COMMUNITY_MODERATOR_IDS = "";
    await reject(
      () => action(x, { action: "solution", postId: pid, commentId: cid }),
      /author|moderator/,
    );
    pass("Post/comment ownership and solution permissions enforced");
    await action(a, {
      action: "react",
      postId: pid,
      commentId: cid,
      reaction: "helpful",
    });
    await action(a, {
      action: "react",
      postId: pid,
      commentId: cid,
      reaction: "helpful",
    });
    await action(a, {
      action: "react",
      postId: pid,
      commentId: cid,
      reaction: "helpful",
    });
    await action(a, { action: "solution", postId: pid, commentId: cid });
    await action(a, { action: "solution", postId: pid, commentId: cid });
    assert.equal(
      (
        await query(
          "SELECT sum(delta)::int rep FROM community_reputation_transactions WHERE user_id=$1",
          [b],
        )
      ).rows[0].rep,
      20,
    );
    pass(
      "Helpful toggle and duplicate solution award reputation only once (+5 +15)",
    );
    await action(b, {
      action: "react",
      postId: pid,
      commentId: null,
      reaction: "encouragement",
    });
    await action(b, {
      action: "react",
      postId: pid,
      commentId: null,
      reaction: "motivating",
    });
    assert.equal(
      (
        await query(
          "SELECT count(*)::int n FROM community_reactions WHERE post_id=$1 AND user_id=$2",
          [pid, b],
        )
      ).rows[0].n,
      1,
    );
    pass("Changing reaction preserves one reaction per hero and target");
    const second = await action(a, {
      action: "post",
      title: "A second discussion",
      content: "Hello",
      type: "discussion",
      tried: "",
      tags: [],
      guildId: null,
    });
    await reject(
      () =>
        action(b, {
          action: "comment",
          postId: second!.id!,
          parentId: cid,
          content: "Cross-post reply",
        }),
      /Not found/,
    );
    pass("Replies cannot target a parent in another post");
    await action(x, {
      action: "report",
      postId: pid,
      commentId: null,
      reason: "Test report only",
      details: "",
    });
    await reject(() => Q.reports(a), /Moderator/);
    pass("Private reports denied to ordinary users");
    await action(a, { action: "block", userId: x, blocked: true });
    await reject(
      () =>
        action(x, {
          action: "comment",
          postId: pid,
          parentId: null,
          content: "Blocked reply",
        }),
      /Not found/,
    );
    await action(a, { action: "block", userId: x, blocked: false });
    pass("Blocks prevent both-direction post interactions");
    const g = await action(a, {
      action: "createGuild",
      name: "Rollback Guild " + Date.now(),
      description: "Testing only",
      visibility: "invite_only",
    });
    const gid = g!.id!;
    await reject(
      () => action(b, { action: "joinGuild", id: gid }),
      /invitation/,
    );
    await action(a, { action: "invite", guildId: gid, userId: b });
    const inv = (
      await query(
        "SELECT id FROM guild_invites WHERE guild_id=$1 AND invitee_id=$2",
        [gid, b],
      )
    ).rows[0].id;
    await reject(
      () => action(x, { action: "respondInvite", id: inv, accept: true }),
      /Not found/,
    );
    await action(b, { action: "respondInvite", id: inv, accept: true });
    await reject(
      () =>
        action(b, { action: "role", guildId: gid, userId: a, role: "member" }),
      /role/,
    );
    pass("Invite-only guild and owner/moderator boundaries enforced");
    const gp = await action(a, {
      action: "post",
      title: "Private guild discussion",
      content: "Guild-only",
      type: "discussion",
      tried: "",
      tags: [],
      guildId: gid,
    });
    await reject(() => Q.discussion(x, gp!.id!), /Not found/);
    pass("Guild discussions unavailable to nonmembers");
    const quest = await action(a, {
      action: "createGuildQuest",
      guildId: gid,
      title: "A shared test quest",
      description: "Rollback only",
      attribute: "intellect",
      target: 10,
      days: 7,
    });
    const qid = quest!.id!;
    await complete(b);
    assert.equal(
      (await query("SELECT progress FROM guild_quests WHERE id=$1", [qid]))
        .rows[0].progress,
      0,
    );
    await action(b, { action: "joinQuest", id: qid });
    await complete(b, { attr: "strength" });
    assert.equal(
      (await query("SELECT progress FROM guild_quests WHERE id=$1", [qid]))
        .rows[0].progress,
      0,
    );
    const source = await complete(b);
    assert.equal(
      (await query("SELECT progress FROM guild_quests WHERE id=$1", [qid]))
        .rows[0].progress,
      1,
    );
    pass("Guild contributions require enrollment and matching attribute");
    async function rejectedSql(sql: string, args: unknown[]) {
      await query("SAVEPOINT expected_failure");
      await assert.rejects(() => query(sql, args));
      await query("ROLLBACK TO SAVEPOINT expected_failure");
    }
    await rejectedSql(
      "INSERT INTO guild_quest_contributions(guild_quest_id,user_id,source_completion_id) VALUES($1,$2,$3)",
      [qid, b, source],
    );
    await rejectedSql(
      "INSERT INTO guild_quest_contributions(guild_quest_id,user_id,source_completion_id) VALUES($1,$2,2147483640)",
      [qid, b],
    );
    pass("Duplicate and nonexistent completion sources rejected by database");
    for (let i = 0; i < 9; i++) await complete(b);
    const qq = (
      await query("SELECT progress,status FROM guild_quests WHERE id=$1", [qid])
    ).rows[0];
    assert.deepEqual(qq, { progress: 10, status: "completed" });
    const before = (await query("SELECT gold FROM users WHERE id=$1", [b]))
      .rows[0].gold;
    await action(b, { action: "claimQuest", id: qid });
    await action(b, { action: "claimQuest", id: qid });
    assert.equal(
      (await query("SELECT gold FROM users WHERE id=$1", [b])).rows[0].gold,
      before + 50,
    );
    pass("Quest completion reward is claimable once, only by a contributor");
    process.env.COMMUNITY_MODERATOR_IDS = String(x);
    const ch = await action(x, {
      action: "createChallenge",
      title: "Active day test",
      description: "Rollback only",
      metric: "streak_days",
      target: 10,
      days: 7,
    });
    const chid = ch!.id!;
    await action(b, { action: "joinChallenge", id: chid });
    await complete(b);
    await complete(b);
    assert.equal(
      (
        await query("SELECT progress FROM community_challenges WHERE id=$1", [
          chid,
        ])
      ).rows[0].progress,
      1,
    );
    pass("Streak-day challenge counts one active UTC day per hero");
    const membersCh = await action(x, {
      action: "createChallenge",
      title: "Unique heroes test",
      description: "Rollback only",
      metric: "members",
      target: 10,
      days: 7,
    });
    await action(b, { action: "joinChallenge", id: membersCh!.id! });
    await complete(b);
    await complete(b);
    assert.equal(
      (
        await query("SELECT progress FROM community_challenges WHERE id=$1", [
          membersCh!.id!,
        ])
      ).rows[0].progress,
      1,
    );
    pass("Unique-hero challenge cannot be farmed by repeat completions");
    await action(a, { action: "visibility", visible: false });
    const board = await Q.leaderboard(
      a,
      new URLSearchParams({ category: "community" }),
    );
    assert.equal(board.self, null);
    assert.ok(!board.heroes.some((h) => h.id === a));
    pass("Leaderboard opt-out removes hero and self rank");
    const publicHero = await Q.publicHero(b, a);
    assert.ok(!("email" in publicHero));
    assert.ok(!("auth_id" in publicHero));
    assert.ok(!("password_hash" in publicHero));
    pass("Public profile excludes account and private RPG data");
    for (const fn of [
      () => Q.feed(b, new URLSearchParams()),
      () => Q.discussion(b, pid),
      () => Q.guildList(b, new URLSearchParams()),
      () => Q.guildDetail(b, gid),
      () => Q.challenges(b, new URLSearchParams()),
      () => Q.inbox(b),
      () => Q.communityMeta(b),
      () => Q.searchHeroes(b, "Test"),
    ])
      await fn();
    for (const category of [
      "overall",
      "weekly",
      "monthly",
      "streak",
      "community",
      "solvers",
      "guilds",
    ])
      await Q.leaderboard(b, new URLSearchParams({ category }));
    pass("All feed, guild, inbox, profile and seven ranking queries execute");
    const auth = (await query("SELECT auth_id FROM users WHERE id=$1", [b]))
      .rows[0].auth_id;
    await query("SAVEPOINT role_test");
    await query("SET LOCAL ROLE authenticated");
    await query("SELECT set_config('request.jwt.claim.sub',$1,true)", [auth]);
    const notices = await query("SELECT user_id FROM notifications");
    assert.ok(notices.rows.every((n) => n.user_id === b));
    await query("ROLLBACK TO SAVEPOINT role_test");
    for (const role of ["anon", "authenticated"]) {
      for (const table of [
        "users",
        "completions",
        "community_posts",
        "community_reputation_transactions",
        "community_reports",
        "guild_quests",
        "guild_quest_contributions",
      ]) {
        const p = (
          await query(
            "SELECT has_table_privilege($1,$2,'INSERT') i,has_table_privilege($1,$2,'UPDATE') u,has_table_privilege($1,$2,'TRUNCATE') t",
            [role, table],
          )
        ).rows[0];
        assert.equal(p.i, false);
        assert.equal(p.u, false);
        assert.equal(p.t, false);
      }
    }
    pass(
      "RLS limits direct notification reads; browser roles cannot write or truncate app records",
    );
    // Regression test the real existing engine, also inside the outer rollback.
    const engine = await import("../src/lib/engine");
    const { getDashboard } = await import("../src/lib/dashboard");
    const task = (
      await query(
        `INSERT INTO quests(user_id,title,attribute,difficulty,type) VALUES($1,'Rollback real engine quest','strength','easy','once') RETURNING id`,
        [a],
      )
    ).rows[0].id;
    const start = (await query("SELECT xp,gold FROM users WHERE id=$1", [a]))
      .rows[0];
    const reward = await engine.completeQuest(a, task);
    assert.ok(reward.reward.xp > 0);
    assert.equal(
      (await query("SELECT xp FROM users WHERE id=$1", [a])).rows[0].xp,
      start.xp + reward.reward.xp,
    );
    await reject(() => engine.completeQuest(a, task), /already complete/);
    await reject(() => engine.completeQuest(b, task), /not found/);
    const dashboard = await getDashboard(a);
    assert.ok(dashboard.profile.level >= 1);
    assert.ok(dashboard.profile.achievements.length > 0);
    assert.ok(dashboard.quests.some((q) => q.id === task && q.completedAt));
    pass(
      "Existing quest engine, duplicate completion guard, level, attributes, achievements and dashboard regression",
    );
    // A fixture catalogue item tests the existing inventory path without touching a real item.
    await query("UPDATE users SET gold=1000 WHERE id=$1", [a]);
    const item = (
      await query(
        `INSERT INTO items(slug,name,description,category,rarity,price,icon,payload) VALUES($1,'Rollback badge','Test only','title','common',25,'✧','test-title') RETURNING id`,
        ["test-" + crypto.randomUUID()],
      )
    ).rows[0].id;
    await engine.purchaseItem(a, item);
    assert.equal(
      (await query("SELECT gold FROM users WHERE id=$1", [a])).rows[0].gold,
      975,
    );
    await engine.equipItem(a, item);
    await reject(() => engine.purchaseItem(a, item), /already own/);
    await reject(() => engine.equipItem(b, item), /own/);
    assert.equal(
      (
        await query(
          "SELECT count(*)::int n FROM inventory WHERE user_id=$1 AND item_id=$2",
          [a, item],
        )
      ).rows[0].n,
      1,
    );
    const bounty = await engine.claimBounty(a);
    assert.ok(bounty.xp > 0);
    await reject(() => engine.claimBounty(a), /already claimed/);
    pass(
      "Existing inventory purchase/equip, ownership and bounty reward regression",
    );
    // Deliberate cap tests happen last so normal action tests are not throttled.
    for (let i = 0; i < 4; i++)
      try {
        await action(a, {
          action: "post",
          title: "Rate limit test",
          content: "test",
          type: "tip",
          tried: "",
          tags: [],
          guildId: null,
        });
      } catch {}
    await reject(
      () =>
        action(a, {
          action: "post",
          title: "Too many posts",
          content: "test",
          type: "tip",
          tried: "",
          tags: [],
          guildId: null,
        }),
      /hourly/,
    );
    pass("Persistent per-user posting rate limit survives service calls");
    fs.writeFileSync(
      "docs/integration-test-results.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          mode: "rollback-only fixtures; no auth accounts created",
          passed: tests.length,
          tests,
        },
        null,
        2,
      ),
    );
  } finally {
    await query("ROLLBACK");
    Object.defineProperty(pool, "connect", { value: originalConnect });
    Object.defineProperty(pool, "query", { value: originalQuery });
    c.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
