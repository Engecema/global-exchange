export type UserRole = 'client' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  document: string;
  role: UserRole;
  status?: 'active' | 'pending_approval' | 'rejected';
  bitxAddress?: string;
  registrationTxid?: string;
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
  bitxAddress?: string;
  registrationTxid?: string;
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
  | 'DEPÓSITO BITX CORE'
  | 'ENVIO DE MOEDA'
  | 'AJUSTE CUSTÓDIA'
  | 'ATUALIZAÇÃO DE PREÇO'
  | 'SAQUE BANCÁRIO'
  | 'TRANSFERÊNCIA PIX BB';

export interface Movement {
  id: string;
  txid: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  type: MovementType;
  description: string;
  value: number; // Value in GX or BRL or USDT or BTXC depending on type
  currency?: string;
  status: 'CONFIRMADO' | 'PENDENTE' | 'PENDENTE_LIBERACAO_BB' | 'PROCESSADO_ALCADA_BB' | string;
  bankStatus?: string;
  recipient?: string;
  note?: string;
  endToEndId?: string;
  externalTxid?: string;
  bitxAddress?: string;
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
  bitxAddress?: string;
  registrationTxid?: string;
}

export interface OrderBookItem {
  price: number;
  amount: number;
  total: number;
}
