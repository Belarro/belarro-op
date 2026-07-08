// Ported verbatim from saletracker/src/utils/followUpTemplates.js — the
// pipeline-stage-driven WhatsApp/email message generator. Operates on
// locations.pipeline_stage directly; this is a SEPARATE system from the
// numeric-stage drip campaign in belarro_v4_follow_up (admin/follow-ups) —
// do not merge the two, they serve different flows (see SPEC.md item 4).

export interface TemplateLoc {
  location_name?: string | null;
  contact_person?: string | null;
  contact_title?: string | null;
}

interface TemplateResult {
  body: string;
  emailSubject?: string;
  emailBody?: string;
  nextStage: string | null;
  nextActionDays: number | null;
  nextActionType: string | null;
  _nextActionDate?: Date | null;
  _deliveryDate?: string;
  _needsDeliveryDate?: boolean;
}

const BASE_LINK_EN = 'https://belarro.com/for-chefs';
const BASE_LINK_DE = 'https://belarro.com/de/for-chefs';

function priceLink(base: string, loc: TemplateLoc): string {
  const params = new URLSearchParams();
  if (loc.location_name) params.set('r', loc.location_name);
  if (loc.contact_person) params.set('p', loc.contact_person);
  if (loc.contact_title) params.set('t', loc.contact_title);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

type TemplateFn = (loc: TemplateLoc, extra?: { deliveryDate?: string }) => TemplateResult;
type StageTemplates = { EN: TemplateFn; DE: TemplateFn };

export const FOLLOW_UP_TEMPLATES: Record<string, StageTemplates> = {
  new_visit: {
    EN: (loc) => ({
      body: [
        `Hello ${loc.contact_person},`,
        `Thank you for your time today; it was a pleasure meeting you.`,
        `Here is the link for our varieties and pricing: ${priceLink(BASE_LINK_EN, loc)}`,
        `I would love to hear what you think. Just a reminder: no delivery fees, no minimum order.`,
        `Enjoy the rest of your service.\nRon from Belarro`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Fresh Microgreens for Your Kitchen',
      emailBody: [
        `Hello ${loc.contact_person},`,
        `Thank you for your time today; it was a pleasure meeting you.`,
        `Here is the link for our varieties and pricing:\n${priceLink(BASE_LINK_EN, loc)}`,
        `No delivery fees, no minimum order.`,
        `Enjoy the rest of your service.\nRon from Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_1', nextActionDays: 2, nextActionType: 'whatsapp',
    }),
    DE: (loc) => ({
      body: [
        `Hallo ${loc.contact_person},`,
        `vielen Dank für deine Zeit heute, hat mich gefreut dich kennenzulernen.`,
        `Hier ist der Link zu unseren Sorten und Preisen: ${priceLink(BASE_LINK_DE, loc)}`,
        `Ich bin gespannt auf dein Feedback. Nur zur Erinnerung: keine Lieferkosten, kein Mindestbestellwert.`,
        `Viel Erfolg im Service.\nRon von Belarro`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Frische Microgreens für Ihre Küche',
      emailBody: [
        `Hallo ${loc.contact_person},`,
        `vielen Dank für deine Zeit heute, hat mich gefreut dich kennenzulernen.`,
        `Hier ist der Link zu unseren Sorten und Preisen:\n${priceLink(BASE_LINK_DE, loc)}`,
        `Keine Lieferkosten, kein Mindestbestellwert.`,
        `Viel Erfolg im Service.\nRon von Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_1', nextActionDays: 2, nextActionType: 'whatsapp',
    }),
  },
  follow_up_1: {
    EN: (loc) => ({
      body: [
        `Hello ${loc.contact_person},`,
        `Ron from Belarro. I hope you had the chance to taste the samples and see how they work with your dishes.`,
        `We only grow what you order — no old stock, zero waste. We harvest the morning of delivery, and our greens last up to 10 days in the fridge.`,
        `Let me know what caught your eye and I'll get it into the next grow cycle.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Quick question about our samples',
      emailBody: [
        `Hello ${loc.contact_person},`,
        `I hope you had the chance to taste the samples and see how they work with your dishes.`,
        `We only grow what you order — no old stock, zero waste. Harvested the morning of delivery, up to 10 days shelf life.`,
        `Let me know what caught your eye.\nRon from Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_2', nextActionDays: 3, nextActionType: 'whatsapp',
    }),
    DE: (loc) => ({
      body: [
        `Hallo ${loc.contact_person},`,
        `Ron von Belarro hier. Ich hoffe, du konntest die Samples testen und sehen, wie sie zu deinen Gerichten passen.`,
        `Wir bauen nur das an, was du bestellst – kein Lager, kein alter Bestand, null Verschwendung. Wir ernten am Morgen der Lieferung, und unsere Greens halten bis zu 10 Tage im Kühlschrank.`,
        `Sag mir einfach, was dir gefallen hat, dann plane ich es für den nächsten Grow ein.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Kurze Frage zu unseren Samples',
      emailBody: [
        `Hallo ${loc.contact_person},`,
        `Ich hoffe, du konntest die Samples testen und sehen, wie sie zu deinen Gerichten passen.`,
        `Wir bauen nur das an, was du bestellst – kein Lager, null Verschwendung. Ernte am Morgen der Lieferung, bis zu 10 Tage haltbar.`,
        `Sag mir einfach, was dir gefallen hat.\nRon von Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_2', nextActionDays: 3, nextActionType: 'whatsapp',
    }),
  },
  follow_up_2: {
    EN: (loc) => ({
      body: [
        `Hello ${loc.contact_person},`,
        `Ron from Belarro. Wanted to follow up and see how you found our greens.`,
        `We grow over 25 varieties — more variety than most suppliers, more options for your plates. Orders are recurring: order once, receive fresh every Tuesday. You can always change, add or cancel.`,
        `Here's the full list: ${priceLink(BASE_LINK_EN, loc)}\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | 25 varieties grown for chefs',
      emailBody: [
        `Hello ${loc.contact_person},`,
        `Wanted to follow up and see how you found our greens.`,
        `We grow over 25 varieties — more options for your plates. Order once, receive fresh every Tuesday. Change, add or cancel anytime.`,
        `Full list: ${priceLink(BASE_LINK_EN, loc)}\nRon from Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_3', nextActionDays: 9, nextActionType: 'whatsapp',
    }),
    DE: (loc) => ({
      body: [
        `Hallo ${loc.contact_person},`,
        `Ron von Belarro hier. Wollte kurz nachfragen, wie dir unsere Greens gefallen haben.`,
        `Wir bauen über 25 Sorten an – mehr Auswahl als bei den meisten Anbietern, mehr Möglichkeiten für deine Teller. Bestellungen laufen automatisch: einmal bestellen, jede Woche frisch am Dienstag geliefert. Du kannst jederzeit ändern, hinzufügen oder pausieren.`,
        `Hier ist die komplette Liste: ${priceLink(BASE_LINK_DE, loc)}\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | 25 Sorten für Ihre Küche',
      emailBody: [
        `Hallo ${loc.contact_person},`,
        `Wollte kurz nachfragen, wie dir unsere Greens gefallen haben.`,
        `Über 25 Sorten – mehr Auswahl, mehr Möglichkeiten. Einmal bestellen, jeden Dienstag frisch. Jederzeit änderbar.`,
        `Komplette Liste: ${priceLink(BASE_LINK_DE, loc)}\nRon von Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_3', nextActionDays: 9, nextActionType: 'whatsapp',
    }),
  },
  follow_up_3: {
    EN: (loc) => ({
      body: [
        `Hello ${loc.contact_person},`,
        `Ron from Belarro. Haven't heard back, just wanted to check in.`,
        `We're local, no imports — faster, more consistent product, just fresh greens with less emissions.`,
        `No minimums, no pressure. Just let me know when you're ready.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Still thinking it over?',
      emailBody: [
        `Hello ${loc.contact_person},`,
        `Haven't heard back, just wanted to check in.`,
        `Local, no imports — consistent quality, less emissions. No minimums, no pressure.`,
        `Let me know when you're ready.\nRon from Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_4', nextActionDays: 16, nextActionType: 'whatsapp',
    }),
    DE: (loc) => ({
      body: [
        `Hallo ${loc.contact_person},`,
        `Ron von Belarro hier. Wollte kurz nachhaken, habe nichts mehr von dir gehört.`,
        `Wir sind lokal, keine Importe – dadurch schneller und konstanter in der Qualität. Einfach frische Greens mit weniger Emissionen.`,
        `Kein Mindestbestellwert, kein Druck. Meld dich, wenn es für dich passt.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Noch am Überlegen?',
      emailBody: [
        `Hallo ${loc.contact_person},`,
        `Wollte kurz nachhaken, habe nichts mehr von dir gehört.`,
        `Lokal, keine Importe – konstante Qualität, weniger Emissionen. Kein Mindestbestellwert, kein Druck.`,
        `Meld dich, wenn es für dich passt.\nRon von Belarro`,
      ].join('\n\n'),
      nextStage: 'follow_up_4', nextActionDays: 16, nextActionType: 'whatsapp',
    }),
  },
  follow_up_4: {
    EN: (loc) => ({
      body: [
        `Hello ${loc.contact_person},`,
        `Ron from Belarro. No worries if the timing wasn't right.`,
        `Whenever you need fresh microgreens, we're one message away. No minimums, free delivery, harvested the morning we bring them to you.`,
        `Our varieties and pricing are always here: ${priceLink(BASE_LINK_EN, loc)}`,
        `Wishing you a great season.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Whenever you are ready',
      emailBody: [
        `Hello ${loc.contact_person},`,
        `No worries if the timing wasn't right.`,
        `Whenever you need fresh microgreens, we're one message away. No minimums, free delivery, harvested fresh.`,
        `Varieties & pricing: ${priceLink(BASE_LINK_EN, loc)}`,
        `Wishing you a great season.\nRon from Belarro`,
      ].join('\n\n'),
      nextStage: 'inactive', nextActionDays: null, nextActionType: null,
    }),
    DE: (loc) => ({
      body: [
        `Hallo ${loc.contact_person},`,
        `Ron von Belarro hier. Kein Problem, wenn es zeitlich nicht gepasst hat.`,
        `Wenn du frische Microgreens brauchst, sind wir nur eine Nachricht entfernt. Kein Mindestbestellwert, kostenlose Lieferung, am Morgen der Lieferung geerntet.`,
        `Unsere Sorten und Preise findest du hier: ${priceLink(BASE_LINK_DE, loc)}`,
        `Ich wünsche dir eine starke Saison.\nRon`,
      ].join('\n\n'),
      emailSubject: 'Belarro Berlin | Wir sind da wenn Sie bereit sind',
      emailBody: [
        `Hallo ${loc.contact_person},`,
        `Kein Problem, wenn es zeitlich nicht gepasst hat.`,
        `Wenn du frische Microgreens brauchst, sind wir nur eine Nachricht entfernt. Kein Mindestbestellwert, kostenlose Lieferung, frisch geerntet.`,
        `Sorten & Preise: ${priceLink(BASE_LINK_DE, loc)}`,
        `Starke Saison!\nRon von Belarro`,
      ].join('\n\n'),
      nextStage: 'inactive', nextActionDays: null, nextActionType: null,
    }),
  },
  order_confirmed: {
    EN: (loc, extra) => {
      const deliveryISO = extra?.deliveryDate || '';
      const deliveryD = deliveryISO ? new Date(deliveryISO + 'T00:00:00') : null;
      const dateStr = deliveryD ? deliveryD.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '[delivery date]';
      const monday = deliveryD ? new Date(deliveryD) : null;
      if (monday) monday.setDate(monday.getDate() - 1);
      return {
        body: [`Confirmed.`, `First delivery: ${dateStr}.`, `You will receive the same every Tuesday.`, `Adjustments can be made anytime.`].join('\n\n'),
        nextStage: 'delivery_reminder', nextActionDays: null, nextActionType: 'whatsapp',
        _nextActionDate: monday, _deliveryDate: deliveryISO, _needsDeliveryDate: true,
      };
    },
    DE: (loc, extra) => {
      const deliveryISO = extra?.deliveryDate || '';
      const deliveryD = deliveryISO ? new Date(deliveryISO + 'T00:00:00') : null;
      const dateStr = deliveryD ? deliveryD.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : '[Lieferdatum]';
      const monday = deliveryD ? new Date(deliveryD) : null;
      if (monday) monday.setDate(monday.getDate() - 1);
      return {
        body: [`Bestätigt.`, `Erste Lieferung: ${dateStr}.`, `Du bekommst jeden Dienstag das gleiche.`, `Änderungen sind jederzeit möglich.`].join('\n\n'),
        nextStage: 'delivery_reminder', nextActionDays: null, nextActionType: 'whatsapp',
        _nextActionDate: monday, _deliveryDate: deliveryISO, _needsDeliveryDate: true,
      };
    },
  },
  delivery_reminder: {
    EN: (loc) => ({ body: [`Hey ${loc.contact_person},`, `First delivery tomorrow.`].join('\n\n'), nextStage: 'post_delivery', nextActionDays: 2, nextActionType: 'whatsapp' }),
    DE: (loc) => ({ body: [`Hey ${loc.contact_person},`, `Erste Lieferung morgen.`].join('\n\n'), nextStage: 'post_delivery', nextActionDays: 2, nextActionType: 'whatsapp' }),
  },
  post_delivery: {
    EN: (loc) => ({
      body: [`Hey ${loc.contact_person},`, `Did everything perform as expected?`, `Let me know what you want to adjust.`].join('\n\n'),
      emailSubject: 'Feedback',
      emailBody: [`Hi ${loc.contact_person},`, `Did everything perform as expected?`, `I can adjust anything for the next delivery.`, `Ron`].join('\n\n'),
      nextStage: 'active_customer', nextActionDays: 42, nextActionType: 'whatsapp',
    }),
    DE: (loc) => ({
      body: [`Hey ${loc.contact_person},`, `Hat alles wie erwartet funktioniert?`, `Sag mir was du anpassen willst.`].join('\n\n'),
      emailSubject: 'Feedback',
      emailBody: [`Hi ${loc.contact_person},`, `Hat alles wie erwartet funktioniert?`, `Ich kann alles für die nächste Lieferung anpassen.`, `Ron`].join('\n\n'),
      nextStage: 'active_customer', nextActionDays: 42, nextActionType: 'whatsapp',
    }),
  },
  active_customer: {
    EN: (loc) => ({ body: [`Hey ${loc.contact_person},`, `Is everything running as it should?`, `We can refine or introduce something new if needed.`].join('\n\n'), nextStage: 'active_customer', nextActionDays: 42, nextActionType: 'whatsapp' }),
    DE: (loc) => ({ body: [`Hey ${loc.contact_person},`, `Läuft alles wie es soll?`, `Wir können anpassen oder was Neues einbauen wenn du willst.`].join('\n\n'), nextStage: 'active_customer', nextActionDays: 42, nextActionType: 'whatsapp' }),
  },
  inactive: {
    EN: (loc) => ({ body: [`Hey ${loc.contact_person},`, `Is everything running as it should?`, `We can refine or introduce something new if needed.`].join('\n\n'), nextStage: 'closed_lost', nextActionDays: null, nextActionType: null }),
    DE: (loc) => ({ body: [`Hey ${loc.contact_person},`, `Läuft alles wie es soll?`, `Wir können anpassen oder was Neues einbauen wenn du willst.`].join('\n\n'), nextStage: 'closed_lost', nextActionDays: null, nextActionType: null }),
  },
};

export interface FollowUpMessage extends TemplateResult {
  waLink: string | null;
  phone: string;
  stage: string;
  lang: string;
}

export function getFollowUpMessage(
  location: TemplateLoc & { pipeline_stage?: string | null; language?: string | null; direct_phone?: string | null; business_phone?: string | null },
  extra?: { deliveryDate?: string }
): FollowUpMessage | null {
  const stage = location.pipeline_stage || 'new_visit';
  const lang = (location.language || '').toUpperCase();
  const template = FOLLOW_UP_TEMPLATES[stage];
  if (!template) return null;

  let result: TemplateResult;
  if (lang === 'EN' || lang === 'DE') {
    const langTemplate = template[lang as 'EN' | 'DE'] || template.DE;
    result = langTemplate(location, extra);
  } else {
    const en = template.EN(location, extra);
    const de = template.DE(location, extra);
    result = {
      ...de,
      body: de.body + '\n\n---\n\n' + en.body,
      emailBody: (de.emailBody || de.body) + '\n\n---\n\n' + (en.emailBody || en.body),
      emailSubject: de.emailSubject,
    };
  }

  let phone = (location.direct_phone || location.business_phone || '').replace(/[\s\-().]/g, '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = '49' + phone.slice(1);
  for (const code of ['972', '44', '43', '49', '1']) {
    if (phone.startsWith(code + code)) { phone = phone.slice(code.length); break; }
  }
  for (const code of ['972', '44', '43', '49', '1']) {
    if (phone.startsWith(code) && phone[code.length] === '0') { phone = code + phone.slice(code.length + 1); break; }
  }
  const encodedText = phone ? encodeURIComponent(result.body) : '';
  const waLink = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}` : null;

  return { ...result, waLink, phone, stage, lang };
}

export function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    new_visit: 'Message 1 — The Link (2h)',
    follow_up_1: 'Message 2 — The Taste (2 days)',
    follow_up_2: 'Message 3 — The Facts (5 days)',
    follow_up_3: 'Message 4 — The Easy Yes (2 weeks)',
    follow_up_4: 'Message 5 — The Open Door (1 month)',
    order_confirmed: 'Order confirmed',
    delivery_reminder: 'Delivery tomorrow',
    post_delivery: 'Post-delivery feedback',
    active_customer: '6-week check-in',
    inactive: 'Inactive',
    closed_won: 'Active customer',
    closed_lost: 'Closed',
  };
  return labels[stage] || stage;
}
