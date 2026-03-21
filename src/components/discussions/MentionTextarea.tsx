'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MentionSuggestion } from './MentionSuggestion';
import { useI18n } from '@/i18n/context';

export interface MentionTextareaRef {
  getMentions: () => string[];
  reset: () => void;
}

interface MentionTextareaProps {
  documentId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Whether the mention dropdown is currently visible (blocks form submit) */
  onMentionVisibleChange?: (visible: boolean) => void;
}

export const MentionTextarea = forwardRef<MentionTextareaRef, MentionTextareaProps>(
  function MentionTextarea({ documentId, value, onChange, placeholder, className, id, onMentionVisibleChange }, ref) {
    const { t } = useI18n();
    const [mentions, setMentions] = useState<string[]>([]);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionVisible, setMentionVisible] = useState(false);
    const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      getMentions: () => mentions,
      reset: () => setMentions([]),
    }));

    const updateMentionVisible = useCallback((visible: boolean) => {
      setMentionVisible(visible);
      onMentionVisibleChange?.(visible);
    }, [onMentionVisibleChange]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = val.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^\s]*)$/);

      if (atMatch) {
        setMentionQuery(atMatch[1]);
        updateMentionVisible(true);
        setMentionPosition({ top: (textareaRef.current?.offsetHeight ?? 0) + 4, left: 0 });
      } else {
        updateMentionVisible(false);
      }
    }, [onChange, updateMentionVisible]);

    const handleMentionSelect = useCallback((user: { id: string; name: string }) => {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      const beforeAt = value.slice(0, cursorPos).replace(/@[^\s]*$/, '');
      const afterCursor = value.slice(cursorPos);
      onChange(`${beforeAt}@${user.name} ${afterCursor}`);
      setMentions((prev) => [...new Set([...prev, user.id])]);
      updateMentionVisible(false);
      textareaRef.current?.focus();
    }, [value, onChange, updateMentionVisible]);

    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={handleInput}
          placeholder={placeholder ?? t('comments.placeholder')}
          className={className}
        />
        <MentionSuggestion
          documentId={documentId}
          query={mentionQuery}
          visible={mentionVisible}
          onSelect={handleMentionSelect}
          position={mentionPosition}
        />
      </div>
    );
  },
);
