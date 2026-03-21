'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

interface MentionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface MentionSuggestionProps {
  documentId: string;
  query: string;
  visible: boolean;
  onSelect: (user: MentionUser) => void;
  position: { top: number; left: number };
}

export function MentionSuggestion({ documentId, query, visible, onSelect, position }: MentionSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['member-search', documentId, query],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ data: MentionUser[] }>;
    },
    enabled: visible,
  });

  const users = useMemo(() => data?.data ?? [], [data?.data]);

  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!visible || users.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, users.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(users[selectedIndex]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, users, selectedIndex, onSelect]);

  if (!visible || users.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 w-60 rounded-md border bg-popover shadow-md"
      style={{ top: position.top, left: position.left }}
    >
      {users.map((user, i) => (
        <button
          key={user.id}
          type="button"
          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
            i === selectedIndex ? 'bg-accent' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user);
          }}
        >
          <span className="font-medium">{user.name}</span>
          <span className="ml-2 text-muted-foreground">{user.email}</span>
        </button>
      ))}
    </div>
  );
}
