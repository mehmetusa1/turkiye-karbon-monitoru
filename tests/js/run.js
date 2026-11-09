// Bağımlılıksız mini test koşucusu. Sonuç #out içine textContent ile yazılır.
const results = [];
const queue = [];

export function test(name, fn) {
  queue.push({ name, fn });
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function assertEqual(actual, expected) {
  if (!deepEqual(actual, expected)) {
    throw new Error(`beklenen ${JSON.stringify(expected)}, gelen ${JSON.stringify(actual)}`);
  }
}

export const ctx = {};

async function main() {
  const out = document.getElementById("out");
  try {
    const res = await fetch("../../site/data/tr-map.json", { cache: "no-cache" });
    ctx.MAP = await res.json();
    await import("./core.test.js");
  } catch (err) {
    out.textContent = `FAIL (yükleme): ${err.message}`;
    return;
  }
  for (const { name, fn } of queue) {
    try {
      await fn();
      results.push(`ok   ${name}`);
    } catch (err) {
      results.push(`FAIL ${name}: ${err.message}`);
    }
  }
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  const summary = failed ? `FAIL ${failed}/${queue.length}` : `PASS ${queue.length}/${queue.length}`;
  out.textContent = [summary, ...results].join("\n");
  document.title = summary;
}

main();
