export interface SubmissionItem {
  id: string;
  no: number;
  item: string;
  jumlahVolume: string;
  total: number;
  keterangan: string;
}

export type PaymentMethod = 'Tunai' | 'Cek/Transfer';

export interface Submission {
  id: string;
  lokasi: string;
  tanggal: string; // ISO format YYYY-MM-DD
  jenisPengajuan: string; // e.g. "Biaya Gaji", "Operasional"
  kode: string; // e.g. "HO"
  dibayarkanKepada: string;
  dibayarkanDengan: PaymentMethod;
  status?: 'Lunas' | 'Belum Lunas';
  notes: string;
  
  // Invoice properties
  isInvoice?: boolean;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  
  // Petty Cash properties
  isPettyCash?: boolean;
  pettyCashCustodian?: string;
  pettyCashFile?: { url: string; name: string };
  
  // Google Drive attachment support
  googleDriveFileUrl?: string;
  googleDriveFileName?: string;
  googleDriveFiles?: { url: string; name: string; pageCount?: number; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[];
  buktiPembayaran?: { url: string; name: string };
  
  // Signatures for Formulir Pengajuan
  dibuatOleh: string;
  disetujuiOleh: string; // e.g. "Harijon"

  // Signatures for Bukti Pengeluaran Kas/Bank
  diverifikasiOleh: string; // e.g. "Andi Dhiya Salsabila"
  diverifikasiJabatan: string; // e.g. "Keuangan"
  disetujuiOleh2: string; // e.g. "H. A. Nursyam Halid"
  disetujuiJabatan2: string; // e.g. "Direktur Utama"
  dibukukanOleh: string; // e.g. "Sri Ekowati"
  dibukukanJabatan: string; // e.g. "Accounting"

  items: SubmissionItem[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO String
  userId: string;
  userEmail: string;
  userName: string;
  action: string; // 'create_submission' | 'update_submission' | 'delete_submission' | 'pay_submission' | 'import_sheets' | 'copy_drive_file'
  details: string; // Detailed description of action
  submissionId?: string;
  submissionCode?: string;
  category: 'info' | 'success' | 'warning';
}

export const REQUIRED_TRANSACTION_DOCS = [
  { key: 'invoice_vendor', label: 'Invoice Vendor', fullName: 'Invoice / Surat Tagihan Vendor' },
  { key: 'po', label: 'PO', fullName: 'PO (Purchase Order)' },
  { key: 'lhv', label: 'LHV', fullName: 'LHV (Laporan Hasil Verifikasi)' },
  { key: 'draft_survei', label: 'Draft Survei', fullName: 'Draft Survei (Survey Draft)' },
  { key: 'bill_of_lading', label: 'Bill of Lading', fullName: 'Bill of Lading (B/L)' },
  { key: 'cargo_manifest', label: 'Cargo Manifest', fullName: 'Cargo Manifest' },
  { key: 'cow_coa_ds_bongkar', label: 'COW & COA DS Bongkar', fullName: 'COW & COA DS Bongkar (Draft Survey)' },
  { key: 'bukti_pembayaran_batubara', label: 'Bukti Pembayaran Batubara', fullName: 'Bukti Pembayaran Batubara' },
  { key: 'bukti_shipment_tongkang_founder', label: 'Bukti Shipment Tongkang', fullName: 'Bukti Pembayaran Shipment Tongkang dari Founder' },
  { key: 'bukti_pajak_trader_founder', label: 'Bukti Bayar Pajak Trader', fullName: 'Bukti Bayar Pajak Trader ke Founder' }
];
