'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { needsSignoff } from '@/lib/permissions';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentStatus, DocumentRole } from '@/types';

interface DocumentActionsProps {
  documentId: string;
  status: DocumentStatus;
  isCreator: boolean;
  userRoles: DocumentRole[];
  hasOpenDiscussions: boolean;
  onStatusChange?: () => void;
}

export function DocumentActions({
  documentId,
  status,
  isCreator,
  userRoles,
  hasOpenDiscussions,
  onStatusChange,
}: DocumentActionsProps) {
  const queryClient = useQueryClient();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    queryClient.invalidateQueries({ queryKey: ['signoffs', documentId] });
    onStatusChange?.();
  };

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/review`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to submit for review');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Document submitted for review');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const signoffMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/signoff`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to sign off');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Sign off successful');
      setSignoffOpen(false);
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setSignoffOpen(false);
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/documents/${documentId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to reopen');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Document reopened');
      setReopenOpen(false);
      setReopenReason('');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const showSubmitForReview = status === 'draft' && isCreator;
  const showSignoff =
    status === 'in_review' && needsSignoff(userRoles);
  const showReopen = (status === 'in_review' || status === 'approved') && isCreator;

  return (
    <div className="flex items-center gap-2">
      {/* Submit for Review */}
      {showSubmitForReview && (
        <Button
          size="sm"
          onClick={() => reviewMutation.mutate()}
          disabled={reviewMutation.isPending}
        >
          {reviewMutation.isPending ? 'Submitting...' : 'Submit for Review'}
        </Button>
      )}

      {/* Sign Off */}
      {showSignoff && (
        <Dialog open={signoffOpen} onOpenChange={setSignoffOpen}>
          <DialogTrigger
            render={
              <Button
                size="sm"
                disabled={hasOpenDiscussions}
                title={hasOpenDiscussions ? 'There are unresolved discussions' : undefined}
              />
            }
          >
            Sign Off
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Sign Off</DialogTitle>
              <DialogDescription>
                By signing off, you confirm that you have read and agree to this document. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={() => signoffMutation.mutate()}
                disabled={signoffMutation.isPending}
              >
                {signoffMutation.isPending ? 'Signing...' : 'Confirm Sign Off'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reopen */}
      {showReopen && (
        <Dialog open={reopenOpen} onOpenChange={(open) => {
          setReopenOpen(open);
          if (!open) setReopenReason('');
        }}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            Reopen
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reopen Document</DialogTitle>
              <DialogDescription>
                This will move the document back to draft status. Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="reopen-reason" className="text-sm font-medium">
                Reason
              </label>
              <Textarea
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Why are you reopening this document?"
                className="min-h-[80px]"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => reopenMutation.mutate(reopenReason)}
                disabled={reopenMutation.isPending || !reopenReason.trim()}
              >
                {reopenMutation.isPending ? 'Reopening...' : 'Reopen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
