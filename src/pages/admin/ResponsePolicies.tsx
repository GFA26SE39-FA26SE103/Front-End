import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listTaskTypes, type TaskType } from '../../api/taskTypes';
import {
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
  taskTypeCode: string;
  title: string;
  instructions: string;
  targetRoleCode: 'OPERATOR' | 'MANAGER';
  ready: boolean;
  issues: string[];
};
const emptyDraft = (): Draft => ({ policyId: null, version: null, policyEnabled: true, actionEnabled: true, taskTypeCode: '', title: '', instructions: '', targetRoleCode: 'OPERATOR', ready: false, issues: [] });
const fromPolicy = (policy: ResponsePolicy): Draft => ({
  policyId: policy.policyId,
  version: policy.version,
  policyEnabled: policy.isEnabled,
  actionEnabled: policy.action?.isEnabled ?? true,
  taskTypeCode: policy.action?.taskTypeCode ?? '',
  title: policy.action?.title ?? '',
  instructions: policy.action?.instructions ?? '',
  targetRoleCode: policy.action?.targetRoleCode === 'MANAGER' ? 'MANAGER' : 'OPERATOR',
  ready: policy.readyForAutomaticTask,
  issues: policy.issues,
});
const issueLabels: Record<string, string> = {
  RULE_DISABLED: 'The monitoring rule is disabled.',
  CONFIGURATION_NOT_ACTIVE: 'The monitoring configuration is not active.',
  POLICY_DISABLED: 'This policy is disabled.',
  ACTION_MISSING: 'The response action is missing.',
  ACTION_DISABLED: 'This response action is disabled.',
  ACTION_AMBIGUOUS: 'Multiple task actions require administrator cleanup.',
  ACTION_NOT_AUTOMATIC: 'The response action is not configured for automatic execution.',
  ACTION_TYPE_INVALID: 'The action does not match this alert level.',
  SLA_POLICY_INVALID: 'The shared SLA policy is invalid.',
  TASK_TYPE_MISSING: 'Critical task dispatch requires a task type code.',
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
  const location = useLocation();
  const context = location.state as { returnTo?: string; eventName?: string; zoneName?: string } | null;
  const returnTo = context?.returnTo ?? '/admin/ai-config';
  const [drafts, setDrafts] = useState<Record<PolicyPriority, Draft>>({ WARNING: emptyDraft(), CRITICAL: emptyDraft() });
  const [loadedRuleId, setLoadedRuleId] = useState<string | null>(null);
  const [busy, setBusy] = useState<PolicyPriority | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [hasPolicy, setHasPolicy] = useState(false);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [taskTypesLoading, setTaskTypesLoading] = useState(true);
  const [taskTypesError, setTaskTypesError] = useState('');
  const [catalogReload, setCatalogReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void listTaskTypes(controller.signal).then(types => {
      if (controller.signal.aborted) return;
      setTaskTypes(types);
      setTaskTypesError('');
      setTaskTypesLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setTaskTypesError(message(reason));
      setTaskTypesLoading(false);
    });
    return () => controller.abort();
  }, [catalogReload]);

  useEffect(() => {
    if (!ruleId) return;
    const controller = new AbortController();
    void listResponsePolicies(ruleId, controller.signal).then((policies) => {
      if (controller.signal.aborted) return;
      const next = { WARNING: emptyDraft(), CRITICAL: emptyDraft() };
      for (const policy of policies) {
        if (policy.eventPriority in next) next[policy.eventPriority] = fromPolicy(policy);
      }
      // A missing action still belongs to the existing shared SLA policy.
      if (policies.length > 0) for (const level of priorities) next[level].version = policies[0].version;
      setDrafts(next);
      setHasPolicy(policies.length > 0);
      setNeedsReload(false);
      setLoadedRuleId(ruleId);
      setLoadError('');
      setError('');
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setLoadError(message(reason));
        setError('');
        setLoadedRuleId(ruleId);
      }
    });
    return () => controller.abort();
  }, [ruleId, reload]);
  const loading = Boolean(ruleId) && loadedRuleId !== ruleId;
  const configurationInactive = priorities.some(priority => drafts[priority].issues.includes('CONFIGURATION_NOT_ACTIVE'));

  function retry() {
    setLoadedRuleId(null);
    setLoadError('');
    setError('');
    setReload((value) => value + 1);
  }

  function update(priority: PolicyPriority, change: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [priority]: { ...current[priority], ...change } }));
    setNotice('');
    setError('');
  }

  async function save(priority: PolicyPriority) {
    if (!ruleId || busy || needsReload || !hasPolicy) return;
    const draft = drafts[priority];
    if (priority === 'CRITICAL' && draft.policyEnabled && (taskTypesLoading || taskTypesError || !taskTypes.some(type => type.code === draft.taskTypeCode))) {
      setError('Select an available task type before enabling critical task dispatch.');
      return;
    }
    setBusy(priority);
    setError('');
    setNotice('');
    try {
      const saved = await saveResponsePolicy(ruleId, priority, {
        isEnabled: draft.policyEnabled,
        expectedVersion: draft.version,
        action: {
          isEnabled: draft.policyEnabled,
          taskTypeCode: priority === 'CRITICAL' ? draft.taskTypeCode.trim().toUpperCase() || null : null,
          title: priority === 'CRITICAL' ? draft.title.trim() || null : null,
          instructions: priority === 'CRITICAL' ? draft.instructions.trim() || null : null,
          targetRoleCode: priority === 'WARNING' ? draft.targetRoleCode : null,
        },
      });
      // Alert actions share the EventType policy version. Preserve the other draft while
      // advancing its version so a subsequent save does not conflict with this write.
      setDrafts((current) => ({
        WARNING: { ...current.WARNING, version: saved.version, policyId: saved.policyId },
        CRITICAL: { ...current.CRITICAL, version: saved.version, policyId: saved.policyId },
        [priority]: fromPolicy(saved),
      }));
      setNotice(`${priority === 'WARNING' ? 'Warning notification' : 'Critical task dispatch'} saved.`);
    } catch (reason) {
      setNeedsReload(true);
      setError(`${message(reason)} Reload saved state to confirm the current policy before saving again.`);
    }
    finally { setBusy(null); }
  }

  return <AdminLayout title="Event response policies" subtitle="Warning notifies the Operator. Critical dispatches a task to eligible Staff.">
    <div className={s.page}>
      <div className={s.toolbar}>
        <Link className={s.back} to={returnTo}>← Back to AI configuration</Link>
        <div className={s.context}>
        {context?.eventName && <span>{context.eventName}</span>}
        {context?.zoneName && <span>Zone: {context.zoneName}</span>}
        <details className={s.details}>
          <summary>Policy details</summary>
          <p>Changes apply to this event type across all zones. Existing task SLA snapshots stay unchanged.</p>
          <p className={s.rule}>Rule <code>{ruleId || 'Not selected'}</code></p>
        </details>
        </div>
      </div>

      {!ruleId && <div className={s.feedback} role="alert"><p>Open response policies from a monitoring rule.</p></div>}
      {loadError && !loading && <div className={s.feedback} role="alert"><p>{loadError}</p><Button variant="secondary" onClick={retry}>Reload</Button></div>}
      {error && !loadError && <div className={s.feedback} role="alert"><p>{error}</p>{needsReload && <Button variant="secondary" onClick={retry}>Reload saved state</Button>}</div>}
      {notice && <p className={s.success} role="status">{notice}</p>}
      {ruleId && !loading && !loadError && configurationInactive && <p className={s.configurationNotice} role="status"><strong>Configuration inactive.</strong> Activate it in AI configuration for responses to run.</p>}
      {ruleId && !loading && !loadError && !hasPolicy && <p className={s.issues} role="alert">No shared operational SLA policy exists for this event type. <Link to="/admin/sla-policies">Create it in SLA policies</Link> before editing response actions.</p>}
      {loading ? <p className={s.loading} role="status">Loading response policies…</p> : ruleId && !loadError && <div className={s.grid}>
        {priorities.map((priority) => {
          const draft = drafts[priority];
          const working = busy === priority;
          const issues = draft.issues.filter(issue => issue !== 'CONFIGURATION_NOT_ACTIVE');
          return <Card className={`${s.policy} ${priority === 'WARNING' ? s.warning : s.critical}`} key={priority}>
            <fieldset aria-label={`${priority} policy`} disabled={Boolean(busy) || needsReload || !hasPolicy}>
              <div className={s.heading}>
                <div><legend>{priority === 'WARNING' ? 'Warning response' : 'Critical response'}</legend><p>{priority === 'WARNING' ? `Notify the ${draft.targetRoleCode === 'MANAGER' ? 'Manager' : 'Operator'} to monitor the condition. No task is created.` : 'Create one task for the event and offer it to eligible Staff.'}</p></div>
                {draft.policyId === null ? <Chip tone="neutral">Not configured</Chip>
                  : draft.issues.some(issue => !['CONFIGURATION_NOT_ACTIVE', 'RULE_DISABLED', 'POLICY_DISABLED', 'ACTION_DISABLED'].includes(issue)) ? <Chip tone="warning">Needs attention</Chip>
                    : !draft.policyEnabled ? <Chip tone="neutral">Disabled</Chip>
                      : draft.issues.includes('CONFIGURATION_NOT_ACTIVE') ? null
                        : draft.issues.includes('RULE_DISABLED') ? <Chip tone="neutral">Rule disabled</Chip>
                          : <Chip tone="success">{priority === 'WARNING' ? 'Notification ready' : 'Task dispatch ready'}</Chip>}
              </div>

              <label className={s.toggle}><input type="checkbox" checked={draft.policyEnabled} onChange={(event) => update(priority, { policyEnabled: event.target.checked })} />{priority === 'WARNING' ? 'Enable warning notification' : 'Enable critical task dispatch'}</label>
              {priority === 'WARNING' && <label>Notify<select aria-label="Warning recipient" value={draft.targetRoleCode} onChange={event => update(priority, { targetRoleCode: event.target.value === 'MANAGER' ? 'MANAGER' : 'OPERATOR' })}>
                <option value="OPERATOR">Operators</option><option value="MANAGER">Managers</option></select></label>}
              {priority === 'CRITICAL' && <div className={s.taskFields}>
              <div className={s.taskTypeField}>
                <label htmlFor="response-task-type">Task type (required when enabled)</label>
                <select id="response-task-type" required={draft.policyEnabled} disabled={taskTypesLoading || Boolean(taskTypesError) || taskTypes.length === 0} value={draft.taskTypeCode} onChange={event => update(priority, { taskTypeCode: event.target.value })} aria-describedby="response-task-type-help">
                  <option value="">{taskTypesLoading ? 'Loading task types…' : 'Select a task type'}</option>
                  {draft.taskTypeCode && !taskTypes.some(type => type.code === draft.taskTypeCode) && <option value={draft.taskTypeCode} disabled>{draft.taskTypeCode} — {taskTypesLoading ? 'Loading…' : 'Unavailable'}</option>}
                  {taskTypes.map(type => <option key={type.taskTypeId} value={type.code}>{type.code} — {type.name}</option>)}
                </select>
                <span id="response-task-type-help" className={s.help}>{taskTypes.find(type => type.code === draft.taskTypeCode)?.description || 'The selected task type determines the required Staff specialty.'}</span>
                {taskTypesError && <div className={s.catalogError} role="alert"><span>Could not load task types. {taskTypesError}</span><Button variant="secondary" onClick={() => { setTaskTypesLoading(true); setTaskTypesError(''); setCatalogReload(value => value + 1); }}>Retry task types</Button></div>}
                {!taskTypesLoading && !taskTypesError && taskTypes.length === 0 && <span className={s.catalogError}>No task types are configured. Ask the administrator to check the task catalog.</span>}
              </div>
              <label>Task title (optional)<input aria-label="Task title (optional)" maxLength={200} value={draft.title} placeholder="Default: Event type — Zone" onChange={(event) => update(priority, { title: event.target.value })} /></label>
              <label className={s.instructions}>Staff instructions (optional)<textarea aria-label="Staff instructions (optional)" maxLength={4000} rows={3} value={draft.instructions} placeholder="No instructions if left blank." onChange={(event) => update(priority, { instructions: event.target.value })} /></label>
              </div>}

              {issues.length > 0 && <ul className={`${s.issues} ${s.policyIssues}`}>{issues.map((issue) => <li key={issue}>{issueLabels[issue] ?? 'This policy needs administrator review.'}</li>)}</ul>}
              <div className={s.policyFooter}>
              <div className={s.actions}>
                <Button disabled={working || (priority === 'CRITICAL' && draft.policyEnabled && (taskTypesLoading || Boolean(taskTypesError) || taskTypes.length === 0))} onClick={() => void save(priority)}>{working ? 'Saving…' : priority === 'WARNING' ? 'Save warning notification' : 'Save critical task dispatch'}</Button>
              </div>
              </div>
            </fieldset>
          </Card>;
        })}
      </div>}
    </div>
  </AdminLayout>;
}
