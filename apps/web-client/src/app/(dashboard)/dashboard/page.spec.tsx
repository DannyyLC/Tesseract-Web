/**
 * @file page.spec.tsx
 * UI tests for the DashboardPage component.
 *
 * Covers:
 *  - Header section (welcome message, org name)
 *  - Stats cards visibility per role (Workflows, Executions, Credits, Members)
 *  - Area chart section (empty state vs populated)
 *  - Workflows pie chart section (empty state vs populated)
 *  - Top Workflows section (permission-gated, empty state vs populated)
 *  - Recent Executions table (empty state vs populated, status badges)
 *  - Navigation links (section "view all" links)
 *  - Loading states (spinners and skeletons visible during data fetching)
 *  - Permission-based visibility (OWNER vs VIEWER role)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Module mocks (declared before the component import)
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Framer motion – render children without animation overhead
jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) =>
          ({
            children,
            ...props
          }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Recharts – render minimal test-ids instead of real SVG charts (jsdom limitation)
jest.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  Legend: () => null,
}));

// LogoLoader used by PermissionGuard while its own auth query is loading
jest.mock('@/components/ui/logo-loader', () => ({
  LogoLoader: ({ text }: { text: string }) => <div aria-label="logo-loader">{text}</div>,
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/useWorkflows', () => ({
  useWorkflowStats: jest.fn(),
}));

jest.mock('@/hooks/useExecutions', () => ({
  useExecutionsStats: jest.fn(),
  useDashboardExecutions: jest.fn(),
}));

jest.mock('@/hooks/useBilling', () => ({
  useBillingDashboard: jest.fn(),
}));

jest.mock('@/hooks/useUsers', () => ({
  useUserStats: jest.fn(),
}));

import { useAuth } from '@/hooks/useAuth';
import { useWorkflowStats } from '@/hooks/useWorkflows';
import { useExecutionsStats, useDashboardExecutions } from '@/hooks/useExecutions';
import { useBillingDashboard } from '@/hooks/useBilling';
import { useUserStats } from '@/hooks/useUsers';
import DashboardPage from './page';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const ownerUser = {
  sub: 'user-1',
  email: 'owner@example.com',
  name: 'Carlos Rivera',
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Acme Corp',
  plan: 'pro',
};

const viewerUser = {
  ...ownerUser,
  sub: 'user-2',
  email: 'viewer@example.com',
  name: 'Ana López',
  role: 'VIEWER',
};

const defaultWorkflowStats = { activeWorkflows: 7, totalWorkflows: 12 };
const defaultStatsTodayData = { total: 42, successful: 38 };
const defaultStats7dData = {
  total: 250,
  dailyStats: [
    { date: '2026-03-20', count: 30 },
    { date: '2026-03-21', count: 45 },
    { date: '2026-03-22', count: 20 },
    { date: '2026-03-23', count: 60 },
    { date: '2026-03-24', count: 35 },
    { date: '2026-03-25', count: 40 },
    { date: '2026-03-26', count: 20 },
  ],
  topWorkflows: [
    { workflowId: 'wf-1', workflowName: 'Lead Enrichment', executions: 120, successRate: 95 },
    { workflowId: 'wf-2', workflowName: 'Email Automation', executions: 80, successRate: 72 },
    { workflowId: 'wf-3', workflowName: 'Data Sync', executions: 50, successRate: 60 },
  ],
};
const defaultBillingData = { credits: { usedThisMonth: 1000, available: 5000 } };
const defaultUserStats = { total: 10, active: 8 };
const defaultExecutions = {
  items: [
    {
      id: 'exec-1',
      workflow: { name: 'Lead Enrichment' },
      status: 'COMPLETED',
      creditsUsed: 5,
      startedAt: '2026-03-26T10:00:00Z',
    },
    {
      id: 'exec-2',
      workflow: { name: 'Email Automation' },
      status: 'FAILED',
      creditsUsed: 2,
      startedAt: '2026-03-26T09:30:00Z',
    },
    {
      id: 'exec-3',
      workflow: { name: 'Data Sync' },
      status: 'RUNNING',
      creditsUsed: 0,
      startedAt: '2026-03-26T09:00:00Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SetupOptions {
  user?: typeof ownerUser | typeof viewerUser | null;
  isAuthLoading?: boolean;
  workflowStats?: typeof defaultWorkflowStats | null;
  isWorkflowLoading?: boolean;
  statsTodayData?: typeof defaultStatsTodayData | null;
  isStatsTodayLoading?: boolean;
  stats7dData?: typeof defaultStats7dData | null;
  isStats7dLoading?: boolean;
  billingData?: typeof defaultBillingData | null;
  isBillingLoading?: boolean;
  userStats?: typeof defaultUserStats | null;
  isUserStatsLoading?: boolean;
  executions?: typeof defaultExecutions | null;
  isExecutionsLoading?: boolean;
}

function setupMocks(options: SetupOptions = {}) {
  const {
    user = ownerUser,
    isAuthLoading = false,
    workflowStats = defaultWorkflowStats,
    isWorkflowLoading = false,
    statsTodayData = defaultStatsTodayData,
    isStatsTodayLoading = false,
    stats7dData = defaultStats7dData,
    isStats7dLoading = false,
    billingData = defaultBillingData,
    isBillingLoading = false,
    userStats = defaultUserStats,
    isUserStatsLoading = false,
    executions = defaultExecutions,
    isExecutionsLoading = false,
  } = options;

  // useAuth is also consumed by PermissionGuard, so one mock covers both
  (useAuth as jest.Mock).mockReturnValue({ data: user, isLoading: isAuthLoading });

  (useWorkflowStats as jest.Mock).mockReturnValue({
    data: workflowStats,
    isLoading: isWorkflowLoading,
  });

  (useExecutionsStats as jest.Mock).mockImplementation((period: string) => {
    if (period === '24h') return { data: statsTodayData, isLoading: isStatsTodayLoading };
    if (period === '7d') return { data: stats7dData, isLoading: isStats7dLoading };
    return { data: undefined, isLoading: false };
  });

  (useBillingDashboard as jest.Mock).mockReturnValue({
    data: billingData,
    isLoading: isBillingLoading,
  });

  (useUserStats as jest.Mock).mockReturnValue({ data: userStats, isLoading: isUserStatsLoading });

  (useDashboardExecutions as jest.Mock).mockReturnValue({
    data: executions,
    isLoading: isExecutionsLoading,
  });
}

function renderDashboard(options: SetupOptions = {}) {
  setupMocks(options);
  render(<DashboardPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterPush.mockClear();
  });

  // ── Header section ─────────────────────────────────────────────────────────
  describe('header section', () => {
    it('renders the welcome heading with the user first name', () => {
      renderDashboard();
      expect(screen.getByRole('heading', { name: /bienvenido, carlos/i })).toBeInTheDocument();
    });

    it('renders the organization name in the subtitle', () => {
      renderDashboard();
      expect(screen.getByText(/acme corp/i)).toBeInTheDocument();
    });

    it('renders "Resumen de actividad" subtitle text', () => {
      renderDashboard();
      expect(screen.getByText(/resumen de actividad/i)).toBeInTheDocument();
    });

    it('renders the fallback "Dashboard" heading when the user has no name', () => {
      renderDashboard({ user: { ...ownerUser, name: '' } });
      expect(screen.getByRole('heading', { name: /^dashboard$/i })).toBeInTheDocument();
    });

    it('uses only the first name from a multi-word name', () => {
      renderDashboard({ user: { ...ownerUser, name: 'Carlos Rivera Pérez' } });
      expect(screen.getByRole('heading', { name: /bienvenido, carlos/i })).toBeInTheDocument();
    });
  });

  // ── Stats cards ────────────────────────────────────────────────────────────
  describe('stats cards', () => {
    describe('always-visible cards', () => {
      it('renders the "Workflows Activos" label', () => {
        renderDashboard();
        expect(screen.getByText(/workflows activos/i)).toBeInTheDocument();
      });

      it('renders the "Ejecuciones Hoy" label', () => {
        renderDashboard();
        expect(screen.getByText(/ejecuciones hoy/i)).toBeInTheDocument();
      });

      it('displays active and total workflow counts', () => {
        renderDashboard();
        expect(screen.getByText('7')).toBeInTheDocument(); // activeWorkflows (unique value)
        expect(screen.getByText(/de 12/i)).toBeInTheDocument(); // totalWorkflows
      });

      it('displays today total executions count', () => {
        renderDashboard();
        expect(screen.getByText('42')).toBeInTheDocument();
      });

      it('displays successful executions count when greater than zero', () => {
        renderDashboard();
        expect(screen.getByText('38 exitosas')).toBeInTheDocument();
      });

      it('does not display successful label when successful count is zero', () => {
        renderDashboard({ statsTodayData: { total: 5, successful: 0 } });
        expect(screen.queryByText(/exitosas/i)).not.toBeInTheDocument();
      });
    });

    describe('permission-gated cards – OWNER role', () => {
      it('renders the "Créditos Disponibles" label', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText(/créditos disponibles/i)).toBeInTheDocument();
      });

      it('renders the "Miembros del Equipo" label', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText(/miembros del equipo/i)).toBeInTheDocument();
      });

      it('displays available credits value', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText('5,000')).toBeInTheDocument();
      });

      it('displays credits used this month', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText(/1,000 usados este mes/i)).toBeInTheDocument();
      });

      it('displays total team member count', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText('10')).toBeInTheDocument();
      });

      it('displays active member count', () => {
        renderDashboard({ user: ownerUser });
        expect(screen.getByText(/8 activos/i)).toBeInTheDocument();
      });
    });

    describe('permission-gated cards – VIEWER role', () => {
      it('does not render the "Créditos Disponibles" card', () => {
        renderDashboard({ user: viewerUser });
        expect(screen.queryByText(/créditos disponibles/i)).not.toBeInTheDocument();
      });

      it('does not render the "Miembros del Equipo" card', () => {
        renderDashboard({ user: viewerUser });
        expect(screen.queryByText(/miembros del equipo/i)).not.toBeInTheDocument();
      });
    });
  });

  // ── Executions area chart section ──────────────────────────────────────────
  describe('executions area chart section', () => {
    it('renders the section title "Ejecuciones — Últimos 7 días"', () => {
      renderDashboard();
      expect(screen.getByText(/ejecuciones — últimos 7 días/i)).toBeInTheDocument();
    });

    it('renders a link to /executions in the section header', () => {
      renderDashboard();
      const links = screen.getAllByRole('link', { name: /ver ejecuciones/i });
      expect(links.some((l) => l.getAttribute('href') === '/executions')).toBe(true);
    });

    it('renders the area chart when daily stats have non-zero counts', () => {
      renderDashboard();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('shows the empty-state message when all 7-day execution counts are zero', () => {
      renderDashboard({
        stats7dData: {
          total: 0,
          dailyStats: [
            { date: '2026-03-20', count: 0 },
            { date: '2026-03-21', count: 0 },
            { date: '2026-03-22', count: 0 },
            { date: '2026-03-23', count: 0 },
            { date: '2026-03-24', count: 0 },
            { date: '2026-03-25', count: 0 },
            { date: '2026-03-26', count: 0 },
          ],
          topWorkflows: [],
        },
      });
      expect(
        screen.getByText(/sin ejecuciones en los últimos 7 días/i),
      ).toBeInTheDocument();
    });

    it('shows the empty-state message when stats7d provides no dailyStats', () => {
      renderDashboard({ stats7dData: { total: 0, dailyStats: [], topWorkflows: [] } });
      expect(
        screen.getByText(/sin ejecuciones en los últimos 7 días/i),
      ).toBeInTheDocument();
    });
  });

  // ── Workflows pie chart section ────────────────────────────────────────────
  describe('workflows pie chart section', () => {
    it('renders the section title "Estado de Workflows"', () => {
      renderDashboard();
      expect(screen.getByText(/estado de workflows/i)).toBeInTheDocument();
    });

    it('renders a link to /workflows in the section header', () => {
      renderDashboard();
      const link = screen.getByRole('link', { name: /ver workflows/i });
      expect(link).toHaveAttribute('href', '/workflows');
    });

    it('renders the pie chart when there are active or paused workflows', () => {
      renderDashboard();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('shows "Sin workflows creados" when both active and total are zero', () => {
      renderDashboard({ workflowStats: { activeWorkflows: 0, totalWorkflows: 0 } });
      expect(screen.getByText(/sin workflows creados/i)).toBeInTheDocument();
    });
  });

  // ── Top Workflows section ──────────────────────────────────────────────────
  describe('top workflows section', () => {
    it('renders the section title "Top Workflows (7 días)" for users with executions:read', () => {
      renderDashboard({ user: ownerUser });
      expect(screen.getByText(/top workflows \(7 días\)/i)).toBeInTheDocument();
    });

    it('does not render the top workflows section for users without executions:read', () => {
      // VIEWER role has 'executions:read', so use a custom role with no permissions
      renderDashboard({ user: { ...ownerUser, role: 'UNKNOWN_ROLE' } });
      expect(screen.queryByText(/top workflows \(7 días\)/i)).not.toBeInTheDocument();
    });

    it('shows "Sin datos del período actual" when top workflows list is empty', () => {
      renderDashboard({ stats7dData: { ...defaultStats7dData, topWorkflows: [] } });
      expect(screen.getByText(/sin datos del período actual/i)).toBeInTheDocument();
    });

    it('renders workflow names from the top workflows list', () => {
      renderDashboard();
      // Names appear in both this section and the recent executions table, so use getAllByText
      expect(screen.getAllByText('Lead Enrichment').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Email Automation').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Data Sync').length).toBeGreaterThanOrEqual(1);
    });

    it('renders rank numbers for each top workflow', () => {
      renderDashboard();
      // Rank numbers may also appear in other numeric contexts; getAllByText is safe
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    });

    it('renders execution counts for each top workflow', () => {
      renderDashboard();
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('renders a "Tasa de éxito" label for each top workflow entry', () => {
      renderDashboard();
      const labels = screen.getAllByText(/tasa de éxito/i);
      expect(labels).toHaveLength(3);
    });
  });

  // ── Recent executions table ────────────────────────────────────────────────
  describe('recent executions table', () => {
    it('renders the section title "Últimas Ejecuciones"', () => {
      renderDashboard();
      expect(screen.getByText(/últimas ejecuciones/i)).toBeInTheDocument();
    });

    it('renders a "Ver todas" link to /executions', () => {
      renderDashboard();
      const link = screen.getByRole('link', { name: /ver todas/i });
      expect(link).toHaveAttribute('href', '/executions');
    });

    it('renders the table column headers', () => {
      renderDashboard();
      expect(screen.getByText(/^workflow$/i)).toBeInTheDocument();
      expect(screen.getByText(/^estado$/i)).toBeInTheDocument();
      expect(screen.getByText(/^créditos$/i)).toBeInTheDocument();
      expect(screen.getByText(/^fecha$/i)).toBeInTheDocument();
    });

    it('renders a row for each execution with workflow name', () => {
      renderDashboard();
      // workflow names appear as row data
      expect(screen.getAllByText('Lead Enrichment').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Email Automation').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Data Sync').length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Completada" badge for COMPLETED status', () => {
      renderDashboard();
      expect(screen.getByText('Completada')).toBeInTheDocument();
    });

    it('renders "Fallida" badge for FAILED status', () => {
      renderDashboard();
      expect(screen.getByText('Fallida')).toBeInTheDocument();
    });

    it('renders "En proceso" badge for RUNNING status', () => {
      renderDashboard();
      expect(screen.getByText('En proceso')).toBeInTheDocument();
    });

    it('shows "No hay ejecuciones recientes" when the executions list is empty', () => {
      renderDashboard({ executions: { items: [] } });
      expect(screen.getByText(/no hay ejecuciones recientes/i)).toBeInTheDocument();
    });

    it('does not render the table when executions list is empty', () => {
      renderDashboard({ executions: { items: [] } });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // ── Navigation links ───────────────────────────────────────────────────────
  describe('navigation links', () => {
    it('includes a "Ver ejecuciones" link pointing to /executions', () => {
      renderDashboard();
      const links = screen.getAllByRole('link', { name: /ver ejecuciones/i });
      // Multiple sections link to /executions
      links.forEach((link) => expect(link).toHaveAttribute('href', '/executions'));
    });

    it('includes a "Ver workflows" link pointing to /workflows', () => {
      renderDashboard();
      expect(screen.getByRole('link', { name: /ver workflows/i })).toHaveAttribute(
        'href',
        '/workflows',
      );
    });

    it('includes a "Ver todas" link pointing to /executions for the recent executions section', () => {
      renderDashboard();
      expect(screen.getByRole('link', { name: /ver todas/i })).toHaveAttribute(
        'href',
        '/executions',
      );
    });
  });

  // ── Loading states ─────────────────────────────────────────────────────────
  describe('loading states', () => {
    it('shows a loading spinner in the Workflows Activos card while loading', () => {
      renderDashboard({ isWorkflowLoading: true, workflowStats: undefined });
      // The active workflow count (7) is not rendered while loading
      expect(screen.queryByText('7')).not.toBeInTheDocument();
    });

    it('shows a loading spinner in the Ejecuciones Hoy card while loading', () => {
      renderDashboard({ isStatsTodayLoading: true, statsTodayData: undefined });
      expect(screen.queryByText('42')).not.toBeInTheDocument();
    });

    it('shows a skeleton for the area chart while loading 7-day stats', () => {
      renderDashboard({ isStats7dLoading: true, stats7dData: undefined });
      // When loading, the chart container is replaced by a skeleton (no chart testid present)
      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });

    it('shows a skeleton for the workflows chart while loading workflow stats', () => {
      renderDashboard({ isWorkflowLoading: true, workflowStats: undefined });
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });

    it('shows a skeleton for the recent executions table while loading', () => {
      renderDashboard({ isExecutionsLoading: true, executions: undefined });
      // Table is not rendered while loading
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows a loading spinner in the Créditos Disponibles card while loading', () => {
      renderDashboard({ user: ownerUser, isBillingLoading: true, billingData: undefined });
      expect(screen.queryByText('5,000')).not.toBeInTheDocument();
    });

    it('shows a loading spinner in the Miembros del Equipo card while loading', () => {
      renderDashboard({ user: ownerUser, isUserStatsLoading: true, userStats: undefined });
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });
  });
});
