// Serverless ETH checkout. The buyer sends ETH to PAY_ADDRESS, pastes the
// transaction hash, and we verify it directly against public Ethereum RPC
// endpoints — no backend, no payment processor. Like the license gating,
// this is honesty-based commerce: it verifies real payments; it does not
// try to be DRM.

export const PAY_ADDRESS = '0x78e0fff005f9a6Ca1F5117D1eCe71FE71B41b7aF';
export const PRICE_USD = 29;

// Accept a little drift between quote time and verify time.
const MIN_USD = 25;
// If every price API is down, fall back to a flat ETH minimum.
const FALLBACK_MIN_ETH = 0.012;
const MIN_CONFIRMATIONS = 2;

const RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://1rpc.io/eth',
  'https://eth.drpc.org',
];

const USED_KEY = 'moonshot_used_txs';

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All RPC endpoints unreachable');
}

export async function getEthUsd() {
  const sources = [
    async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      return (await r.json()).ethereum.usd;
    },
    async () => {
      const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
      return parseFloat((await r.json()).data.amount);
    },
  ];
  for (const src of sources) {
    try {
      const p = await src();
      if (p > 0) return p;
    } catch { /* next source */ }
  }
  return null;
}

// Suggested amount shown in the UI, padded 3% above the exact conversion so
// normal price drift doesn't push a payment under the acceptance floor.
export async function suggestedEth() {
  const price = await getEthUsd();
  if (!price) return null;
  return Math.ceil((PRICE_USD / price) * 1.03 * 1e5) / 1e5;
}

function usedTxs() {
  try { return JSON.parse(localStorage.getItem(USED_KEY)) || []; }
  catch { return []; }
}

export async function verifyPayment(txHash) {
  const hash = txHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, reason: 'That doesn’t look like a transaction hash (0x + 64 hex characters).' };
  }
  if (usedTxs().includes(hash)) {
    return { ok: false, reason: 'This transaction was already used to activate Pro on this device.' };
  }

  let tx, receipt, latestHex;
  try {
    [tx, receipt, latestHex] = await Promise.all([
      rpc('eth_getTransactionByHash', [hash]),
      rpc('eth_getTransactionReceipt', [hash]),
      rpc('eth_blockNumber', []),
    ]);
  } catch {
    return { ok: false, reason: 'Couldn’t reach the Ethereum network — check your connection and try again.' };
  }

  if (!tx) return { ok: false, reason: 'Transaction not found. It may still be propagating — wait a minute and retry.' };
  if (!receipt || receipt.blockNumber == null) {
    return { ok: false, reason: 'Transaction is still pending. Wait for it to confirm, then retry.' };
  }
  if (receipt.status !== '0x1') {
    return { ok: false, reason: 'That transaction failed on-chain.' };
  }
  if ((tx.to || '').toLowerCase() !== PAY_ADDRESS.toLowerCase()) {
    return { ok: false, reason: 'That transaction wasn’t sent to the Moonshot address.' };
  }

  const confirmations = parseInt(latestHex, 16) - parseInt(receipt.blockNumber, 16);
  if (confirmations < MIN_CONFIRMATIONS) {
    return { ok: false, reason: `Almost there — ${confirmations}/${MIN_CONFIRMATIONS} confirmations. Retry in ~30 seconds.` };
  }

  const eth = Number(BigInt(tx.value)) / 1e18;
  const price = await getEthUsd();
  const enough = price ? eth * price >= MIN_USD : eth >= FALLBACK_MIN_ETH;
  if (!enough) {
    const paid = price ? `$${(eth * price).toFixed(2)}` : `${eth.toFixed(5)} ETH`;
    return { ok: false, reason: `Payment received (${paid}) is under the $${PRICE_USD} price. Send the difference and verify with the new transaction.` };
  }

  try {
    localStorage.setItem(USED_KEY, JSON.stringify([...usedTxs(), hash]));
  } catch { /* private mode */ }
  return { ok: true, eth };
}

// Card buyers pay through a fiat→ETH onramp, which delivers to PAY_ADDRESS
// without telling them a tx hash. Scan recent incoming transfers via the
// keyless Blockscout indexer and verify the best candidate through the
// exact same on-chain checks.
const INDEXER = `https://eth.blockscout.com/api?module=account&action=txlist&sort=desc&address=${PAY_ADDRESS}`;
const LOOKBACK_H = 48;

export async function findRecentPayment() {
  let list;
  try {
    const res = await fetch(INDEXER);
    list = (await res.json()).result || [];
  } catch {
    return { ok: false, reason: 'Couldn’t reach the transaction index — paste your transaction hash instead.' };
  }
  const used = usedTxs();
  const cutoff = Date.now() / 1000 - LOOKBACK_H * 3600;
  const candidates = list.filter(t =>
    (t.to || '').toLowerCase() === PAY_ADDRESS.toLowerCase() &&
    t.isError === '0' &&
    Number(t.timeStamp) >= cutoff &&
    BigInt(t.value) > 0n &&
    !used.includes(t.hash.toLowerCase())
  ).slice(0, 10);

  if (!candidates.length) {
    return { ok: false, reason: `No new payment found in the last ${LOOKBACK_H}h. Transfers can take a few minutes — try again shortly, or paste the transaction hash.` };
  }
  for (const t of candidates) {
    const v = await verifyPayment(t.hash);
    if (v.ok) return v;
  }
  return { ok: false, reason: 'Found incoming transfers, but none covers the $29 price. If you paid in parts, paste the transaction hashes one by one.' };
}
