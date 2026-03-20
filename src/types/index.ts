export type DocumentStatus = 'draft' | 'in_review' | 'approved';
export type DocumentMode = 'doc' | 'sbe';
export type MemberRole = 'editor' | 'advisor' | 'approver';
export type DocumentRole = 'creator' | 'editor' | 'advisor' | 'approver' | 'viewer';
export type DiscussionStatus = 'open' | 'resolved';
export type DiscussionCta = 'no_change' | 'need_change';
export type AnchorType = 'range' | 'line';

export interface RangeAnchor {
  from: number;
  to: number;
}

export interface LineAnchor {
  lineNumber: number;
}

export type AnchorData = RangeAnchor | LineAnchor;

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
