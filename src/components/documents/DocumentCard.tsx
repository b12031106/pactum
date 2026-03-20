import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import type { DocumentStatus } from '@/types';

interface DocumentCardProps {
  id: string;
  title: string;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { name: string };
  updatedAt: string;
}

export function DocumentCard({ id, title, status, tags, creator, updatedAt }: DocumentCardProps) {
  const formattedDate = formatDistanceToNow(new Date(updatedAt), { addSuffix: true });

  return (
    <Link href={`/documents/${id}`} className="block group">
      <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-md animate-slide-up">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {creator.name} &middot; {formattedDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {tags.map(({ tag }) => (
              <Badge key={tag} variant="ghost">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
