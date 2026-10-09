// ──────────────────────────────────────────────────────────
// SCREENS.JS — validation and shaping for team-facing screens
// ──────────────────────────────────────────────────────────
//
// A screen can carry a few links (shown as buttons) and a countdown. Links are
// user-entered URLs rendered as tappable buttons on every team's phone, so
// they are validated on the way in AND on the way out: only http(s) and
// mailto are allowed. Anything else, notably `javascript:` URLs, is dropped
// and never rendered.
//
// No QR codes on purpose: a code on a team's own phone can't be scanned by
// that phone, and this venue has no shared screen to hold one up to.

const MAX_LINKS = 6;
const MAX_LABEL = 60;
const MAX_URL = 500;
const MAX_COUNTDOWN_SECONDS = 4 * 60 * 60; // four hours is already absurd for a break

/**
 * "instagram.com/qmom" -> "https://instagram.com/qmom"
 * Returns null for anything that isn't a safe, parseable http(s)/mailto URL.
 */
function normalizeUrl(raw) {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value || value.length > MAX_URL) return null;

  // A bare domain is what people actually type; assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
  if (parsed.protocol !== 'mailto:' && !parsed.hostname.includes('.')) return null;
  return parsed.toString();
}

/**
 * Validate the links an organizer typed. Returns { links } or { error }.
 * Blank rows are ignored (the editor always shows an empty one to type into).
 */
function normalizeLinksInput(rawLinks) {
  if (rawLinks == null) return { links: [] };
  if (!Array.isArray(rawLinks)) return { error: 'links must be a list' };

  const links = [];
  for (const raw of rawLinks) {
    const label = raw && raw.label != null ? String(raw.label).trim() : '';
    const urlText = raw && raw.url != null ? String(raw.url).trim() : '';
    if (!label && !urlText) continue;

    const url = normalizeUrl(urlText);
    if (!url) {
      return { error: `"${urlText || label}" is not a valid web address` };
    }
    links.push({
      label: (label || urlText).slice(0, MAX_LABEL),
      url,
    });
  }

  if (links.length > MAX_LINKS) {
    return { error: `A screen can have at most ${MAX_LINKS} links` };
  }
  return { links };
}

function normalizeCountdownInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { seconds: null };
  const seconds = Math.round(Number(raw));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return { error: 'Countdown must be a positive number of seconds' };
  }
  if (seconds === 0) return { seconds: null };
  if (seconds > MAX_COUNTDOWN_SECONDS) {
    return { error: 'Countdown can be at most 4 hours' };
  }
  return { seconds };
}

/** Parse stored links defensively, re-validating every URL on the way out. */
function parseStoredLinks(json) {
  if (!json) return [];
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((l) => ({ label: l && l.label, url: normalizeUrl(l && l.url) }))
    .filter((l) => l.url && l.label)
    .slice(0, MAX_LINKS);
}

/** Shape a database row for the organizer's editor. */
function formatScreenRow(row) {
  return {
    ...row,
    links: parseStoredLinks(row.links_json),
    countdown_seconds: row.countdown_seconds ? Number(row.countdown_seconds) : null,
  };
}

module.exports = {
  MAX_LINKS,
  normalizeUrl,
  normalizeLinksInput,
  normalizeCountdownInput,
  parseStoredLinks,
  formatScreenRow,
};
