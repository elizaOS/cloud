import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from './tooltip';

describe('Tooltip', () => {
  it('renders correctly', () => {
    // We just test if it doesn't crash on render. Testing interactions requires userEvent
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });
});
