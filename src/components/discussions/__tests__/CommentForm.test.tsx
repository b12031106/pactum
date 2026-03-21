import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('@/i18n/context', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', setLocale: () => {} }),
}));

const mockMutate = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/components/discussions/MentionSuggestion', () => ({
  MentionSuggestion: () => null,
}));

import { CommentForm } from '../CommentForm';

describe('CommentForm', () => {
  const defaultProps = {
    discussionId: 'disc-1',
    documentId: 'doc-1',
  };

  beforeEach(() => {
    mockMutate.mockClear();
  });

  it('submit button has type="submit"', () => {
    render(<CommentForm {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'comments.send' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('calls mutate when form is submitted with content', () => {
    render(<CommentForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('comments.placeholder');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });

    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(mockMutate).toHaveBeenCalledWith('Hello world');
  });

  it('does not call mutate when textarea is empty', () => {
    render(<CommentForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('comments.placeholder');
    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(mockMutate).not.toHaveBeenCalled();
  });
});
