import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'bun:test';
import TargetProgressBar from './TargetProgressBar';

describe('TargetProgressBar', () => {
  it('shows label and count when not all done', () => {
    render(<TargetProgressBar done={2} total={5} />);
    expect(screen.getByText('Target progress')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('shows Completed badge when done equals total', () => {
    render(<TargetProgressBar done={3} total={3} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('3 / 3')).not.toBeInTheDocument();
  });

  it('fills bar to correct percentage', () => {
    const { container } = render(<TargetProgressBar done={1} total={4} />);
    const fill = container.querySelector('.bg-indigo-400') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('25%');
  });

  it('compact: omits label row and shows title attribute on bar', () => {
    const { container } = render(<TargetProgressBar done={2} total={5} compact />);
    expect(screen.queryByText('Target progress')).not.toBeInTheDocument();
    expect(container.querySelector('[title="2 / 5 targets"]')).toBeTruthy();
  });
});
