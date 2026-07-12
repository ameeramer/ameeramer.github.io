// Pro unlock. Primary path: verify a Gumroad license key against the
// Gumroad Licenses API. Fallback (offline / CORS-blocked): accept keys in
// Gumroad's standard 35-char format so paying customers are never locked
// out by a network hiccup. Client-side gating is honesty-based by design —
// the watermark is the nudge, not DRM.

// ── SET THESE after creating your Gumroad product (optional — the ETH
// checkout in cryptopay.js works without any of this) ──
// Gumroad → Product → Advanced → "License keys" (enable), then paste the
// product ID here. Empty string = offline format check only.
export const GUMROAD_PRODUCT_ID = '';
// Your public product page, e.g. 'https://yourname.gumroad.com/l/moonshot'.
// While empty, the card-payment button stays hidden and ETH is the only
// checkout shown.
export const GUMROAD_URL = '';

const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

// Gumroad keys look like: 85DB562A-C11D4B06-A2335A6B-8C079166
const KEY_FORMAT = /^[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/i;

export async function verifyLicense(key) {
  const trimmed = key.trim();
  if (!KEY_FORMAT.test(trimmed)) {
    return { ok: false, reason: 'That doesn’t look like a license key. Keys look like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX.' };
  }
  if (!GUMROAD_PRODUCT_ID) {
    // Product not wired to Gumroad yet — accept well-formed keys.
    return { ok: true, offline: true };
  }
  try {
    const res = await fetch(GUMROAD_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: GUMROAD_PRODUCT_ID,
        license_key: trimmed,
        increment_uses_count: 'false',
      }),
    });
    const data = await res.json();
    if (data.success && !data.purchase?.refunded && !data.purchase?.chargebacked) {
      return { ok: true };
    }
    return { ok: false, reason: 'This key isn’t valid for Moonshot Pro. Check for typos, or reply to your Gumroad receipt for help.' };
  } catch {
    // Network/CORS failure — don't lock out a paying customer.
    return { ok: true, offline: true };
  }
}
