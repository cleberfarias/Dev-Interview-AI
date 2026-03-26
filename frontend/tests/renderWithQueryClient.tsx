import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';

import { createAppQueryClient } from '../src/shared/services/queryClient';

export const renderWithQueryClient = (ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  const queryClient = createAppQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
};
