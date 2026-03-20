import { ulid } from 'ulid';

export function generateDocumentId(): string {
  return ulid();
}
