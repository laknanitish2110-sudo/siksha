import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface LocalStudent {
  id: string;
  admission_no: string;
  name: string;
  father_name: string;
  mother_name: string;
  phone: string;
  class_level: string;
  academic_year_id: string;
  date_of_admission: string;
  address: string;
  status: 'ACTIVE' | 'COMPLETED' | 'TRANSFERRED' | 'DROPPED' | 'INACTIVE';
  version: number;
  created_at: string;
}

export interface LocalStudentFeeAccount {
  id: string;
  student_id: string;
  academic_year_id: string;
  assigned_admission_fee: number;
  assigned_tuition_fee: number;
  notes?: string;
}

export interface LocalPayment {
  id: string;
  client_tx_id: string;
  student_fee_account_id: string;
  fee_type: 'ADMISSION' | 'TUITION';
  amount: number;
  payment_mode: 'CASH' | 'UPI';
  upi_reference?: string;
  payment_date: string;
  notes?: string;
  recorded_by_user_id: string;
  status: 'VALID' | 'CORRECTED' | 'VOIDED' | 'CONFLICT_QUARANTINED';
  version: number;
  created_at: string;
}

export interface LocalFeeStructure {
  id: string;
  academic_year_id: string;
  class_level: string;
  admission_fee: number;
  tuition_fee: number;
  version: number;
}

export interface LocalAcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface OutboxItem {
  id?: number;
  client_tx_id: string;
  entity_name: 'payments' | 'students' | 'payment_corrections';
  operation_type: 'CREATE' | 'UPDATE' | 'CORRECT';
  client_timestamp: string;
  payload: any;
  status: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED_NEEDS_ATTENTION';
  error_message?: string;
}

export interface CachedUserSession {
  id: string;
  username: string;
  full_name: string;
  role_name: string;
  permissions: string[];
  access_token: string;
  refresh_token: string;
  password_hash: string; // Salted digest for secure offline password verification
  cached_at: string;
  expires_at: string; // 7-day maximum offline authorization window
}

export class ShikshaLocalDatabase extends Dexie {
  students!: Table<LocalStudent, string>;
  student_fee_accounts!: Table<LocalStudentFeeAccount, string>;
  payments!: Table<LocalPayment, string>;
  fee_structures!: Table<LocalFeeStructure, string>;
  academic_years!: Table<LocalAcademicYear, string>;
  outbox!: Table<OutboxItem, number>;
  session!: Table<CachedUserSession, string>;

  constructor() {
    super('ShikshaAcademyLocalDB');
    this.version(1).stores({
      students: 'id, admission_no, name, phone, class_level, status, academic_year_id',
      student_fee_accounts: 'id, student_id, academic_year_id',
      payments: 'id, client_tx_id, student_fee_account_id, fee_type, payment_mode, payment_date, status',
      fee_structures: 'id, academic_year_id, class_level, version',
      academic_years: 'id, name, is_current',
      outbox: '++id, client_tx_id, entity_name, operation_type, status',
      session: 'id, username'
    });
  }
}

export const db = new ShikshaLocalDatabase();
