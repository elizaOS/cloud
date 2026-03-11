import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders correctly', () => {
    render(<Badge>New Feature</Badge>);
    expect(screen.getByText('New Feature')).toBeInTheDocument();
  });
});
