/**
 * @file dashboard-workflow-item.spec.tsx
 * UI tests for the DashboardWorkflowItem component.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { DashboardWorkflowDto } from '@tesseract/types';
import { WorkflowCategory } from '@tesseract/types';

const mockRouterPush = jest.fn();
let allowWorkflowExecute = true;

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

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
            React.createElement(tag, props, children),
      },
    ),
  };
});

jest.mock('@/components/auth/PermissionGuard', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) =>
    allowWorkflowExecute ? <>{children}</> : null,
}));

import DashboardWorkflowItem from './dashboard-workflow-item';

const baseWorkflow: DashboardWorkflowDto = {
  id: 'wf-123',
  name: 'Lead Qualification',
  description: 'Clasifica leads automáticamente antes de enviarlos al CRM.',
  isActive: true,
  category: WorkflowCategory.STANDARD,
  lastExecutedAt: new Date('2026-03-27T11:55:00.000Z'),
};

function buildWorkflow(overrides: Partial<DashboardWorkflowDto> = {}): DashboardWorkflowDto {
  return {
    ...baseWorkflow,
    ...overrides,
  };
}

function renderWorkflowItem(overrides: Partial<DashboardWorkflowDto> = {}) {
  const workflow = buildWorkflow(overrides);
  render(<DashboardWorkflowItem workflow={workflow} />);
  return workflow;
}

describe('DashboardWorkflowItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowWorkflowExecute = true;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-27T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('content rendering', () => {
    it('renders the workflow name, description, category and details label', () => {
      renderWorkflowItem();

      expect(screen.getByRole('heading', { name: /lead qualification/i })).toBeInTheDocument();
      expect(
        screen.getByText(/clasifica leads automáticamente antes de enviarlos al crm\./i),
      ).toBeInTheDocument();
      expect(screen.getByText('STANDARD')).toBeInTheDocument();
      expect(screen.getByText(/ver detalles/i)).toBeInTheDocument();
    });

    it('renders the fallback description when the workflow has no description', () => {
      renderWorkflowItem({ description: null });

      expect(screen.getByText(/sin descripción/i)).toBeInTheDocument();
    });

    it('renders the fallback category when category is missing', () => {
      renderWorkflowItem({ category: undefined as unknown as DashboardWorkflowDto['category'] });

      expect(screen.getByText('STANDARD')).toBeInTheDocument();
    });
  });

  describe('status rendering', () => {
    it('renders the active status label when the workflow is active', () => {
      renderWorkflowItem({ isActive: true });

      expect(screen.getByText(/activo/i)).toBeInTheDocument();
    });

    it('renders the inactive status label when the workflow is inactive', () => {
      renderWorkflowItem({ isActive: false });

      expect(screen.getByText(/inactivo/i)).toBeInTheDocument();
    });
  });

  describe('last execution text', () => {
    it('renders minutes-based text for recent executions', () => {
      renderWorkflowItem({ lastExecutedAt: new Date('2026-03-27T11:55:00.000Z') });

      expect(screen.getByText(/ejecutado hace 5 min/i)).toBeInTheDocument();
    });

    it('renders hours-based text for same-day executions', () => {
      renderWorkflowItem({ lastExecutedAt: new Date('2026-03-27T09:00:00.000Z') });

      expect(screen.getByText(/ejecutado hace 3h/i)).toBeInTheDocument();
    });

    it('renders days-based text for older executions', () => {
      renderWorkflowItem({ lastExecutedAt: new Date('2026-03-24T12:00:00.000Z') });

      expect(screen.getByText(/ejecutado hace 3d/i)).toBeInTheDocument();
    });

    it('renders immediate text when the workflow was executed less than a minute ago', () => {
      renderWorkflowItem({ lastExecutedAt: new Date('2026-03-27T11:59:45.000Z') });

      expect(screen.getByText(/ejecutado hace un momento/i)).toBeInTheDocument();
    });

    it('does not render the last execution section when there is no execution date', () => {
      renderWorkflowItem({ lastExecutedAt: null });

      expect(screen.queryByText(/ejecutado/i)).not.toBeInTheDocument();
    });
  });

  describe('navigation behavior', () => {
    it('navigates to the workflow details page when the card is clicked', () => {
      const workflow = renderWorkflowItem();

      fireEvent.click(screen.getByRole('heading', { name: new RegExp(workflow.name, 'i') }));

      expect(mockRouterPush).toHaveBeenCalledWith(`/workflows/${workflow.id}`);
    });

    it('renders the chat action link with the workflow id when execution is allowed', () => {
      const workflow = renderWorkflowItem();

      expect(screen.getByTitle(/iniciar chat/i)).toHaveAttribute(
        'href',
        `/conversations/new?workflowId=${workflow.id}`,
      );
    });

    it('does not navigate to the details page when the chat action is clicked', () => {
      renderWorkflowItem();

      fireEvent.click(screen.getByTitle(/iniciar chat/i));

      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    it('hides the chat action when the user lacks execution permission', () => {
      allowWorkflowExecute = false;
      renderWorkflowItem();

      expect(screen.queryByTitle(/iniciar chat/i)).not.toBeInTheDocument();
    });
  });
});