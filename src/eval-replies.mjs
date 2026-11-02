#!/usr/bin/env node
// Measures the reply reader against what a front-desk person would do, on the synthetic sets:
// data/replies-eval.json (dev set: base + hard, used while writing the prompt) and, when present,
// data/replies-heldout.json (written separately by another model, not to be used for tuning).
// Always runs rules-only; with MODEL_URL set (an OpenAI-compatible endpoint) also rules + model.
//   MODEL_URL=http://127.0.0.1:8093 node src/eval-replies.mjs
//
// A time found by the model is only proposed: the simulated patient confirms it when it is the
// time they asked for and says no otherwise (then a person takes over). That is an assumption,
// stated in every report: a patient who asked for Wednesday evening does not confirm 08:30.
import { existsSync, readFileSync } from 'node:fs';
import { chatModel, readReply } from './reply.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const dev = load('replies-eval.json');
const heldout = existsSync(new URL('../data/replies-heldout.json', import.meta.url)) ? load('replies-heldout.json') : { replies: [] };
const ctx = { timeZone: dev.timeZone, now: dev.now, offered: dev.offered, free: dev.free };
const replies = [...dev.replies, ...heldout.replies.map((r) => ({ ...r, set: 'heldout' }))];
const label = (r) => (r.outcome === 'book' ? `book:${r.slotId}` : r.outcome);

async function judge(item, model) {
  const read = await readReply(item.text, ctx, { model });
  const first = label(read);
  const proposed = read.outcome === 'book' && read.via === 'model';
  // Rules book at once; a model time becomes a booking only if the patient confirms it.
  const final = proposed && first !== item.expect ? 'handover' : first;
  return { ...item, first, final, proposed, viaModel: read.via === 'model', request: read.request };
}

function report(name, rows) {
  const count = (list, ok) => `${list.filter(ok).length}/${list.length}`;
  console.log(`\n${name}`);
  for (const set of [...new Set(rows.map((r) => r.set))]) {
    const part = rows.filter((r) => r.set === set);
    const wrongEvidence = part.filter((r) => r.final.startsWith('book:') && r.final !== r.expect).length;
    const proposals = part.filter((r) => r.proposed);
    console.log(`  ${set.padEnd(8)} first read ${count(part, (r) => r.first === r.expect).padEnd(6)} final ${count(part, (r) => r.final === r.expect).padEnd(6)}`
      + ` wrong bookings kept ${wrongEvidence}  confirmations asked ${proposals.length} (${proposals.filter((r) => r.first !== r.expect).length} wrong, refused)`
      + `  en ${count(part.filter((r) => r.lang === 'en'), (r) => r.first === r.expect)} ar ${count(part.filter((r) => r.lang === 'ar'), (r) => r.first === r.expect)}`
      + `  model path ${count(part.filter((r) => r.viaModel), (r) => r.first === r.expect)}`);
  }
  for (const r of rows.filter((x) => x.first !== x.expect)) {
    const why = r.request ? ` ${JSON.stringify(r.request)}` : '';
    console.log(`    miss [${r.set} ${r.lang}] "${r.text}" expected ${r.expect}, first read ${r.first}${why}`);
  }
}

console.log(`${replies.length} synthetic replies: ${dev.replies.length} dev (base + hard), ${heldout.replies.length} held-out`);
console.log('final = after the confirmation step; the patient confirms only the time they asked for');
const run = async (model) => Promise.all(replies.map((item) => judge(item, model)));
report('rules only', await run(null));
if (process.env.MODEL_URL) {
  const model = chatModel(process.env.MODEL_URL);
  const rows = [];
  for (const item of replies) rows.push(await judge(item, model)); // one at a time: a local model is single-slot
  report(`rules + model (${process.env.MODEL_URL})`, rows);
}
