export type UserRole = 'client' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  document: string;
  role: UserRole;
  status?: 'active' | 'pending_approval' | 'rejected';
}

export interface Account {
  id: string;
  email: string;
  password: string;
  name: string;
  document: string;
  role: UserRole;
  status: 'active' | 'pending_approval' | 'rejected';
  approvedBy?: string;
  createdAt: string;
}

export interface AdminApprovalRequest {
  id: string;
  email: string;
  name: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt?: string;
}

export type MovementType =
  | 'COMPRA'
  | 'VENDA'
  | 'DEPÓSITO PIX'
  | 'ENVIO DE MOEDA'
  | 'AJUSTE CUSTÓDIA'
  | 'ATUALIZAÇÃO DE PREÇO';

export interface Movement {
  id: string;
  txid: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  type: MovementType;
  description: string;
  value: number; // Value in GX or BRL or USDT depending on type
  currency?: string;
  status: 'CONFIRMADO';
  recipient?: string;
  note?: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  description: string;
  value: number;
  date: string;
  createdAt: string;
}

export interface ClientRecord {
  id: string;
  email: string;
  name: string;
  document: string;
  createdAt: string;
  updatedAt: string;
  movementCount: number;
  latestMovement?: Movement | null;
}

export interface OrderBookItem {
  price: number;
  amount: number;
  total: number;
}
