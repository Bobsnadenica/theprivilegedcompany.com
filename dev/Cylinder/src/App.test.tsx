// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App audit console', () => {
  it('renders core controls with accessible labels and enabled export', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Tank Volume And Fill Calculator' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fill height slider')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export report/i })).toBeEnabled();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('switches language labels', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'bg' } });

    expect(screen.getByRole('heading', { name: 'Калкулатор за обем и запълване на резервоари' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Експорт на отчет/i })).toBeInTheDocument();
  });

  it('tracks mobile section tab state', () => {
    render(<App />);

    const resultsTab = screen.getByRole('button', { name: 'Results' });
    expect(screen.getByRole('button', { name: 'Build' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(resultsTab);

    expect(resultsTab).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Build' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows new formula-backed shape fields', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Shape basis'), {
      target: { value: 'vertical-cylinder-conical-bottom' },
    });

    expect(screen.getByLabelText(/Cone bottom height/)).toBeInTheDocument();
    expect(screen.getByText(/upright circular cylinders with a centered right-conical bottom/i)).toBeInTheDocument();
  });

  it('previews and imports certified table rows', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/CSV rows/i), {
      target: { value: 'height_m,volume_m3\n0,0\n1,10\n2,30' },
    });

    expect(screen.getByText(/^fnv1a-/)).toBeInTheDocument();
    const importButton = screen.getByRole('button', { name: /Import table to chamber/i });
    expect(importButton).toBeEnabled();

    fireEvent.click(importButton);

    expect(screen.getAllByText('Certified tank table').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 points/i)).toBeInTheDocument();
  });

  it('announces table parse errors', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/CSV rows/i), {
      target: { value: 'height_m,volume_m3\n0,0\nbad,10' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Row 3/);
    expect(screen.getByRole('button', { name: /Import table to chamber/i })).toBeDisabled();
  });
});
