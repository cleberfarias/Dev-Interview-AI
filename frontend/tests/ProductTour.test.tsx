import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ProductTour from '../src/features/tour/components/ProductTour';

describe('ProductTour', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    scrollIntoView.mockReset();
  });
  it('renders the current step and completes on the last action', async () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <div>
        <button data-tour-id="tour-target">Abrir</button>
        <ProductTour
          open
          onClose={onClose}
          onComplete={onComplete}
          steps={[
            {
              id: 'step-1',
              target: '[data-tour-id="tour-target"]',
              title: 'Primeiro passo',
              description: 'Descricao do passo atual.',
            },
          ]}
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Primeiro passo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('advances to the next step before completing the tour', async () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    render(
      <div>
        <button data-tour-id="tour-target-1">Primeiro alvo</button>
        <button data-tour-id="tour-target-2">Segundo alvo</button>
        <ProductTour
          open
          onClose={onClose}
          onComplete={onComplete}
          steps={[
            {
              id: 'step-1',
              target: '[data-tour-id="tour-target-1"]',
              title: 'Primeiro passo',
              description: 'Descricao do primeiro passo.',
            },
            {
              id: 'step-2',
              target: '[data-tour-id="tour-target-2"]',
              title: 'Segundo passo',
              description: 'Descricao do segundo passo.',
            },
          ]}
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Primeiro passo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Proximo' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Segundo passo' })).toBeInTheDocument();
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
