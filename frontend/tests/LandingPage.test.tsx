import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LandingPage from '../components/LandingPage';


describe('LandingPage', () => {
  it('calls onGetStarted on mount', async () => {
    const onGetStarted = vi.fn();
    render(<LandingPage onGetStarted={onGetStarted} />);

    await waitFor(() => {
      expect(onGetStarted).toHaveBeenCalledTimes(1);
    });
  });
});
