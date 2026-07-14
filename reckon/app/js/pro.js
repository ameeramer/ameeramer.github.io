// Pro state + the unlock modal. Pro is stored locally (honesty-based, same as
// Moonshot). Unlocking flips a flag, enables live FX rates and unlimited notes,
// and shows the PRO badge. Payment is verified on-chain by cryptopay.js.

import { PAY_ADDRESS, PRICE_USD, verifyPayment, findRecentPayment, suggestedEth } from './cryptopay.js';
import { setCurrencyRates } from './engine/units.js';

const PRO_KEY = 'reckon_pro';
let pro = false;
const listeners = [];

export function isPro() { return pro; }
export function onProChange(fn) { listeners.push(fn); }
function emit() { for (const fn of listeners) try { fn(pro); } catch {} }

export function initPro() {
  try { pro = localStorage.getItem(PRO_KEY) === '1'; } catch {}
  buildModal();
  emit();
  if (pro) refreshRates();
}

function activate() {
  pro = true;
  try { localStorage.setItem(PRO_KEY, '1'); } catch {}
  emit();
  refreshRates();
}

// Live FX rates — only fetched for Pro (free tier uses built-in static rates).
// APIs return units-per-USD (base=USD); setCurrencyRates wants USD-per-unit, so
// we invert each rate before applying.
async function refreshRates() {
  const sources = [
    async () => (await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD')).json()).rates,
    async () => (await (await fetch('https://open.er-api.com/v6/latest/USD')).json()).rates,
  ];
  for (const s of sources) {
    try {
      const perUsd = await s();
      if (perUsd && perUsd.EUR) {
        const usdPer = {};
        for (const [code, r] of Object.entries(perUsd)) if (r > 0) usdPer[code] = 1 / r;
        setCurrencyRates(usdPer);
        return true;
      }
    } catch {}
  }
  return false;
}

const PERKS = [
  'Live exchange rates — 160+ currencies, updated on unlock',
  'Unlimited notes & tabs',
  'Export a note to .txt (results included)',
  'Support a solo, privacy-first tool — no ads, no tracking, no account',
];

export function openProModal() { document.getElementById('pro-modal').showModal(); }

function buildModal() {
  const dlg = document.getElementById('pro-modal');
  dlg.innerHTML = `
    <div class="modal-body">
      <button class="modal-close" id="pro-x" aria-label="Close">✕</button>
      <div class="pro-head">
        <span class="pro-mark">=</span>
        <div>
          <h3 class="pro-title">Reckon Pro</h3>
          <div style="font-size:12.5px;color:var(--ink-faint)">One payment · $${PRICE_USD} · yours forever</div>
        </div>
      </div>
      <ul class="pro-perks">${PERKS.map(p => `<li>${p}</li>`).join('')}</ul>

      <div class="pro-divider">Pay with crypto</div>
      <p class="pay-step">Send about <strong id="eth-amt">~$${PRICE_USD} of ETH</strong> — on
      <strong>Base</strong> (fees under a cent, seconds to confirm; Coinbase withdraws to it
      directly) or Ethereum mainnet. Same address on both:</p>
      <div class="pay-addr">
        <code id="pay-addr">${PAY_ADDRESS}</code>
        <button class="btn" id="copy-addr" type="button">Copy</button>
      </div>
      <div class="wallet-link"><a id="wallet-deeplink" href="#" rel="noopener">Open in wallet ↗</a></div>

      <p class="pay-step">Then paste your <strong>transaction hash</strong> to unlock — or let Reckon find it:</p>
      <div class="pay-row">
        <input class="text-input" id="tx-hash" placeholder="0x… transaction hash" autocomplete="off" spellcheck="false">
        <button class="btn primary" id="verify-btn" type="button">Verify</button>
      </div>
      <button class="btn ghost wide" id="find-btn" type="button" style="margin-top:8px">Find my payment automatically</button>
      <p class="pay-msg" id="pay-msg"></p>

      <div class="pro-divider">No crypto? Pay by card</div>
      <p class="pay-step">Buy ETH with a card and have it delivered straight to the address above, then verify as usual:</p>
      <div class="card-links">
        <a class="btn wide" id="onramp-1" target="_blank" rel="noopener">Guardarian ↗</a>
        <a class="btn wide" id="onramp-2" target="_blank" rel="noopener">SimpleSwap ↗</a>
      </div>
      <p class="cheat-foot">Pro is stored locally on this device. Lost it after a reinstall? Re-verify the same transaction — it still counts.</p>
    </div>`;

  dlg.querySelector('#pro-x').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  const msg = dlg.querySelector('#pay-msg');
  const setMsg = (t, cls = '') => { msg.textContent = t; msg.className = 'pay-msg ' + cls; };

  dlg.querySelector('#copy-addr').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(PAY_ADDRESS); setMsg('Address copied.', 'ok'); } catch {}
  });

  // EIP-681 wallet deeplink + on-ramp links, with live ETH amount when possible
  suggestedEth().then((eth) => {
    const amtEl = dlg.querySelector('#eth-amt');
    const wei = eth ? BigInt(Math.round(eth * 1e18)).toString() : '';
    if (eth) amtEl.textContent = `~${eth} ETH ($${PRICE_USD})`;
    // @8453 = Base, the recommended (cheapest) network for EIP-681 wallets.
    dlg.querySelector('#wallet-deeplink').href = `ethereum:${PAY_ADDRESS}@8453${wei ? '?value=' + wei : ''}`;
    dlg.querySelector('#onramp-1').href =
      `https://guardarian.com/buy-eth?crypto_currency=ETH&fiat_currency=USD&fiat_amount=${PRICE_USD}&payout_address=${PAY_ADDRESS}`;
    dlg.querySelector('#onramp-2').href =
      `https://simpleswap.io/?to=eth&address=${PAY_ADDRESS}`;
  });

  const verify = async (finder) => {
    setMsg('Checking the blockchain…');
    const btnV = dlg.querySelector('#verify-btn'), btnF = dlg.querySelector('#find-btn');
    btnV.disabled = btnF.disabled = true;
    try {
      const res = finder
        ? await findRecentPayment()
        : await verifyPayment(dlg.querySelector('#tx-hash').value);
      if (res.ok) {
        setMsg('Payment confirmed — Pro unlocked. Thank you! 🎉', 'ok');
        activate();
        setTimeout(() => dlg.close(), 1600);
      } else {
        setMsg(res.reason, 'err');
      }
    } catch (e) {
      setMsg('Something went wrong verifying — please retry.', 'err');
    } finally {
      btnV.disabled = btnF.disabled = false;
    }
  };
  dlg.querySelector('#verify-btn').addEventListener('click', () => verify(false));
  dlg.querySelector('#find-btn').addEventListener('click', () => verify(true));
  dlg.querySelector('#tx-hash').addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(false); });
}
