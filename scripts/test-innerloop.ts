/**
 * InnerLoop pure-logic tests — runs offline, no DB needed.
 *   npx tsx scripts/test-innerloop.ts
 */
import {
  SIZE_BUCKETS,
  allowedSizes,
  difficultyForMinutes,
  packBudget,
  sizeFromMinutes,
  splitSize,
} from "../src/lib/innerloop/sizing";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

console.log("sizeFromMinutes");
check("5m is tiny", sizeFromMinutes(5).bucket === "tiny");
check("10m is tiny", sizeFromMinutes(10).bucket === "tiny");
check("15m is tiny", sizeFromMinutes(15).bucket === "tiny");
check("20m is small", sizeFromMinutes(20).bucket === "small");
check("30m is small", sizeFromMinutes(30).bucket === "small");
check("45m is medium", sizeFromMinutes(45).bucket === "medium");
check("60m is medium", sizeFromMinutes(60).bucket === "medium");
check("90m is large", sizeFromMinutes(90).bucket === "large");
check("120m is large", sizeFromMinutes(120).bucket === "large");
check("150m is epic", sizeFromMinutes(150).bucket === "epic");
check("negative clamps", sizeFromMinutes(-100).bucket === "tiny");
check("huge clamps", sizeFromMinutes(10000).bucket === "epic");

console.log("difficultyForMinutes matches existing hint mapping");
check("10m → trivial", difficultyForMinutes(10) === "trivial");
check("25m → easy", difficultyForMinutes(25) === "easy");
check("45m → medium", difficultyForMinutes(45) === "medium");
check("90m → hard", difficultyForMinutes(90) === "hard");
check("150m → epic", difficultyForMinutes(150) === "epic");

console.log("allowedSizes respects mood/energy");
check(
  "overwhelmed → tiny only",
  JSON.stringify(allowedSizes("high", "overwhelmed")) === JSON.stringify(["tiny"]),
);
check(
  "anxious → tiny/small",
  JSON.stringify(allowedSizes("high", "anxious")) === JSON.stringify(["tiny", "small"]),
);
check(
  "low energy caps at small/medium",
  allowedSizes("low", null).every((b) => ["tiny", "small", "medium"].includes(b)),
);
check(
  "high energy includes large+epic",
  allowedSizes("high", "focused").includes("large") && allowedSizes("high", "focused").includes("epic"),
);

console.log("packBudget");
{
  const pack = packBudget({ availableMinutes: 180, energy: "high", mood: "focused" });
  const total = pack.reduce((s, b) => s + SIZE_BUCKETS[b].minutes, 0);
  check("180m high packs to ≤ 180m", total <= 180, total);
  check("180m high packs ≥ half of budget", total >= 90, total);
  check("max 5 quests", pack.length <= 5, pack.length);
  check(
    "all sizes allowed for high energy",
    pack.every((b) => ["small", "medium", "large", "epic"].includes(b)),
    pack,
  );
}
{
  const pack = packBudget({ availableMinutes: 60, energy: "low", mood: "tired" });
  const total = pack.reduce((s, b) => s + SIZE_BUCKETS[b].minutes, 0);
  check("60m low energy ≤ 60m", total <= 60, total);
  check(
    "low energy never produces large/epic",
    pack.every((b) => ["tiny", "small", "medium"].includes(b)),
    pack,
  );
}
{
  const pack = packBudget({ availableMinutes: 45, energy: "medium", mood: "overwhelmed" });
  check(
    "overwhelmed → all tiny quests",
    pack.every((b) => b === "tiny"),
    pack,
  );
}
{
  const pack = packBudget({ availableMinutes: 10, energy: "medium", mood: null });
  check("10 min still yields ≥1 quest", pack.length >= 1, pack);
}

console.log("splitSize");
{
  const parts = splitSize("epic", 3);
  check("epic split into 3 children", parts.length === 3);
  const per = SIZE_BUCKETS.epic.minutes / 3;
  check(
    "children are appropriately smaller",
    parts.every((b) => SIZE_BUCKETS[b].minutes <= per + 15),
    parts,
  );
}
{
  const parts = splitSize("large", 2);
  check("large split into 2 children", parts.length === 2);
  check(
    "children ≤ small/medium",
    parts.every((b) => ["tiny", "small", "medium"].includes(b)),
    parts,
  );
}

const pass = failures === 0;
console.log(pass ? "\n✅ All InnerLoop logic tests passed" : `\n❌ ${failures} failures`);
process.exit(pass ? 0 : 1);
