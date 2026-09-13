import assert from "node:assert/strict";
// Isolated component browser tests + mocked network. No production auth bypass.
import { build } from "esbuild";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  heroes,
  posts,
  guilds,
  quests,
  challenges,
  comments,
} from "./browser/fixtures.mjs";
const root = process.cwd();
const dir = path.join(root, "scripts/build/browser");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync("docs/screenshots", { recursive: true });
await build({
  entryPoints: ["scripts/browser/harness.tsx"],
  bundle: true,
  outfile: path.join(dir, "harness.js"),
  platform: "browser",
  external: ["/images/*"],
  format: "iife",
  jsx: "automatic",
  alias: {
    "next/link": path.join(root, "scripts/browser/next-link.tsx"),
    "next/navigation": path.join(root, "scripts/browser/next-navigation.ts"),
  },
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = fs
  .readdirSync(".next/static/chunks")
  .filter((f) => f.endsWith(".css"))
  .map((f) => `<link rel="stylesheet" href="/_next/static/chunks/${f}">`)
  .join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Questbound component tests</title>${css}<link rel="stylesheet" href="/harness.css"><style>:root{--font-display:Cinzel,Georgia,serif;--font-body:Nunito Sans,Arial,sans-serif}body{margin:0;font-family:var(--font-body)}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://test");
  let file;
  if (u.pathname.startsWith("/_next/"))
    file = path.join(root, ".next", u.pathname.slice(7));
  else if (["/harness.js", "/harness.css"].includes(u.pathname))
    file = path.join(dir, u.pathname);
  if (u.pathname === "/images/hero.jpg")
    file = path.join(root, "public/images/hero.jpg");
  if (file && fs.existsSync(file)) {
    res.setHeader(
      "Content-Type",
      file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : "font/woff2",
    );
    res.end(fs.readFileSync(file));
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const results = [];
const violations = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const settleMotion = () =>
    page.evaluate(async () => {
      const finite = document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    });

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/community/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const resource = u.pathname.split("/").pop();
    let data = {};
    if (resource === "meta")
      data = {
        userId: 12,
        moderator: false,
        guild: { id: 1, name: "Code Warriors", role: "owner" },
        unread: 2,
      };
    if (resource === "posts") {
      let p = posts.filter(
        (p) =>
          !u.searchParams.get("type") ||
          u.searchParams.get("type") === "all" ||
          u.searchParams.get("type") === p.post_type,
      );
      const q = u.searchParams.get("q");
      if (q)
        p = p.filter((p) =>
          `${p.title} ${p.content} ${p.tags.join(" ")}`
            .toLowerCase()
            .includes(q.toLowerCase()),
        );
      data = { posts: p, hasMore: false };
    }
    if (resource === "discussion")
      data = {
        post:
          posts.find((p) => p.id === Number(u.searchParams.get("id"))) ||
          posts[0],
        comments,
        canModerate: true,
        hasMore: false,
      };
    if (resource === "guilds") data = { guilds, hasMore: false };
    if (resource === "guild")
      data = {
        guild: guilds[0],
        members: heroes.slice(0, 4).map((h) => ({
          ...h,
          role: h.id === 12 ? "owner" : "member",
          contribution_xp: 120,
        })),
        quests,
      };
    if (resource === "challenges")
      data = { challenges, canCreate: false, hasMore: false };
    if (resource === "leaderboard")
      data = {
        heroes,
        guilds: guilds.map((g, i) => ({ ...g, rank: i + 1, score: g.xp })),
        self: heroes[3],
        hasMore: false,
        visible: true,
      };
    if (resource === "hero")
      data = {
        ...heroes[3],
        attributes: [
          "strength",
          "intellect",
          "vitality",
          "charisma",
          "discipline",
          "creativity",
        ].map((key, i) => ({ key, xp: 400 + i * 300, level: 4 + i })),
      };
    if (resource === "inbox")
      data = {
        notifications: [
          {
            id: 1,
            kind: "reply",
            title: "A guildmate replied",
            body: "Your question has a new response.",
            href: "/community?post=1",
            read_at: null,
            created_at: new Date().toISOString(),
          },
        ],
        invites: [],
        blocks: [],
      };
    if (resource === "actions") {
      const a = req.postDataJSON();
      if (a.action === "solution") {
        posts[0].is_solved = true;
        comments[0].is_solution = true;
      }
      data = { message: "Action synced in component fixture", id: 1 };
    }
    await route.fulfill({ json: data });
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/community",
      "/guilds",
      "/challenges",
      "/leaderboard",
      "/heroes/12",
    ]) {
      await page.goto(`http://127.0.0.1:${port}${route}`);
      await page.locator("h1").waitFor();
      await page.waitForTimeout(350);
      await settleMotion();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (overflow) throw new Error(`Horizontal overflow at ${route} ${width}`);
      const name = route.split("/")[1];
      if (width !== 768) await settleMotion();
      await page.screenshot({
        path: `docs/screenshots/${name}-${width}.png`,
        fullPage: true,
      });
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      if (axe.violations.length)
        violations.push({
          route,
          width,
          violations: axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        });
      results.push(`${route}: ${width}px rendered without overflow`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/community`);
  await page.getByRole("button", { name: "Post to the guild" }).click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("textbox", { name: "What’s blocking your progress?" })
    .fill("A keyboard-accessible test scroll");
  await page
    .getByRole("textbox", { name: "Tell the guild a little more" })
    .fill("This is a component-only browser test.");
  await settleMotion();
  await page.screenshot({ path: "docs/screenshots/composer.png" });
  let axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  if (axe.violations.length)
    violations.push({
      route: "composer",
      violations: axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").count())
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  results.push("Composer labelled inputs and Escape dismissal");
  await page.getByRole("button", { name: posts[0].title, exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("button", { name: "Accept solution", exact: false })
    .first()
    .click();
  await page.getByText("THE WAY FORWARD", { exact: false }).waitFor();
  await settleMotion();
  await page.screenshot({ path: "docs/screenshots/discussion.png" });
  results.push(
    "Discussion expands, nested reply renders, accepted solution highlights",
  );
  axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  if (axe.violations.length)
    violations.push({
      route: "discussion",
      violations: axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  await page.keyboard.press("Escape");
  await page.goto(`http://127.0.0.1:${port}/guilds?guild=1`);
  await page.getByRole("heading", { name: "The shared quest board" }).waitFor();
  results.push("Guild room deep link renders roster and enrolled quest");
  await settleMotion();
  await page.screenshot({
    path: "docs/screenshots/guild-room.png",
    fullPage: true,
  });
  await page.goto(`http://127.0.0.1:${port}/community`);
  await page.locator('html[data-magic="on"]').waitFor();
  assert.equal(await page.locator(".magic-dust").count(), 1);
  assert.equal(
    await page
      .locator(".magic-atmosphere")
      .evaluate((el) => getComputedStyle(el).pointerEvents),
    "none",
  );
  await page.locator(".w-post.magic-awaken").first().waitFor();
  results.push(
    "Magical atmosphere runs without intercepting input; scroll entrances attach",
  );
  let decorativeRequests = 0;
  const countDecorativeRequests = (req) => {
    if (req.url().includes("/api/community/actions")) decorativeRequests++;
  };
  page.on("request", countDecorativeRequests);
  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.locator('html[data-magic-casting="true"]').waitFor();
  assert.equal(await page.locator(".grand-cast-button").isDisabled(), true);
  assert.equal(
    await page
      .locator(".candlelit-embers > i")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "candlelit-ember",
  );
  assert.equal(
    await page.locator(".grand-magic-scene,.owl-left-wing").count(),
    0,
  );
  assert.equal(
    await page.locator(".world").getAttribute("data-theme"),
    "midnight",
  );
  assert.match(
    await page
      .locator(".w-hall-artwork")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
    /images\/hero\.jpg/,
  );
  const image = await page.request.get(
    `http://127.0.0.1:${port}/images/hero.jpg`,
  );
  assert.equal(image.headers()["content-type"], "image/jpeg");
  assert.ok((await image.body()).length > 100000);
  await page.screenshot({ path: "docs/screenshots/spell-cast.png" });
  await page.waitForFunction(
    () => !document.documentElement.dataset.magicCasting,
  );
  assert.equal(decorativeRequests, 0);
  page.off("request", countDecorativeRequests);
  results.push(
    "Spell cooldown and no gameplay API request; candlelit embers animate over the original signup artwork and midnight theme, with no castle scene",
  );
  await page.locator(".w-post-featured").hover({ position: { x: 40, y: 40 } });
  await page.locator('.w-post-featured[data-spell-hover="true"]').waitFor();
  assert.notEqual(
    await page
      .locator(".w-post-featured")
      .evaluate((el) => el.style.getPropertyValue("--tilt-y")),
    "",
  );
  await page.mouse.move(0, 0);
  await page.waitForFunction(
    () => !document.querySelector('[data-spell-hover="true"]'),
  );
  results.push("Pointer card tilt resets when pointer leaves");
  await page.getByRole("button", { name: "Turn off magical effects" }).click();
  await page.locator('html[data-magic="off"]').waitFor();
  assert.equal(await page.locator(".magic-dust").count(), 0);
  assert.equal(
    await page
      .locator(".w-hall-artwork")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(await page.locator(".w-hall-artwork").isVisible(), true);
  assert.match(
    await page
      .locator(".w-hall-artwork")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
    /images\/hero\.jpg/,
  );
  await page.reload();
  await page.locator('html[data-magic="off"]').waitFor();
  await page.getByRole("button", { name: "Turn on magical effects" }).click();
  await page.locator('html[data-magic="on"]').waitFor();
  results.push(
    "Magic toggle removes particle loop, disables CSS motion and persists across reload",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://127.0.0.1:${port}/leaderboard`);
  await page.locator('html[data-magic="off"]').waitFor();
  assert.equal(await page.locator(".magic-atmosphere").count(), 0);
  assert.equal(await page.locator(".magic-toggle").isDisabled(), true);
  results.push(
    "OS reduced-motion overrides full effects and disables decorative layers",
  );
  await page.getByText("Quiet mode — hide competitive rankings").click();
  await page
    .getByRole("heading", { name: "Your adventure. Your pace." })
    .waitFor();
  results.push("Reduced-motion page and quiet-mode ranking preference");
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    "docs/browser-test-results.json",
    JSON.stringify(
      {
        mode: "component fixtures with mocked API; not live authenticated E2E",
        testedAt: new Date().toISOString(),
        checks: results,
        violations,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed: results.length,
        accessibilityGroups: violations.length,
        violations: violations.map((v) => ({
          route: v.route,
          width: v.width,
          ids: v.violations.map((x) => x.id),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server.close();
}
