import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { approveSwap, getSwapRequest, listSwapRequests, rejectSwap, type SwapRequest, type SwapShift } from '../../api/planning';
import { Icon } from '../../components/Icon';
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

function ShiftValue({ shift }: { shift: SwapShift }) {
  return (
    <div className={s.shiftValue}>
      <strong>{shiftLine(shift)}</strong>
      <span>{range(shift.startsAt, shift.endsAt)} · {zonesOf(shift)}</span>
    </div>
  );
}

function EmptyShiftValue({ title, detail }: { title: string; detail: string }) {
  return <div className={s.shiftValue}><strong>{title}</strong><span>{detail}</span></div>;
}

export function SwapRequests() {
  const [tab, setTab] = useState<string>(TABS[0].key);
  const [reload, setReload] = useState(0);
  const { data: requests, error } = useLoad(`${tab}|${reload}`, (signal) => listSwapRequests(tab, signal));
  const all = useLoad(String(reload), (signal) => listSwapRequests('ALL', signal)).data ?? [];

  const count = (key: string) => all.filter((r) => key.split(',').includes(r.status)).length;

  return (
    <ManagerLayout title="Shift swap requests" subtitle="Review and decide accepted requests"
      actions={<Button variant="secondary" onClick={() => setReload((n) => n + 1)}>Refresh</Button>}>
      <div className={s.page}>
          <div className={s.tabsBar}>
            <div className={s.tabs} role="tablist" aria-label="Request status">
              {TABS.map((t) => (
                <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>
                  {t.label} · {count(t.key)}
                </Button>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader title={tab === 'PENDING_MANAGER' ? 'Pending review' : TABS.find((t) => t.key === tab)?.label ?? ''}
              subtitle={tab === 'PENDING_MANAGER'
                ? undefined
                : 'Decided and closed requests'} />
            {error ? <p className={s.error} role="alert">{error}</p>
              : !requests ? <p className={s.note} role="status">Loading requests…</p>
              : requests.length === 0 ? <p className={s.note}>{tab === 'PENDING_MANAGER' ? 'Nothing to approve right now.' : 'No requests here.'}</p>
              : (
                <div className={s.list}>
                  {requests.map((r) => (
                    <article key={r.swapRequestId} className={s.swapCard} aria-label={title(r)}>
                      <div className={s.swapHead}>
                        <div className={s.grow}>
                          <div className={s.swapTitle}>{r.requester.fullName} / {r.target?.fullName ?? 'Unassigned colleague'}</div>
                          <div className={s.muted}>
                            {r.targetRespondedAt ? `Accepted ${dateTime(r.targetRespondedAt)}` : `Sent ${dateTime(r.createdAt)}`}
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
                          {r.checks.length > 0 && (r.checks.every((c) => c.passed) ? `${new Set(r.checks.map((c) => c.code)).size}/${new Set(r.checks.map((c) => c.code)).size} checks passed` : `${r.checks.filter((c) => !c.passed).length} check(s) need attention`)}
                          {r.expiresAt && r.status === 'PENDING_MANAGER' ? ` · Decide by ${dateTime(r.expiresAt)}` : ''}
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
              <Card className={s.reviewCard}>
                <div className={s.reviewHead}>
                  <div>
                    <h2 className={s.reviewTitle}>{r.requester.fullName} ↔ {r.target?.fullName ?? 'Covering staff'}</h2>
                    <p className={s.reviewMeta}>
                      {r.reasonCode ? REASONS[r.reasonCode] ?? r.reasonCode : 'No reason'} · Submitted {dateTime(r.createdAt)}
                      {r.note ? ` · “${r.note}”` : ''}
                    </p>
                  </div>
                  <div className={s.reviewStatus}>
                    <Badge tone={statusOf(r).tone}>{statusOf(r).label}</Badge>
                    <div className={s.deadline}><span>Decide before</span><strong>{r.expiresAt ? dateTime(r.expiresAt) : '—'}</strong></div>
                  </div>
                </div>
                <div className={s.comparisonWrap}>
                  <table className={s.comparison} aria-label="Assignment comparison">
                    <thead><tr><th>Staff</th><th>Current shift</th><th>After approval</th></tr></thead>
                    <tbody>
                      <tr>
                        <th scope="row">{r.requester.fullName}</th>
                        <td><ShiftValue shift={r.requesterShift} /></td>
                        <td className={s.afterCell}>{r.targetShift
                          ? <ShiftValue shift={r.targetShift} />
                          : <EmptyShiftValue title="Shift covered" detail={`${r.target?.fullName ?? 'Covering staff'} takes this assignment`} />}</td>
                      </tr>
                      <tr>
                        <th scope="row">{r.target?.fullName ?? 'Covering staff'}</th>
                        <td>{r.targetShift
                          ? <ShiftValue shift={r.targetShift} />
                          : <EmptyShiftValue title="No exchanged shift" detail="Cover request" />}</td>
                        <td className={s.afterCell}><ShiftValue shift={r.requesterShift} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {rules.length > 0 && (
                  <div className={`${s.ruleSummary} ${failing.length > 0 ? s.ruleSummaryFail : ''}`} aria-label="Business rule checks">
                    {failing.length === 0 && <Icon name="check-primary" size={18} />}
                    <strong>{failing.length > 0
                      ? `${failing.length} check${failing.length === 1 ? ' needs' : 's need'} attention`
                      : `${rules.length}/${rules.length} checks passed`}</strong>
                    <button type="button" className={s.ruleToggle} aria-expanded={showChecks} onClick={() => setShowChecks((v) => !v)}>
                      {showChecks ? 'Hide checks' : 'View checks'}
                    </button>
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
