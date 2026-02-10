import { useState, useCallback, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { LayerCoverSDK } from '@layercover/sdk';
import type { CoveragePool, FixedRateQuote, UserPolicy } from '@layercover/sdk';

// ============================================================================
//  Types
// ============================================================================

type LogLevel = 'info' | 'success' | 'error' | 'msg';

interface LogEntry {
    time: string;
    msg: string;
    level: LogLevel;
}

type Step = 'connect' | 'pools' | 'quotes' | 'purchase' | 'policies';

// ============================================================================
//  Helpers
// ============================================================================

const fmt = (v: string | bigint, decimals = 6) => {
    const n = Number(BigInt(v)) / 10 ** decimals;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ts = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

// ============================================================================
//  App
// ============================================================================

export default function App() {
    // ── State ────────────────────────────────────────────────────────────────
    const [sdk, setSdk] = useState<LayerCoverSDK | null>(null);
    const [address, setAddress] = useState('');
    const [step, setStep] = useState<Step>('connect');
    const [log, setLog] = useState<LogEntry[]>([]);

    // Pool discovery
    const [pools, setPools] = useState<CoveragePool[]>([]);
    const [selectedPool, setSelectedPool] = useState<CoveragePool | null>(null);
    const [loadingPools, setLoadingPools] = useState(false);

    // Quotes
    const [quotes, setQuotes] = useState<FixedRateQuote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<FixedRateQuote | null>(null);
    const [loadingQuotes, setLoadingQuotes] = useState(false);
    const unwatchRef = useRef<(() => void) | null>(null);

    // Purchase
    const [coverAmount, setCoverAmount] = useState('1000');
    const [durationWeeks, setDurationWeeks] = useState('4');
    const [purchasing, setPurchasing] = useState(false);

    // Policies
    const [policies, setPolicies] = useState<UserPolicy[]>([]);
    const [loadingPolicies, setLoadingPolicies] = useState(false);

    // ── Logging ──────────────────────────────────────────────────────────────
    const addLog = useCallback((msg: string, level: LogLevel = 'msg') => {
        setLog(prev => [...prev, { time: ts(), msg, level }]);
    }, []);

    const logRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }, [log]);

    // ── Connect Wallet ───────────────────────────────────────────────────────
    const connectWallet = useCallback(async () => {
        try {
            if (!(window as any).ethereum) {
                addLog('No wallet detected — install MetaMask', 'error');
                return;
            }
            addLog('Requesting wallet connection…', 'info');
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();
            const addr = await signer.getAddress();
            setAddress(addr);
            addLog(`Connected: ${shortAddr(addr)}`, 'success');

            addLog('Initializing SDK via auto-config…', 'info');
            const apiBase = (import.meta as any).env?.VITE_API_URL || window.location.origin;
            const instance = await LayerCoverSDK.create(signer as any, { apiBaseUrl: apiBase });
            setSdk(instance);
            addLog('SDK ready ✓', 'success');
            setStep('pools');
        } catch (err: any) {
            addLog(`Connection failed: ${err.message}`, 'error');
        }
    }, [addLog]);

    // ── Discover Pools ───────────────────────────────────────────────────────
    const discoverPools = useCallback(async () => {
        if (!sdk) return;
        setLoadingPools(true);
        addLog('Fetching available coverage pools…', 'info');
        try {
            const result = await sdk.listPools();
            setPools(result);
            addLog(`Found ${result.length} pools`, 'success');
            setStep('pools');
        } catch (err: any) {
            addLog(`Pool discovery failed: ${err.message}`, 'error');
        } finally {
            setLoadingPools(false);
        }
    }, [sdk, addLog]);

    // Auto-discover on SDK ready
    useEffect(() => {
        if (sdk && pools.length === 0) discoverPools();
    }, [sdk, pools.length, discoverPools]);

    // ── Watch Quotes ─────────────────────────────────────────────────────────
    const watchQuotes = useCallback((pool: CoveragePool) => {
        if (!sdk) return;
        // Cleanup previous watcher
        unwatchRef.current?.();

        setSelectedPool(pool);
        setQuotes([]);
        setSelectedQuote(null);
        setLoadingQuotes(true);
        addLog(`Subscribing to quotes for Pool #${pool.poolId} (${pool.name})…`, 'info');
        setStep('quotes');

        const unwatch = sdk.watchQuotes(pool.poolId, (newQuotes) => {
            setQuotes(newQuotes);
            setLoadingQuotes(false);
            if (newQuotes.length > 0) {
                addLog(`Received ${newQuotes.length} live quote(s) — cheapest: ${(newQuotes[0].premiumRateBps / 100).toFixed(1)}%`, 'success');
            }
        }, { refreshIntervalMs: 15_000 });

        unwatchRef.current = unwatch;
    }, [sdk, addLog]);

    // Cleanup on unmount
    useEffect(() => () => unwatchRef.current?.(), []);

    // ── Purchase ─────────────────────────────────────────────────────────────
    const purchase = useCallback(async () => {
        if (!sdk || !selectedQuote || !selectedPool) {
            console.error('[Demo] Purchase guard failed:', { sdk: !!sdk, selectedQuote: !!selectedQuote, selectedPool: !!selectedPool });
            return;
        }
        setPurchasing(true);
        setStep('purchase');
        const amountRaw = ethers.parseUnits(coverAmount, 6); // USDC 6 decimals
        const weeks = parseInt(durationWeeks);

        addLog(`Purchasing ${coverAmount} USDC coverage for ${weeks} weeks @ ${(selectedQuote.premiumRateBps / 100).toFixed(1)}%…`, 'info');

        try {
            const result = await sdk.purchase(selectedPool.poolId, amountRaw, weeks);
            addLog(`✅ Policy purchased! TX: ${shortAddr(result.txHash)}${result.policyId ? ` — Policy #${result.policyId}` : ''}`, 'success');
            setStep('policies');
        } catch (err: any) {
            console.error('[Demo] Purchase error:', err);
            const msg = LayerCoverSDK.getHumanError(err);
            addLog(`Purchase failed: ${msg}`, 'error');
        } finally {
            setPurchasing(false);
        }
    }, [sdk, selectedQuote, selectedPool, coverAmount, durationWeeks, addLog]);

    // ── Load Policies ────────────────────────────────────────────────────────
    const loadPolicies = useCallback(async () => {
        if (!sdk || !address) return;
        setLoadingPolicies(true);
        addLog(`Fetching policies for ${shortAddr(address)}…`, 'info');
        try {
            const result = await sdk.getMyPolicies(address);
            setPolicies(result);
            addLog(`Found ${result.length} policy(ies)`, 'success');
            setStep('policies');
        } catch (err: any) {
            addLog(`Policy fetch failed: ${err.message}`, 'error');
        } finally {
            setLoadingPolicies(false);
        }
    }, [sdk, address, addLog]);

    // ── Cancel Policy ────────────────────────────────────────────────────────
    const cancelPolicy = useCallback(async (policyId: number) => {
        if (!sdk) return;
        addLog(`Preparing cancel TX for policy #${policyId}…`, 'info');
        try {
            const tx = await sdk.prepareCancelCoverTx(policyId);
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();
            const receipt = await signer.sendTransaction(tx);
            addLog(`Cancel TX sent: ${shortAddr(receipt.hash)}`, 'info');
            await receipt.wait();
            addLog(`✅ Policy #${policyId} cancelled`, 'success');
            loadPolicies(); // Refresh
        } catch (err: any) {
            const msg = LayerCoverSDK.getHumanError(err);
            addLog(`Cancel failed: ${msg}`, 'error');
        }
    }, [sdk, addLog, loadPolicies]);

    // ── Step state ───────────────────────────────────────────────────────────
    const steps: { key: Step; label: string }[] = [
        { key: 'connect', label: 'Connect' },
        { key: 'pools', label: 'Pools' },
        { key: 'quotes', label: 'Quotes' },
        { key: 'purchase', label: 'Purchase' },
        { key: 'policies', label: 'Policies' },
    ];

    const stepOrder = steps.map(s => s.key);
    const currentIdx = stepOrder.indexOf(step);

    // ========================================================================
    //  Render
    // ========================================================================

    return (
        <div className="app">
            {/* Header */}
            <div className="header">
                <h1>LayerCover SDK Demo</h1>
                <p>End-to-end integration example — connect wallet → discover pools → get quotes → purchase → manage policies</p>
            </div>

            {/* Step indicator */}
            <div className="steps">
                {steps.map((s, i) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className={`step ${i === currentIdx ? 'active' : i < currentIdx ? 'done' : ''}`}>
                            <span className="step-num">{i < currentIdx ? '✓' : i + 1}</span>
                            <span>{s.label}</span>
                        </div>
                        {i < steps.length - 1 && <span className="step-connector" />}
                    </div>
                ))}
            </div>

            <div className="grid">
                {/* ── Wallet Connection ────────────────────────────────────────── */}
                <div className="card">
                    <h2><span className="icon">🔗</span> Wallet</h2>
                    {address ? (
                        <div className="connection-status connected">
                            <span className="dot" />
                            <span>{shortAddr(address)}</span>
                        </div>
                    ) : (
                        <div className="connection-status disconnected">
                            <span className="dot" />
                            <span>Not connected</span>
                        </div>
                    )}
                    <button className="btn btn-primary" onClick={connectWallet} disabled={!!sdk}>
                        {sdk ? '✓ Connected' : 'Connect Wallet'}
                    </button>
                </div>

                {/* ── Pool Discovery ──────────────────────────────────────────── */}
                <div className="card">
                    <h2><span className="icon">🏊</span> Coverage Pools</h2>
                    {!sdk ? (
                        <div className="empty-state"><div className="emoji">🔌</div>Connect wallet first</div>
                    ) : loadingPools ? (
                        <div className="empty-state"><span className="loading-spinner" /> Discovering pools…</div>
                    ) : pools.length === 0 ? (
                        <div className="empty-state"><div className="emoji">📭</div>No pools found</div>
                    ) : (
                        <div className="fade-in">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Pool</th>
                                        <th>Category</th>
                                        <th>Rating</th>
                                        <th>Best Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pools.slice(0, 8).map(p => (
                                        <tr
                                            key={p.poolId}
                                            className={`pool-row ${selectedPool?.poolId === p.poolId ? 'selected' : ''}`}
                                            onClick={() => watchQuotes(p)}
                                        >
                                            <td>{p.name}</td>
                                            <td>{p.category}</td>
                                            <td>{p.riskRating}</td>
                                            <td>{p.bestRateBps ? `${(p.bestRateBps / 100).toFixed(1)}%` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {pools.length > 8 && (
                                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    + {pools.length - 8} more pools
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Live Quotes ─────────────────────────────────────────────── */}
                <div className="card">
                    <h2><span className="icon">📊</span> Live Quotes {selectedPool && `— ${selectedPool.name}`}</h2>
                    {!selectedPool ? (
                        <div className="empty-state"><div className="emoji">👈</div>Select a pool to see quotes</div>
                    ) : loadingQuotes ? (
                        <div className="empty-state"><span className="loading-spinner" /> Fetching quotes…</div>
                    ) : quotes.length === 0 ? (
                        <div className="empty-state"><div className="emoji">📭</div>No active quotes for this pool</div>
                    ) : (
                        <div className="fade-in">
                            {quotes.slice(0, 5).map(q => (
                                <div
                                    key={q.id}
                                    className={`quote-card ${selectedQuote?.id === q.id ? 'selected' : ''}`}
                                    onClick={() => { setSelectedQuote(q); setStep('purchase'); }}
                                >
                                    <div className="quote-info">
                                        <span className="quote-rate">{(q.premiumRateBps / 100).toFixed(1)}% APR</span>
                                        <span className="quote-meta">
                                            {shortAddr(q.syndicateAddress)} · {q.minDurationWeeks}–{q.maxDurationWeeks}w · up to {fmt(q.coverageAmount)}
                                        </span>
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedQuote(q); setStep('purchase'); }}>
                                        Select
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Purchase Form ───────────────────────────────────────────── */}
                <div className="card">
                    <h2><span className="icon">🛒</span> Purchase Coverage</h2>
                    {!selectedQuote ? (
                        <div className="empty-state"><div className="emoji">👈</div>Select a quote first</div>
                    ) : (
                        <div className="fade-in">
                            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                                <strong>Selected:</strong> {(selectedQuote.premiumRateBps / 100).toFixed(1)}% from {shortAddr(selectedQuote.syndicateAddress)}
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Coverage Amount (USDC)</label>
                                    <input type="number" value={coverAmount} onChange={e => setCoverAmount(e.target.value)} min="1" />
                                </div>
                                <div className="form-group">
                                    <label>Duration (weeks)</label>
                                    <input type="number" value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} min={selectedQuote.minDurationWeeks} max={selectedQuote.maxDurationWeeks} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                <div style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>Est. Premium</div>
                                    <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>
                                        {((parseFloat(coverAmount) * selectedQuote.premiumRateBps / 10000) * (parseInt(durationWeeks) / 52)).toFixed(2)} USDC
                                    </div>
                                </div>
                                <div style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>Coverage</div>
                                    <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{parseFloat(coverAmount).toLocaleString()} USDC</div>
                                </div>
                            </div>

                            <button className="btn btn-primary" onClick={purchase} disabled={purchasing} style={{ width: '100%' }}>
                                {purchasing ? <><span className="loading-spinner" /> Processing…</> : '🛡️ Purchase Coverage'}
                            </button>
                        </div>
                    )}
                </div>

                {/* ── My Policies ─────────────────────────────────────────────── */}
                <div className="card card-full">
                    <h2>
                        <span className="icon">📋</span> My Policies
                        <span style={{ marginLeft: 'auto' }}>
                            <button className="btn btn-secondary btn-sm" onClick={loadPolicies} disabled={!sdk || loadingPolicies}>
                                {loadingPolicies ? <span className="loading-spinner" /> : '↻'} Refresh
                            </button>
                        </span>
                    </h2>
                    {!sdk ? (
                        <div className="empty-state"><div className="emoji">🔌</div>Connect wallet to view policies</div>
                    ) : policies.length === 0 && !loadingPolicies ? (
                        <div className="empty-state">
                            <div className="emoji">📭</div>
                            No policies found
                            <br />
                            <button className="btn btn-secondary btn-sm" onClick={loadPolicies} style={{ marginTop: '0.75rem' }}>
                                Load Policies
                            </button>
                        </div>
                    ) : (
                        <div className="fade-in">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Pool</th>
                                        <th>Coverage</th>
                                        <th>Rate</th>
                                        <th>Expires</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {policies.map(p => (
                                        <tr key={p.policyId}>
                                            <td>#{p.policyId}</td>
                                            <td>Pool #{p.poolId}</td>
                                            <td>{fmt(p.coverage)}</td>
                                            <td>{(p.fixedRateBps / 100).toFixed(1)}%</td>
                                            <td>{new Date(p.endTimestamp * 1000).toLocaleDateString()}</td>
                                            <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                                            <td>
                                                {p.isActive && (
                                                    <button className="btn btn-danger btn-sm" onClick={() => cancelPolicy(p.policyId)}>
                                                        Cancel
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Activity Log ────────────────────────────────────────────── */}
                <div className="card card-full">
                    <h2>
                        <span className="icon">🖥️</span> Activity Log
                        <span style={{ marginLeft: 'auto' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setLog([])}>Clear</button>
                        </span>
                    </h2>
                    <div className="log" ref={logRef}>
                        {log.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)' }}>Waiting for actions…</span>
                        ) : (
                            log.map((entry, i) => (
                                <div key={i} className="log-entry">
                                    <span className="log-time">{entry.time}</span>
                                    <span className={`log-${entry.level}`}>{entry.msg}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
