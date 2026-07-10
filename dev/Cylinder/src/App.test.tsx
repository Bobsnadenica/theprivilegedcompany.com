// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

const storedValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storedValues.clear(),
    getItem: (key: string) => storedValues.get(key) ?? null,
    key: (index: number) => [...storedValues.keys()][index] ?? null,
    get length() { return storedValues.size; },
    removeItem: (key: string) => storedValues.delete(key),
    setItem: (key: string, value: string) => storedValues.set(key, value),
  } satisfies Storage,
});

describe('App audit console', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = 'en';
  });

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
    expect(document.documentElement).toHaveAttribute('lang', 'bg');
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

  it('keeps the current result stable when switching fill modes', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Fill mode'), { target: { value: 'volume' } });
    const targetInput = screen.getByLabelText(/Target volume/) as HTMLInputElement;
    expect(Number(targetInput.value)).toBeCloseTo(13.11929, 4);
    expect(screen.getByText('Calculation ready')).toBeInTheDocument();

    fireEvent.change(targetInput, { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Fill mode'), { target: { value: 'height' } });
    const heightInput = screen.getByLabelText(/^Fill height \(m\)$/) as HTMLInputElement;
    expect(Number(heightInput.value)).toBeCloseTo(1.326, 3);
  });

  it('shows blocking validation near the headline results', () => {
    render(<App />);

    const diameterInput = screen.getByLabelText(/Internal diameter/) as HTMLInputElement;
    fireEvent.change(diameterInput, { target: { value: '0' } });

    expect(diameterInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Calculation blocked')).toBeInTheDocument();
    expect(screen.getByText('Blocking issues: 1')).toBeInTheDocument();
  });

  it('restores the saved workspace after remounting', () => {
    const firstRender = render(<App />);

    fireEvent.change(screen.getByLabelText('Profile'), { target: { value: 'North site tanks' } });
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: 'cm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    firstRender.unmount();

    render(<App />);
    expect(screen.getByLabelText('Profile')).toHaveValue('North site tanks');
    expect(screen.getByLabelText('Length')).toHaveValue('cm');
    expect(screen.getByText('Chamber 2')).toBeInTheDocument();
  });
});
