// Reads a patient's free-text reply to a slot offer and maps it to one slot or a hand-over.
// Two layers: deterministic rules for the short answers ("2", "٢", "STOP"), then a language
// model that only extracts a structured request. The model never writes to the patient and
// never sees anything clinical: only the reply, today's date and the offered times.
// Booking stays deterministic: the request is matched against real free slots here.
import { bookSlot, formatSlot, freeSlots } from './plan.mjs';

const DAY = 24 * 3600e3;
const PAST_DUE_SEARCH = 14 * DAY;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const INTENTS = ['choose_option', 'ask_time', 'none_work', 'stop', 'other'];

export const REQUEST_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    option: { type: 'integer', minimum: 0, maximum: 9 },
    weekday: { type: 'string', enum: ['none', ...WEEKDAYS] },
    after: { type: 'integer', minimum: -1, maximum: 23 },
    before: { type: 'integer', minimum: -1, maximum: 24 },
  },
  required: ['intent', 'option', 'weekday', 'after', 'before'],
  additionalProperties: false,
};

const SYSTEM = `You read one reply from a patient to a clinic's appointment offer and return JSON only.
intent: choose_option = they pick one of the numbered options; ask_time = they ask for or accept a day or time;
none_work = none of the times suit them; stop = they do not want messages any more;
other = anything else (questions, symptoms, test results, someone else coming, unclear).
option: the number they picked, 1 to 9, else 0. "the first one" = 1, "the second" = 2.
weekday: the day they want (mon..sun), "none" if no day. "tomorrow" is the day after today.
after: earliest hour they accept, 0-23, else -1. before: hour they must be done by, else -1.
"at H" means after=H and before=H+1. morning: before=12. afternoon: after=12, before=17. evening: after=17.
An hour from 1 to 7 without am/pm means the afternoon (13 to 19).
The reply may be in English or Arabic. Answer with compact JSON on one line. Never answer the patient.`;

const toAsciiDigits = (text) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const normalize = (text) =>
  toAsciiDigits(String(text)).trim().toLowerCase().replace(/[.!?؟،,]+$/u, '').replace(/\s+/g, ' ');

const STOP = /^(stop|unsubscribe|إيقاف|ايقاف|توقف|إلغاء الاشتراك|الغاء الاشتراك)$/u;
const OPTION = /^(?:option|number|no\.?|#|رقم|الخيار|خيار)?\s*(\d)$/u;
const request = (intent, option = 0) => ({ intent, option, weekday: 'none', after: -1, before: -1 });

export function readByRules(text) {
  const reply = normalize(text);
  if (STOP.test(reply)) return request('stop');
  const picked = reply.match(OPTION);
  if (picked) return request('choose_option', Number(picked[1]));
  return null;
}

export function validRequest(value) {
  if (!value || typeof value !== 'object') return null;
  const { intent, option, weekday, after, before } = value;
  const hour = (h, max) => Number.isInteger(h) && h >= -1 && h <= max;
  if (!INTENTS.includes(intent) || !Number.isInteger(option) || option < 0 || option > 9) return null;
  if (!['none', ...WEEKDAYS].includes(weekday) || !hour(after, 23) || !hour(before, 24)) return null;
  return { intent, option, weekday, after, before };
}

function slotParts(iso, timeZone) {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date).toLowerCase();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
  return { weekday, hour };
}

// ctx: { timeZone, now, offered: [slot] in offer order, free: [other free slots in the booking window] }
export function resolveRequest(req, ctx) {
  if (req.intent === 'stop') return { outcome: 'stop' };
  if (req.intent === 'none_work' || (req.intent === 'choose_option' && req.option === 0)) return { outcome: 'decline' };
  if (req.intent === 'choose_option') {
    const slot = ctx.offered[req.option - 1];
    return slot ? { outcome: 'book', slotId: slot.id } : { outcome: 'handover', reason: 'option_out_of_range' };
  }
  if (req.intent === 'ask_time') {
    if (req.weekday === 'none' && req.after < 0 && req.before < 0) return { outcome: 'handover', reason: 'no_day_or_time' };
    const fits = (slot) => {
      const { weekday, hour } = slotParts(slot.start, ctx.timeZone);
      return (req.weekday === 'none' || weekday === req.weekday) && (req.after < 0 || hour >= req.after)
        && (req.before < 0 || hour < req.before);
    };
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
  const free = freeSlots(data, visit.clinicianId, at, until).filter((s) => !offer.slots.includes(s.id));
  return { timeZone: data.clinic.timezone, now, offered, free };
}

// Applies a free-text reply to a slot offer: books, records an opt-out, or hands over to a person.
export async function handleReply(data, openLoop, offer, text, { model, now = data.now } = {}) {
  const read = await readReply(text, offerContext(data, openLoop, offer, now), { model });
  if (read.outcome === 'book') return { ...read, ...bookSlot(data, openLoop, read.slotId, now) };
  if (read.outcome === 'stop') {
    data.patients.find((p) => p.id === openLoop.patientId).whatsappOptIn = false;
    return { ...read, next: 'call_task' };
  }
  return { ...read, next: read.outcome === 'decline' ? 'call_task' : 'front_desk_reads' };
}
