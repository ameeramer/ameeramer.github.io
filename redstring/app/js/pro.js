// Pro state + unlock modal. Honesty-based local flag (same model as the rest
// of the studio); payment verified on-chain by cryptopay.js.

import { PAY_ADDRESS, PRICE_USD, verifyPayment, findRecentPayment, suggestedEth } from './cryptopay.js';

const PRO_KEY = 'redstring_pro';
let pro = false;
const listeners = [];

export function isPro() { return pro; }
export function onProChange(fn) { listeners.push(fn); fn(pro); }
function emit() { for (const fn of listeners) try { fn(pro); } catch {} }

export function initPro() {
  try { pro = localStorage.getItem(PRO_KEY) === '1'; } catch {}
  buildModal();
  emit();
}
function activate() {
  pro = true;
  try { localStorage.setItem(PRO_KEY, '1'); } catch {}
  emit();
}

const PERKS = [
  'Unlimited items on the board (free: 12)',
  'Five yarn colors — red, blue, gold, black, white',
  'Export the whole board as a PNG',
  'Support a solo, privacy-first tool — no ads, no account, nothing uploaded',
];

export function openProModal() { document.getElementById('pro-modal').showModal(); }

function buildModal() {
  const dlg = document.getElementById('pro-modal');
  dlg.innerHTML = `
    <div class="modal-body">
      <button class="modal-close" id="pro-x" aria-label="Close">✕</button>
      <div class="pro-head">
        <span class="pro-mark">◉</span>
        <div>
          <h3 class="pro-title">Redstring Pro</h3>
          <div class="pro-sub">One payment · $${PRICE_USD} · yours forever</div>
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

      <p class="pay-step">Then paste your <strong>transaction hash</strong> — or let Redstring find it:</p>
      <div class="pay-row">
        <input class="text-input" id="tx-hash" placeholder="0x… transaction hash" autocomplete="off" spellcheck="false">
        <button class="btn primary" id="verify-btn" type="button">Verify</button>
      </div>
      <button class="btn ghost wide" id="find-btn" type="button">Find my payment automatically</button>
      <p class="pay-msg" id="pay-msg"></p>

      <div class="pro-divider">No crypto? Pay by card</div>
      <p class="pay-step">Buy ETH with a card, delivered straight to the address above, then verify:</p>
      <div class="card-links">
        <a class="btn wide" id="onramp-1" target="_blank" rel="noopener">Guardarian ↗</a>
        <a class="btn wide" id="onramp-2" target="_blank" rel="noopener">SimpleSwap ↗</a>
      </div>
      <p class="pay-foot">Pro is stored on this device. Reinstalled? Re-verify the same transaction — it still counts.</p>
    </div>`;

  dlg.querySelector('#pro-x').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  const msg = dlg.querySelector('#pay-msg');
  const setMsg = (t, cls = '') => { msg.textContent = t; msg.className = 'pay-msg ' + cls; };

  dlg.querySelector('#copy-addr').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(PAY_ADDRESS); setMsg('Address copied.', 'ok'); } catch {}
  });

  suggestedEth().then(eth => {
    const wei = eth ? BigInt(Math.round(eth * 1e18)).toString() : '';
    if (eth) dlg.querySelector('#eth-amt').textContent = `~${eth} ETH ($${PRICE_USD})`;
    dlg.querySelector('#wallet-deeplink').href = `ethereum:${PAY_ADDRESS}@8453${wei ? '?value=' + wei : ''}`;
    dlg.querySelector('#onramp-1').href =
      `https://guardarian.com/buy-eth?crypto_currency=ETH&fiat_currency=USD&fiat_amount=${PRICE_USD + 12}&payout_address=${PAY_ADDRESS}`;
    dlg.querySelector('#onramp-2').href = `https://simpleswap.io/?to=eth&address=${PAY_ADDRESS}`;
  }).catch(() => {});

  const verify = async finder => {
    setMsg('Checking the blockchain…');
    const bV = dlg.querySelector('#verify-btn'), bF = dlg.querySelector('#find-btn');
    bV.disabled = bF.disabled = true;
    try {
      const res = finder ? await findRecentPayment() : await verifyPayment(dlg.querySelector('#tx-hash').value);
      if (res.ok) {
        setMsg('Payment confirmed — Pro unlocked. Case closed. 🎉', 'ok');
        activate();
        setTimeout(() => dlg.close(), 1500);
      } else setMsg(res.reason, 'err');
    } catch { setMsg('Something went wrong verifying — please retry.', 'err'); }
    finally { bV.disabled = bF.disabled = false; }
  };
  dlg.querySelector('#verify-btn').addEventListener('click', () => verify(false));
  dlg.querySelector('#find-btn').addEventListener('click', () => verify(true));
  dlg.querySelector('#tx-hash').addEventListener('keydown', e => { if (e.key === 'Enter') verify(false); });
}
