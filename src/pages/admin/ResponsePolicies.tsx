import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  deleteResponsePolicy,
  listResponsePolicies,
  saveResponsePolicy,
  type PolicyPriority,
  type ResponsePolicy,
} from '../../api/responsePolicies';
import { AdminLayout } from '../../components/AdminLayout';
import { Button, Card, Chip } from '../../components/ui';
import s from './ResponsePolicies.module.css';

const priorities: PolicyPriority[] = ['WARNING', 'CRITICAL'];
type Draft = {
  policyId: string | null;
  version: number | null;
  policyEnabled: boolean;
  actionEnabled: boolean;
  title: string;
  instructions: string;
  ready: boolean;
  issues: string[];
};
const emptyDraft = (): Draft => ({ policyId: null, version: null, policyEnabled: true, actionEnabled: true, title: '', instructions: '', ready: false, issues: [] });
const fromPolicy = (policy: ResponsePolicy): Draft => ({
  policyId: policy.policyId,
  version: policy.version,
  policyEnabled: policy.isEnabled,
  actionEnabled: policy.action?.isEnabled ?? true,
  title: policy.action?.title ?? '',
  instructions: policy.action?.instructions ?? '',
  ready: policy.readyForAutomaticTask,
  issues: policy.issues,
});
const issueLabels: Record<string, string> = {
  RULE_DISABLED: 'The monitoring rule is disabled.',
  CONFIGURATION_NOT_ACTIVE: 'The monitoring configuration is not active.',
  POLICY_DISABLED: 'This policy is disabled.',
  ACTION_MISSING: 'The automatic task action is missing.',
  ACTION_DISABLED: 'Automatic task creation is disabled.',
  ACTION_AMBIGUOUS: 'Multiple task actions require administrator cleanup.',
  ACTION_NOT_AUTOMATIC: 'The task action is not configured for automatic execution.',
};

function message(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.code === 'POLICY_VERSION_CONFLICT') return 'This policy changed elsewhere. Reload it before saving again.';
    if (reason.status === 403) return 'Only an Administrator can manage response policies.';
    return reason.message;
  }
  return 'Could not complete the request. Check the connection and try again.';
}

export default function ResponsePolicies() {
  const { ruleId = '' } = useParams<{ ruleId: string }>();
  const [drafts, setDrafts] = useState<Record<PolicyPriority, Draft>>({ WARNING: emptyDraft(), CRITICAL: emptyDraft() });
  const [loadedRuleId, setLoadedRuleId] = useState<string | null>(null);
  const [busy, setBusy] = useState<PolicyPriority | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!ruleId) return;
    const controller = new AbortController();
    void listResponsePolicies(ruleId, controller.signal).then((policies) => {
      if (controller.signal.aborted) return;
      const next = { WARNING: emptyDraft(), CRITICAL: emptyDraft() };
      for (const policy of policies) {
        if (policy.eventPriority in next) next[policy.eventPriority] = fromPolicy(policy);
      }
      setDrafts(next);
      setLoadedRuleId(ruleId);
      setError('');
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(message(reason));
        setLoadedRuleId(ruleId);
      }
    });
    return () => controller.abort();
  }, [ruleId, reload]);
  const loading = Boolean(ruleId) && loadedRuleId !== ruleId;

  function retry() {
    setLoadedRuleId(null);
    setError('');
    setReload((value) => value + 1);
  }

  function update(priority: PolicyPriority, change: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [priority]: { ...current[priority], ...change } }));
    setNotice('');
    setError('');
  }

  async function save(priority: PolicyPriority) {
    if (!ruleId || busy) return;
    const draft = drafts[priority];
    setBusy(priority);
    setError('');
    setNotice('');
    try {
      const saved = await saveResponsePolicy(ruleId, priority, {
        isEnabled: draft.policyEnabled,
        expectedVersion: draft.version,
        action: {
          isEnabled: draft.actionEnabled,
          title: draft.title.trim() || null,
          instructions: draft.instructions.trim() || null,
        },
      });
      setDrafts((current) => ({ ...current, [priority]: fromPolicy(saved) }));
      setNotice(`${priority} policy saved.`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(null); }
  }

  async function remove(priority: PolicyPriority) {
    const draft = drafts[priority];
    if (!ruleId || busy || draft.version === null) return;
    setBusy(priority);
    setError('');
    setNotice('');
    try {
      await deleteResponsePolicy(ruleId, priority, draft.version);
      setDrafts((current) => ({ ...current, [priority]: emptyDraft() }));
      setNotice(`${priority} policy removed.`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(null); }
  }

  return <AdminLayout title="Response policies" subtitle="Choose when monitoring events should create operational tasks.">
    <div className={s.page}>
      <Card className={s.intro}>
        <h2>Automatic task response</h2>
        <p>Configure the task Staff receive when this monitoring rule raises a warning or critical event. Existing open events are not backfilled.</p>
        <p className={s.rule}>Rule <code>{ruleId || 'Not selected'}</code></p>
      </Card>

      {!ruleId && <div className={s.feedback} role="alert"><p>Open response policies from a monitoring rule.</p></div>}
      {error && !loading && <div className={s.feedback} role="alert"><p>{error}</p><Button variant="secondary" onClick={retry}>Reload</Button></div>}
      {notice && <p className={s.success} role="status">{notice}</p>}
      {loading ? <p className={s.loading} role="status">Loading response policies…</p> : ruleId && <div className={s.grid}>
        {priorities.map((priority) => {
          const draft = drafts[priority];
          const working = busy === priority;
          return <Card className={s.policy} key={priority}>
            <fieldset aria-label={`${priority} policy`} disabled={Boolean(busy)}>
              <div className={s.heading}>
                <div><legend>{priority === 'WARNING' ? 'Warning response' : 'Critical response'}</legend><p>{priority === 'WARNING' ? 'Early intervention before conditions worsen.' : 'Urgent response at the critical threshold.'}</p></div>
                {draft.policyId === null ? <Chip tone="neutral">Not configured</Chip>
                  : draft.ready ? <Chip tone="success">Ready for automatic task</Chip> : <Chip tone="warning">Needs attention</Chip>}
              </div>

              <label className={s.toggle}><input type="checkbox" checked={draft.policyEnabled} onChange={(event) => update(priority, { policyEnabled: event.target.checked })} />Enable policy</label>
              <label className={s.toggle}><input type="checkbox" checked={draft.actionEnabled} onChange={(event) => update(priority, { actionEnabled: event.target.checked })} />Enable automatic task</label>
              <label>Task title<input maxLength={200} value={draft.title} placeholder={priority === 'WARNING' ? 'Check congestion' : 'Respond to critical congestion'} onChange={(event) => update(priority, { title: event.target.value })} /></label>
              <label>Staff instructions<textarea maxLength={4000} rows={5} value={draft.instructions} placeholder="Describe the safe operational response." onChange={(event) => update(priority, { instructions: event.target.value })} /></label>

              {draft.issues.length > 0 && <ul className={s.issues}>{draft.issues.map((issue) => <li key={issue}>{issueLabels[issue] ?? 'This policy needs administrator review.'}</li>)}</ul>}
              <div className={s.actions}>
                {draft.policyId && <Button variant="dangerGhost" disabled={working} onClick={() => void remove(priority)}>Remove</Button>}
                <Button disabled={working} onClick={() => void save(priority)}>{working ? 'Saving…' : `Save ${priority} policy`}</Button>
              </div>
            </fieldset>
          </Card>;
        })}
      </div>}
    </div>
  </AdminLayout>;
}
