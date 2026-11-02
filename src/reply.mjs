// Reads a patient's free-text reply to a slot offer and maps it to one slot or a hand-over.
// Two layers: deterministic rules for the short answers ("2", "٢", "ok the second", "STOP"), then
// a language model that only extracts a structured request. The model never writes to the patient
// and never sees anything clinical: only the reply, today's date and the offered times.
// Booking stays deterministic: the request is matched against real free slots here, and a time
// that came from the model is only held until the patient confirms it.
import { MIN_LEAD, bookSlot, draftConfirmation, formatSlot, freeSlots, holdSlot, releaseHold } from './plan.mjs';

const DAY = 24 * 3600e3;
const PAST_DUE_SEARCH = 14 * DAY;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const INTENTS = ['choose_option', 'ask_time', 'none_work', 'stop', 'other'];

export const REQUEST_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    option: { type: 'integer', minimum: 0, maximum: 9 },
    day: { type: 'integer', minimum: 0, maximum: 31 },
    weekday: { type: 'string', enum: ['none', ...WEEKDAYS] },
    after: { type: 'integer', minimum: -1, maximum: 23 },
    before: { type: 'integer', minimum: -1, maximum: 24 },
  },
  required: ['intent', 'option', 'day', 'weekday', 'after', 'before'],
  additionalProperties: false,
};

const SYSTEM = `You read one reply from a patient to a clinic's appointment offer and return JSON only.
intent: choose_option = they pick one of the numbered options; ask_time = they ask for or accept a day or time;
none_work = none of the times suit them; stop = they do not want messages any more;
other = anything else (questions, symptoms, test results, someone else coming, unclear).
option: the number they picked, 1 to 9, else 0. "the first one" = 1, "the second" = 2.
day: the day of the month if they give a date ("the 4th", "4/11"), else 0.
weekday: the day they want (mon..sun), "none" if no day. "tomorrow" is the day after today.
after: earliest hour they accept, 0-23, else -1. before: hour they must be done by, else -1.
"at H" means after=H and before=H+1. morning: before=12. afternoon: after=12, before=17.
evening and "after work": after=17. An hour from 1 to 7 without am/pm means the afternoon (13 to 19).
The reply may be in English or Arabic. Answer with compact JSON on one line. Never answer the patient.`;

// Arabic-Indic and Persian digits to ASCII; Arabic letter variants and diacritics folded for matching.
const normalize = (text) =>
  String(text)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
    .toLowerCase()
    .replace(/[.!?؟،,]+$/u, '')
    .replace(/\s+/g, ' ');

const STOP = /^(stop|unsubscribe|ايقاف|توقف|الغاء الاشتراك)$/u;
const YES = /^(1|yes|yeah|yep|ok|okay|sure|confirm|confirmed|👍|نعم|ايوه|اي|ايه|تمام|اوكي|موافق|اكيد)$/u;
const NO = /^(0|no|nope|لا)$/u;
const NUMBER_WORDS = new Map([
  ['first', 1], ['1st', 1], ['two', 2], ['second', 2], ['2nd', 2], ['three', 3], ['third', 3], ['3rd', 3],
  ['واحد', 1], ['الاول', 1], ['اول', 1], ['اثنين', 2], ['اثنان', 2], ['الثاني', 2], ['ثاني', 2],
  ['ثلاثه', 3], ['الثالث', 3], ['ثالث', 3],
]);
// Words that do not change which option was picked. "no" and "not" are deliberately absent.
const FILLER = new Set([
  'ok', 'okay', 'yes', 'yeah', 'yep', 'sure', 'please', 'pls', 'plz', 'thanks', 'thank', 'you', 'the', 'is',
  'fine', 'good', 'great', 'perfect', 'works', 'option', 'number', '#', 'i', 'ill', 'll', 'take', 'want', 'choose',
  'pick', 'it', 'for', 'me', 'that', 'appointment', 'slot', 'time',
  'نعم', 'اوكي', 'تمام', 'طيب', 'لو', 'سمحت', 'من', 'فضلك', 'شكرا', 'الموعد', 'موعد', 'رقم', 'الخيار', 'خيار',
  'مناسب', 'ابي', 'ابغي', 'اريد', 'ممتاز', 'حلو',
]);
const request = (intent, option = 0) => ({ intent, option, day: 0, weekday: 'none', after: -1, before: -1 });

export function readByRules(text) {
  const reply = normalize(text);
  if (STOP.test(reply)) return request('stop');
  const picks = new Set();
  let ones = 0;
  for (const token of reply.match(/\d+(?:st|nd|rd|th)?|[\p{L}\p{M}]+|#/gu) ?? []) {
    if (/^\d+$/.test(token)) picks.add(Number(token));
    else if (NUMBER_WORDS.has(token)) picks.add(NUMBER_WORDS.get(token));
    else if (token === 'one') ones += 1; // "one" is a pick alone, filler in "the second one"
    else if (!FILLER.has(token)) return null;
  }
  if (picks.size === 0 && ones > 0) picks.add(1);
  return picks.size === 1 ? request('choose_option', [...picks][0]) : null;
}

export function validRequest(value) {
  if (!value || typeof value !== 'object') return null;
  const { intent, option, day, weekday, after, before } = value;
  const within = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (!INTENTS.includes(intent) || !within(option, 0, 9) || !within(day, 0, 31)) return null;
  if (!['none', ...WEEKDAYS].includes(weekday) || !within(after, -1, 23) || !within(before, -1, 24)) return null;
  return { intent, option, day, weekday, after, before };
}

function slotParts(iso, timeZone) {
  const date = new Date(iso);
  const part = (options) => new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(date);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date).toLowerCase(),
    day: Number(part({ day: 'numeric' })),
    hour: Number(part({ hour: '2-digit', hourCycle: 'h23' })),
  };
}

// ctx: { timeZone, now, offered: [slot] in offer order, free: [other free slots in the booking window] }
export function resolveRequest(req, ctx) {
  if (req.intent === 'stop') return { outcome: 'stop' };
  if (req.intent === 'none_work' || (req.intent === 'choose_option' && req.option === 0)) return { outcome: 'decline' };
  // The day of the month only counts when no weekday was named: on a conflict the weekday wins.
  const fits = (slot) => {
    const { weekday, day, hour } = slotParts(slot.start, ctx.timeZone);
    const dayOk = req.weekday !== 'none' ? weekday === req.weekday : req.day === 0 || day === req.day;
    return dayOk && (req.after < 0 || hour >= req.after) && (req.before < 0 || hour < req.before);
  };
  if (req.intent === 'choose_option') {
    const slot = ctx.offered[req.option - 1];
    if (!slot) return { outcome: 'handover', reason: 'option_out_of_range' };
    // An option that contradicts the time they also asked for is read as that time instead.
    if (fits(slot)) return { outcome: 'book', slotId: slot.id };
    req = { ...req, intent: 'ask_time' };
  }
  if (req.intent === 'ask_time') {
    if (req.weekday === 'none' && req.day === 0 && req.after < 0 && req.before < 0) {
      return { outcome: 'handover', reason: 'no_day_or_time' };
    }
    const earliestFirst = [...ctx.free].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const slot = ctx.offered.find(fits) ?? earliestFirst.find(fits);
    return slot ? { outcome: 'book', slotId: slot.id } : { outcome: 'handover', reason: 'no_matching_slot' };
  }
  return { outcome: 'handover', reason: 'not_a_booking_reply' };
}

// Everything the model is allowed to see.
export function modelInput(text, ctx) {
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.timeZone, weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(ctx.now));
  return {
    today,
    options: ctx.offered.map((slot, i) => `${i + 1}) ${formatSlot(slot.start, ctx.timeZone)}`),
    reply: String(text),
  };
}

export async function readReply(text, ctx, { model } = {}) {
  const ruled = readByRules(text);
  if (ruled) return { ...resolveRequest(ruled, ctx), via: 'rules' };
  if (!model) return { outcome: 'handover', reason: 'needs_model', via: 'none' };
  let req = null;
  try {
    req = validRequest(await model(modelInput(text, ctx)));
  } catch {
    req = null;
  }
  if (!req) return { outcome: 'handover', reason: 'model_unusable', via: 'model' };
  return { ...resolveRequest(req, ctx), via: 'model', request: req };
}

// A model behind any OpenAI-compatible chat endpoint (tested with llama.cpp's llama-server
// running Gemma 4 E4B locally). The JSON schema becomes a grammar, so output is always parseable.
export function chatModel(baseUrl, { fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  return async (input) => {
    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        temperature: 0,
        max_tokens: 80,
        chat_template_kwargs: { enable_thinking: false }, // Gemma 4 otherwise spends the budget thinking
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(input) }],
        response_format: { type: 'json_schema', json_schema: { name: 'request', schema: REQUEST_SCHEMA } },
      }),
    });
    if (!res.ok) throw new Error(`model http ${res.status}`);
    const body = await res.json();
    return JSON.parse(body.choices[0].message.content);
  };
}

export function offerContext(data, openLoop, offer, now = data.now) {
  const visit = data.returnVisits.find((v) => v.id === openLoop.recordId);
  const at = Date.parse(now);
  const until = openLoop.overdue ? at + PAST_DUE_SEARCH : Date.parse(visit.dueBy);
  const offered = offer.slots.map((id) => data.calendar.slots.find((s) => s.id === id));
  const free = freeSlots(data, visit.clinicianId, at + MIN_LEAD, until).filter((s) => !offer.slots.includes(s.id));
  return { timeZone: data.clinic.timezone, now, offered, free };
}

const optOut = (data, openLoop) => {
  data.patients.find((p) => p.id === openLoop.patientId).whatsappOptIn = false;
};

// Applies a free-text reply to a slot offer. A pick read by the rules books at once; a time the
// model found is held and confirmed first; STOP records the opt-out; the rest goes to a person.
export async function handleReply(data, openLoop, offer, text, { model, now = data.now } = {}) {
  const read = await readReply(text, offerContext(data, openLoop, offer, now), { model });
  if (read.outcome === 'book' && read.via === 'rules') return { ...read, ...bookSlot(data, openLoop, read.slotId, now) };
  if (read.outcome === 'book') {
    const hold = holdSlot(data, openLoop, read.slotId, now);
    if (hold.status !== 'held') return { ...read, ...hold };
    const visit = data.returnVisits.find((v) => v.id === openLoop.recordId);
    const patient = data.patients.find((p) => p.id === openLoop.patientId);
    const clinician = data.clinic.clinicians.find((c) => c.id === visit.clinicianId);
    const slot = data.calendar.slots.find((s) => s.id === read.slotId);
    return { ...read, ...hold, patientMessage: draftConfirmation(data, patient, clinician, slot) };
  }
  if (read.outcome === 'stop') {
    optOut(data, openLoop);
    return { ...read, next: 'call_task' };
  }
  return { ...read, next: read.outcome === 'decline' ? 'call_task' : 'front_desk_reads' };
}

// The patient's answer to a confirmation. Only a clear yes books; anything else releases the hold.
export function handleConfirmation(data, openLoop, pending, text, { now = data.now } = {}) {
  const reply = normalize(text);
  if (YES.test(reply)) return bookSlot(data, openLoop, pending.slotId, now);
  releaseHold(data, openLoop, pending.slotId);
  if (STOP.test(reply)) {
    optOut(data, openLoop);
    return { status: 'released', outcome: 'stop', next: 'call_task' };
  }
  return { status: 'released', next: NO.test(reply) ? 'call_task' : 'front_desk_reads' };
}
