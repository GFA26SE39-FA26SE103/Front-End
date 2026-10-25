import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { approveSwap, getSwapRequest, listSwapRequests, rejectSwap, type SwapRequest, type SwapShift } from '../../api/planning';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Badge, Button, Card, CardHeader } from '../../components/ui';
import { dateTime, longDayLabel, problem, range } from './dates';
import { useLoad } from './useLoad';
import s from './manager.module.css';

const TABS = [
  { key: 'PENDING_MANAGER', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'PENDING_PEER,DECLINED_BY_PEER,CANCELLED,EXPIRED', label: 'Other' },
] as const;

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'primary' | 'neutral' }> = {
  PENDING_PEER: { label: 'Waiting for colleague', tone: 'neutral' },
  PENDING_MANAGER: { label: 'Pending approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  DECLINED_BY_PEER: { label: 'Declined by colleague', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};
const REASONS: Record<string, string> = { PERSONAL: 'Personal matter', HEALTH: 'Health', STUDY: 'Study or exam', OTHER: 'Other' };
const CHECK_NAMES: Record<string, string> = {
  ACTIVE_STAFF: 'Active staff', FUTURE_SHIFT: 'Shift not started', DECISION_DEADLINE: 'Decision deadline', DIFFERENT_SHIFT: 'Different shifts',
  ONE_OPEN_REQUEST: 'One open request', NO_OVERLAP: 'No overlapping shift', AVAILABLE: 'Staff availability', WEEKLY_HOURS: 'Weekly hour limit',
  ZONE_COVERAGE: 'Zone coverage',
};

const statusOf = (r: SwapRequest) => STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
const shiftLine = (shift: SwapShift) => `${longDayLabel(shift.workDate)} · ${shift.shiftName}`;
const zonesOf = (shift: SwapShift) => shift.zones.map((z) => z.zoneName).join(', ') || 'No zone';
const title = (r: SwapRequest) => r.type === 'COVER'
  ? `${r.requester.fullName} asks ${r.target?.fullName ?? 'a colleague'} to cover`
  : `${r.requester.fullName} requests to swap with ${r.target?.fullName ?? 'a colleague'}`;

function ShiftBox({ label, shift, after }: { label: string; shift: SwapShift; after?: boolean }) {
  return (
    <div className={`${s.shiftBox} ${after ? s.after : ''}`}>
      <span className={s.boxLabel}>{label}</span>
      <span className={s.boxMain}>{shiftLine(shift)}</span>
      <span className={s.muted}>{range(shift.startsAt, shift.endsAt)} · {zonesOf(shift)}</span>
    </div>
  );
}

function ShiftPlaceholder({ label, title, detail, after }: { label: string; title: string; detail: string; after?: boolean }) {
  return (
    <div className={`${s.shiftBox} ${after ? s.after : ''}`}>
      <span className={s.boxLabel}>{label}</span>
      <span className={s.boxMain}>{title}</span>
      <span className={s.muted}>{detail}</span>
    </div>
  );
}

export function SwapRequests() {
  const [tab, setTab] = useState<string>(TABS[0].key);
  const [reload, setReload] = useState(0);
  const { data: requests, error } = useLoad(`${tab}|${reload}`, (signal) => listSwapRequests(tab, signal));
  const all = useLoad(String(reload), (signal) => listSwapRequests('ALL', signal)).data ?? [];

  const count = (key: string) => all.filter((r) => key.split(',').includes(r.status)).length;

  return (
    <ManagerLayout title="Shift swap requests" subtitle="Colleague first, then you"
      actions={<Button variant="secondary" onClick={() => setReload((n) => n + 1)}>Refresh</Button>}>
      <div className={s.row}>
        <div className={`${s.page} ${s.grow}`}>
          <Card>
            <div className={s.tabs} role="tablist" aria-label="Request status">
              {TABS.map((t) => (
                <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>
                  {t.label} · {count(t.key)}
                </Button>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title={tab === 'PENDING_MANAGER' ? 'Pending review' : TABS.find((t) => t.key === tab)?.label ?? ''}
              subtitle={tab === 'PENDING_MANAGER'
                ? 'Only requests the colleague has accepted appear here. The schedule changes only after you approve.'
                : 'Decided, declined, cancelled and expired requests stay here for audit.'} />
            {error ? <p className={s.error} role="alert">{error}</p>
              : !requests ? <p className={s.note} role="status">Loading requests…</p>
              : requests.length === 0 ? <p className={s.note}>{tab === 'PENDING_MANAGER' ? 'Nothing to approve right now.' : 'No requests here.'}</p>
              : (
                <div className={s.list}>
                  {requests.map((r) => (
                    <article key={r.swapRequestId} className={s.swapCard} aria-label={title(r)}>
                      <div className={s.swapHead}>
                        <div className={s.grow}>
                          <div className={s.swapTitle}>{title(r)}</div>
                          <div className={s.muted}>
                            {r.targetRespondedAt ? `${r.target?.fullName} accepted ${dateTime(r.targetRespondedAt)}` : `Sent ${dateTime(r.createdAt)}`}
                            {r.reasonCode ? ` · ${REASONS[r.reasonCode] ?? r.reasonCode}` : ''}
                          </div>
                        </div>
                        <Badge tone={statusOf(r).tone}>{statusOf(r).label}</Badge>
                      </div>
                      <div className={s.pair}>
                        <ShiftBox label={`${r.requester.fullName} · current shift`} shift={r.requesterShift} />
                        {r.targetShift
                          ? <ShiftBox label={`${r.target?.fullName} · current shift`} shift={r.targetShift} after />
                          : <div className={`${s.shiftBox} ${s.after}`}><span className={s.boxLabel}>Cover</span><span className={s.boxMain}>{r.target?.fullName}</span><span className={s.muted}>Takes the shift, gives nothing back</span></div>}
                      </div>
                      <div className={s.swapFoot}>
                        <p className={s.muted}>
                          {r.checks.length > 0 && (r.checks.every((c) => c.passed) ? 'All rule checks pass. ' : `${r.checks.filter((c) => !c.passed).length} rule check(s) fail. `)}
                          {r.expiresAt && r.status === 'PENDING_MANAGER' ? `Expires ${dateTime(r.expiresAt)} if not decided.` : ''}
                          {r.decidedAt ? `Decided ${dateTime(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy.fullName}` : ''}.` : ''}
                        </p>
                        <Link to={`/manager/swaps/${r.swapRequestId}`} className={s.back}>{r.canDecide ? 'Review request' : 'View details'}</Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
          </Card>
        </div>
        <div className={s.side}>
          <Card>
            <CardHeader title="All requests" />
            <div>
              {TABS.map((t) => <div key={t.key} className={s.kv}><span className={s.muted}>{t.label}</span><b>{count(t.key)}</b></div>)}
            </div>
          </Card>
          <p className={s.info}>
            <b>Colleague first, then Manager.</b> Staff pick an eligible colleague, the colleague accepts, then you approve.
            A request expires 24 hours before the earliest shift it touches; after that nothing changes.
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}

export function SwapRequestDetail() {
  const { swapRequestId = '' } = useParams();
  const navigate = useNavigate();
  const loaded = useLoad(swapRequestId, (signal) => getSwapRequest(swapRequestId, signal));
  const [decided, setRequest] = useState<SwapRequest | null>(null);
  const request = decided?.swapRequestId === swapRequestId ? decided : loaded.data;
  const loadError = loaded.error;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showChecks, setShowChecks] = useState(false);

  async function decide(approve: boolean) {
    if (!request) return;
    if (!approve && !note.trim()) {
      setError('Write a reason before rejecting. Both Staff members see it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const decided = approve ? await approveSwap(request.swapRequestId, note.trim() || null) : await rejectSwap(request.swapRequestId, note.trim());
      setRequest(decided);
      setNotice(approve ? 'Approved. Both assignments changed and both Staff members were notified.' : 'Rejected. The schedule stays as it is and both Staff members were notified.');
    } catch (reason) {
      setError(problem(reason));
    } finally {
      setBusy(false);
    }
  }

  const r = request;
  const failing = r?.checks.filter((c) => !c.passed) ?? [];
  // One chip per rule; a per-person rule fails if it fails for either Staff member.
  const rules = [...new Set(r?.checks.map((c) => c.code) ?? [])]
    .map((code) => ({ code, passed: (r?.checks ?? []).filter((c) => c.code === code).every((c) => c.passed) }));
  return (
    <ManagerLayout title="Review shift swap" subtitle="Swap requests" actions={<Button variant="secondary" onClick={() => navigate('/manager/swaps')}>Back</Button>}>
      <div className={s.page}>
        {loadError ? <p className={s.error} role="alert">{loadError}</p>
          : !r ? <p className={s.note} role="status">Loading the request…</p>
          : (
            <>
              {notice && <p className={s.success} role="status">{notice}</p>}
              <Card>
                <CardHeader title="Request summary"><Badge tone={statusOf(r).tone}>{statusOf(r).label}</Badge></CardHeader>
                <div className={s.summary}>
                  <div><p>Requested by</p><p>{r.requester.fullName}</p></div>
                  <div><p>Submitted</p><p>{dateTime(r.createdAt)}</p></div>
                  <div><p>Reason</p><p>{r.reasonCode ? REASONS[r.reasonCode] ?? r.reasonCode : '—'}{r.note ? ` · “${r.note}”` : ''}</p></div>
                  <div><p>Decide before</p><p>{r.expiresAt ? dateTime(r.expiresAt) : '—'}</p></div>
                </div>
              </Card>
              <Card>
                <CardHeader title={`${r.type === 'COVER' ? 'Cover' : 'Two-way exchange'} · ${r.targetRespondedAt ? `accepted by ${r.target?.fullName}` : 'not accepted yet'}`}
                  subtitle={r.type === 'COVER'
                    ? `${r.target?.fullName} takes ${r.requester.fullName}'s shift after approval.`
                    : 'Both assignments change together only after approval.'} />
                <div className={s.exchange} aria-label="Assignment comparison">
                  <section className={s.exchangeStage} aria-label="Current assignments">
                    <div className={s.exchangeStageHead}>
                      <span className={s.exchangeStageTitle}>Current assignments</span>
                      <span className={s.muted}>Before manager approval</span>
                    </div>
                    <div className={s.pair}>
                      <ShiftBox label={r.requester.fullName} shift={r.requesterShift} />
                      {r.targetShift
                        ? <ShiftBox label={r.target?.fullName ?? ''} shift={r.targetShift} />
                        : <ShiftPlaceholder label={r.target?.fullName ?? 'Covering staff'} title="No shift exchanged" detail="Will take the requested shift" />}
                    </div>
                  </section>
                  <section className={`${s.exchangeStage} ${s.exchangeStageAfter}`} aria-label="Assignments after approval">
                    <div className={s.exchangeStageHead}>
                      <span className={s.exchangeStageTitle}>After approval</span>
                      <span className={s.muted}>Both changes are applied together</span>
                    </div>
                    <div className={s.pair}>
                      {r.targetShift
                        ? <ShiftBox label={r.requester.fullName} shift={r.targetShift} after />
                        : <ShiftPlaceholder label={r.requester.fullName} title="Shift covered" detail={`${r.target?.fullName ?? 'Covering staff'} takes this assignment`} after />}
                      <ShiftBox label={r.target?.fullName ?? ''} shift={r.requesterShift} after />
                    </div>
                  </section>
                </div>
              </Card>
              <Card>
                <CardHeader title="Decision" subtitle={r.canDecide ? 'Rules are checked again when you approve.' : undefined}>
                  {r.checks.length > 0 && (
                    <Button variant="secondary" aria-expanded={showChecks} onClick={() => setShowChecks((v) => !v)}>
                      {showChecks ? 'Hide rule details' : 'Show rule details'}
                    </Button>
                  )}
                </CardHeader>
                {rules.length > 0 && (
                  <div className={s.ruleChips} aria-label="Business rule checks">
                    {rules.map((rule) => (
                      <span key={rule.code} className={rule.passed ? s.rulePass : s.ruleFail}>{rule.passed ? '✓' : '✕'} {CHECK_NAMES[rule.code] ?? rule.code}</span>
                    ))}
                  </div>
                )}
                {(showChecks || failing.length > 0) && r.checks.length > 0 && (
                  <ul className={s.ruleList}>
                    {/* Per-person rules (overlap, availability, hours) appear once for each Staff member. */}
                    {(showChecks ? r.checks : failing).map((c, i) => (
                      <li key={`${c.code}-${i}`} className={c.passed ? s.pass : s.fail}><b>{CHECK_NAMES[c.code] ?? c.code}:</b> {c.message}</li>
                    ))}
                  </ul>
                )}
                {r.canDecide ? (
                  <form className={s.decision} onSubmit={(e) => { e.preventDefault(); void decide(true); }}>
                    <p className={failing.length === 0 ? s.pass : s.fail}>
                      {failing.length === 0
                        ? `All ${rules.length} rules pass${r.expiresAt ? ` · decide before ${dateTime(r.expiresAt)}` : ''}.`
                        : `${failing.length === 1 ? '1 rule fails' : `${failing.length} rules fail`}. Approving will be refused; reject with a reason.`}
                    </p>
                    <label className={s.srOnly} htmlFor="decision-note">Decision note (required when rejecting)</label>
                    <textarea id="decision-note" className={s.noteInput} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Decision note · required when rejecting" disabled={busy} />
                    {error && <p className={s.error} role="alert">{error}</p>}
                    <div className={s.formActions}>
                      <Button variant="dangerGhost" disabled={busy} onClick={() => void decide(false)}>Reject request</Button>
                      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : r.type === 'COVER' ? 'Approve cover' : 'Approve swap'}</Button>
                    </div>
                  </form>
                ) : (
                  <p className={s.note}>
                    {r.decidedAt ? `Decided ${dateTime(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy.fullName}` : ''}${r.decisionNote ? `: “${r.decisionNote}”` : '.'}`
                      : r.cancelledAt ? `Cancelled ${dateTime(r.cancelledAt)}${r.cancelledBy ? ` by ${r.cancelledBy.fullName}` : ''}${r.cancellationReason ? `: “${r.cancellationReason}”` : '.'}`
                      : r.status === 'PENDING_PEER' ? `Waiting for ${r.target?.fullName ?? 'the colleague'} to answer. You decide after they accept.`
                      : 'This request is closed. Nothing to decide.'}
                  </p>
                )}
              </Card>
            </>
          )}
      </div>
    </ManagerLayout>
  );
}
