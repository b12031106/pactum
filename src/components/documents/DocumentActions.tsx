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
import { useI18n } from '@/i18n/context';
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
  const { t } = useI18n();
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
          {reviewMutation.isPending ? t('actions.submitting') : t('actions.submitReview')}
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
                title={hasOpenDiscussions ? t('actions.unresolvedDiscussions') : undefined}
              />
            }
          >
            {t('actions.signOff')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('actions.confirmSignOff')}</DialogTitle>
              <DialogDescription>
                {t('actions.confirmSignOffDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('actions.cancel')}
              </DialogClose>
              <Button
                onClick={() => signoffMutation.mutate()}
                disabled={signoffMutation.isPending}
              >
                {signoffMutation.isPending ? t('actions.signing') : t('actions.confirmSignOff')}
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
            {t('actions.reopen')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('actions.reopenDocument')}</DialogTitle>
              <DialogDescription>
                {t('actions.reopenDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="reopen-reason" className="text-sm font-medium">
                {t('actions.reason')}
              </label>
              <Textarea
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t('actions.reasonPlaceholder')}
                className="min-h-[80px]"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('actions.cancel')}
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => reopenMutation.mutate(reopenReason)}
                disabled={reopenMutation.isPending || !reopenReason.trim()}
              >
                {reopenMutation.isPending ? t('actions.reopening') : t('actions.reopen')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
