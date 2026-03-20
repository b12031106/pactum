import Link from 'next/link';
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
  const formattedDate = new Date(updatedAt).toLocaleDateString('zh-Hant', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link href={`/documents/${id}`} className="block">
      <Card className="hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
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
