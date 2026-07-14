// Serverless ETH checkout — multi-chain. The buyer sends ETH to PAY_ADDRESS
// on Ethereum mainnet OR Base (an Ethereum L2 where fees are ~a cent and
// transfers confirm in seconds), pastes the transaction hash, and we verify
// it directly against public RPC endpoints — no backend, no processor.
// Like the license gating, this is honesty-based commerce: it verifies real
// payments; it does not try to be DRM.
//
// Base uses ETH as its native token and the same address works on both
// chains, so the price logic is identical everywhere.

export const PAY_ADDRESS = '0x78e0fff005f9a6Ca1F5117D1eCe71FE71B41b7aF';
export const PRICE_USD = 29;

// Accept a little drift between quote time and verify time.
const MIN_USD = 25;
// If every price API is down, fall back to a flat ETH minimum.
const FALLBACK_MIN_ETH = 0.012;

export const CHAINS = [
  {
    key: 'base',
    name: 'Base',
    chainId: 8453,
    // ~2s blocks — 5 confirmations ≈ 10 seconds, still effectively instant.
    confirmations: 5,
    rpcs: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org',
    ],
    indexer: `https://base.blockscout.com/api?module=account&action=txlist&sort=desc&address=${PAY_ADDRESS}`,
  },
  {
    key: 'eth',
    name: 'Ethereum',
    chainId: 1,
    confirmations: 2,
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://1rpc.io/eth',
      'https://eth.drpc.org',
    ],
    indexer: `https://eth.blockscout.com/api?module=account&action=txlist&sort=desc&address=${PAY_ADDRESS}`,
  },
];

const USED_KEY = 'moonshot_used_txs';

async function rpcOn(chain, method, params) {
  let lastErr;
  for (const url of chain.rpcs) {
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
  throw lastErr || new Error(`All ${chain.name} RPC endpoints unreachable`);
}

// A tx hash lives on exactly one chain — probe both and use where it's found.
async function lookupTx(hash) {
  const probes = await Promise.all(CHAINS.map(async (chain) => {
    try {
      const tx = await rpcOn(chain, 'eth_getTransactionByHash', [hash]);
      return tx ? { chain, tx } : null;
    } catch { return null; }
  }));
  return probes.find(Boolean) || null;
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

function safeBig(x) { try { return BigInt(x); } catch { return 0n; } }

export async function verifyPayment(txHash) {
  const hash = txHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, reason: 'That doesn’t look like a transaction hash (0x + 64 hex characters).' };
  }
  if (usedTxs().includes(hash)) {
    return { ok: false, reason: 'This transaction was already used to activate Pro on this device.' };
  }

  let found;
  try {
    found = await lookupTx(hash);
  } catch {
    return { ok: false, reason: 'Couldn’t reach the network — check your connection and try again.' };
  }
  if (!found) {
    return { ok: false, reason: 'Transaction not found on Base or Ethereum. It may still be propagating — wait a minute and retry.' };
  }
  const { chain, tx } = found;

  let receipt, latestHex;
  try {
    [receipt, latestHex] = await Promise.all([
      rpcOn(chain, 'eth_getTransactionReceipt', [hash]),
      rpcOn(chain, 'eth_blockNumber', []),
    ]);
  } catch {
    return { ok: false, reason: `Couldn’t reach the ${chain.name} network — check your connection and try again.` };
  }

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
  if (confirmations < chain.confirmations) {
    return { ok: false, reason: `Almost there — ${Math.max(0, confirmations)}/${chain.confirmations} confirmations on ${chain.name}. Retry in ~30 seconds.` };
  }

  const eth = Number(safeBig(tx.value)) / 1e18;
  const price = await getEthUsd();
  const enough = price ? eth * price >= MIN_USD : eth >= FALLBACK_MIN_ETH;
  if (!enough) {
    const paid = price ? `$${(eth * price).toFixed(2)}` : `${eth.toFixed(5)} ETH`;
    return { ok: false, reason: `Payment received (${paid}) is under the $${PRICE_USD} price. Send the difference and verify with the new transaction.` };
  }

  try {
    localStorage.setItem(USED_KEY, JSON.stringify([...usedTxs(), hash]));
  } catch { /* private mode */ }
  return { ok: true, eth, chain: chain.key };
}

// Card buyers pay through a fiat→ETH onramp, which delivers to PAY_ADDRESS
// without telling them a tx hash. Scan recent incoming transfers on BOTH
// chains via the keyless Blockscout indexers and verify the best candidates
// through the exact same on-chain checks.
const LOOKBACK_H = 48;

export async function findRecentPayment() {
  const used = usedTxs();
  const cutoff = Date.now() / 1000 - LOOKBACK_H * 3600;

  const lists = await Promise.allSettled(CHAINS.map(async (chain) => {
    const res = await fetch(chain.indexer);
    const list = (await res.json()).result || [];
    return list.map(t => ({ ...t, _chain: chain.key }));
  }));
  const all = lists.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  if (!all.length && lists.every(r => r.status === 'rejected')) {
    return { ok: false, reason: 'Couldn’t reach the transaction index — paste your transaction hash instead.' };
  }

  const candidates = all.filter(t =>
    (t.to || '').toLowerCase() === PAY_ADDRESS.toLowerCase() &&
    t.isError === '0' &&
    Number(t.timeStamp) >= cutoff &&
    safeBig(t.value) > 0n &&
    !used.includes((t.hash || '').toLowerCase())
  ).sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp)).slice(0, 10);

  if (!candidates.length) {
    return { ok: false, reason: `No new payment found in the last ${LOOKBACK_H}h on Base or Ethereum. Transfers can take a few minutes — try again shortly, or paste the transaction hash.` };
  }
  for (const t of candidates) {
    const v = await verifyPayment(t.hash);
    if (v.ok) return v;
  }
  return { ok: false, reason: 'Found incoming transfers, but none covers the $29 price. If you paid in parts, paste the transaction hashes one by one.' };
}
