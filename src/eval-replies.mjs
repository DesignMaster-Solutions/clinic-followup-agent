#!/usr/bin/env node
// Measures how often the reply reader does what a front-desk person would do, on the
// synthetic set in data/replies-eval.json. Always runs rules-only; with MODEL_URL set
// (an OpenAI-compatible endpoint) it also runs rules + model.
//   MODEL_URL=http://127.0.0.1:8093 node src/eval-replies.mjs
import { readFileSync } from 'node:fs';
import { chatModel, readReply } from './reply.mjs';

const set = JSON.parse(readFileSync(new URL('../data/replies-eval.json', import.meta.url), 'utf8'));
const ctx = { timeZone: set.timeZone, now: set.now, offered: set.offered, free: set.free };
const label = (r) => (r.outcome === 'book' ? `book:${r.slotId}` : r.outcome);

async function run(name, model) {
  const rows = [];
  for (const item of set.replies) rows.push({ ...item, got: label(await readReply(item.text, ctx, { model })) });
  const score = (list) => `${list.filter((r) => r.got === r.expect).length}/${list.length}`;
  const part = (key, value) => score(rows.filter((r) => r[key] === value));
  console.log(`\n${name}: ${score(rows)} correct (base ${part('set', 'base')}, hard ${part('set', 'hard')}; en ${part('lang', 'en')}, ar ${part('lang', 'ar')})`);
  for (const r of rows.filter((x) => x.got !== x.expect)) console.log(`  miss [${r.set} ${r.lang}] "${r.text}" expected ${r.expect}, got ${r.got}`);
  return rows;
}

console.log(`${set.replies.length} synthetic replies (${set.replies.filter((r) => r.lang === 'ar').length} in Arabic, ${set.replies.filter((r) => r.set === 'hard').length} hard)`);
await run('rules only', null);
if (process.env.MODEL_URL) await run(`rules + model (${process.env.MODEL_URL})`, chatModel(process.env.MODEL_URL));
