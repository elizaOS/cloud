import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders correctly', () => {
    render(<Separator data-testid="sep" />);
    expect(screen.getByTestId('sep')).toBeInTheDocument();
  });
});
