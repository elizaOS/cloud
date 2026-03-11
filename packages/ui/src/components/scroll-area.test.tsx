import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollArea } from './scroll-area';

describe('ScrollArea', () => {
  it('renders correctly', () => {
    render(
      <ScrollArea>
        <div>Scrollable Content</div>
      </ScrollArea>
    );
    expect(screen.getByText('Scrollable Content')).toBeInTheDocument();
  });
});
