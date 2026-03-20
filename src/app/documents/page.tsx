import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DocumentList } from '@/components/documents/DocumentList';

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Button render={<Link href="/documents/new" />}>New Document</Button>
      </div>
      <DocumentList />
    </div>
  );
}
