import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ActivityDetail from '../ActivityDetail';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    activityDetail: vi.fn(),
    listAgentExecutions: vi.fn(),
  },
}));

vi.mock('../../api', () => ({
  api: { activityDetail: mockApi.activityDetail, listAgentExecutions: mockApi.listAgentExecutions },
}));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/agents/agent-a/activity/act-1']}>
      <Routes>
        <Route path="/agents/:agentId/activity/:activityId" element={<ActivityDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeActivity(): any {
  return {
    id: 'act-1',
    agentId: 'agent-a',
    ownerId: 'owner-a',
    intent: { type: 'payment', asset: 'XLM', amount: '50', destination: 'G...', reason: 'test' },
    policyDecision: { result: 'allow', reason: 'within limit', rule: 'maxTxAmount', intent: {} as any },
    authorizationStatus: 'not_required',
    simulationResult: { success: true, fee: '100', operations: 1, warnings: [] },
    txHash: 'ca1234567890abcdef',
    status: 'confirmed',
    error: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  };
}

function makeExecution(id: string, activityId = 'act-1'): any {
  return {
    id,
    agentId: 'agent-a',
    ownerId: 'owner-a',
    activityId,
    status: 'confirmed',
    intent: { type: 'payment', asset: 'XLM', amount: '50', destination: 'G...', reason: 'test' },
    policyDecision: null,
    simulationResult: null,
    txHash: null,
    submittedHash: null,
    approvalId: null,
    error: null,
    attempt: 1,
    nextRetryAt: null,
    startedAt: null,
    completedAt: null,
    errorClass: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  };
}

describe('ActivityDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.listAgentExecutions.mockResolvedValue({ executions: [] });
  });

  it('renders loading state', () => {
    mockApi.activityDetail.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText('Loading activity...')).toBeInTheDocument();
  });

  it('renders activity detail on success', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('act-1')).toBeInTheDocument();
    });
    expect(screen.getByText('payment')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    mockApi.activityDetail.mockRejectedValue(new Error('API error'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('API error')).toBeInTheDocument();
    });
  });

  it('renders not-found when activity is null', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: null });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Activity not found')).toBeInTheDocument();
    });
  });

  it('calls activityDetail with correct agentId and activityId', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    renderDetail();
    await waitFor(() => {
      expect(mockApi.activityDetail).toHaveBeenCalledWith('agent-a', 'act-1');
    });
  });

  it('renders policy decision section when present', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Policy Decision')).toBeInTheDocument();
    });
    expect(screen.getByText('within limit')).toBeInTheDocument();
  });

  it('renders authorization status when present', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Authorization')).toBeInTheDocument();
    });
    expect(screen.getByText('not_required')).toBeInTheDocument();
  });

  it('renders error details when activity has error', async () => {
    const activity = makeActivity();
    activity.error = 'Transaction failed: insufficient funds';
    mockApi.activityDetail.mockResolvedValue({ activity });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
    expect(screen.getByText('Transaction failed: insufficient funds')).toBeInTheDocument();
  });

  it('passes activityId as a query param so the server filters server-side', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    renderDetail();
    await waitFor(() => {
      expect(mockApi.listAgentExecutions).toHaveBeenCalledWith('agent-a', 50, 0, 'act-1');
    });
  });

  it('shows the execution when it is returned by a server-side filtered query (beyond-first-page scenario)', async () => {
    // The server now filters by activityId, so the response contains only the
    // matching execution regardless of its position in the full list. This test
    // simulates an agent with >50 executions where the matching execution is
    // older than the 50 most recently updated — the old client-side filter
    // would have silently missed it; the server-side filter returns it directly.
    const matchingExecution = makeExecution('exec-60', 'act-1');
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    mockApi.listAgentExecutions.mockResolvedValue({
      executions: [matchingExecution], // server already filtered — only the match is returned
      hasMore: false,
    });
    renderDetail();
    await waitFor(() => {
      // The execution ID prefix appears in the Related Executions table
      expect(screen.getByText('exec-60'.slice(0, 8))).toBeInTheDocument();
    });
    expect(screen.getByText('Related Executions (1)')).toBeInTheDocument();
  });

  it('shows explicit "no executions" message when the lookup completes with no results', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    mockApi.listAgentExecutions.mockResolvedValue({ executions: [], hasMore: false });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('no-executions-message')).toBeInTheDocument();
    });
    expect(screen.getByText('No executions found for this activity.')).toBeInTheDocument();
  });

  it('shows error message when executions lookup fails', async () => {
    mockApi.activityDetail.mockResolvedValue({ activity: makeActivity() });
    mockApi.listAgentExecutions.mockRejectedValue(new Error('Network error'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('executions-error-message')).toBeInTheDocument();
    });
    expect(screen.getByText('Could not load executions. The lookup did not complete.')).toBeInTheDocument();
  });
});

