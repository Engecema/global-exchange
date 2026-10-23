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
  | 'AJUSTE ADMINISTRATIVO'
  | 'CHAMADO SUPORTE'
  | 'ATUALIZAÇÃO DE PREÇO'
  | 'SAQUE BANCÁRIO'
  | 'TRANSFERÊNCIA PIX BB'
  | 'ESTORNO DE SAQUE';

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
  cryptoAmount?: number;
  status:
    | 'CONFIRMADO'
    | 'PENDENTE'
    | 'PENDENTE_LIBERACAO_BB'
    | 'PROCESSADO_ALCADA_BB'
    | 'LIQUIDADO_BANCO_DO_BRASIL'
    | 'CANCELADO'
    | 'ESTORNADO'
    | string;
  bankStatus?: string;
  recipient?: string;
  note?: string;
  endToEndId?: string;
  externalTxid?: string;
  bitxAddress?: string;
  createdAt: string;
  destinationType?: 'pix' | 'bb_account';
  pixKey?: string;
  pixKeyType?: string;
  bankAgency?: string;
  bankAccount?: string;
  accountDigit?: string;
  settledAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
  errorDetail?: string;
}

export interface ClientCorrectionRequest {
  id: string;
  txid: string;
  clientEmail: string;
  clientName: string;
  clientDocument?: string;
  type: 'CORRECAO_SAQUE' | 'SOLICITACAO_APORTE' | 'DUVIDA_SALDO' | 'OUTRO';
  subject: string;
  message: string;
  relatedAmount?: number;
  relatedCurrency?: 'BRL' | 'GX';
  status: 'pending' | 'resolved' | 'rejected';
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
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
  tagId?: string;
  balanceBtxc?: number;
  balanceBrl?: number;
  balanceUsdt?: number;
  kycStatus?: string;
}

export interface CustodyLedgerEntry {
  id: string;
  type: string;
  counterparty: string;
  amountGx: number;
  amountBrl: number;
  amountUsdt?: number;
  txid: string;
  timestamp: string;
  status: string;
  beneficiaryEmail?: string;
  notes?: string;
}

export interface OrderBookItem {
  price: number;
  amount: number;
  total: number;
}

export interface PriceHistoryPoint {
  id: string;
  timestamp: string;
  timeFormatted: string;
  price: number;
  priceUsd: number;
  volume: number;
  variation?: number;
}

