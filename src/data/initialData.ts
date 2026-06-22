import { Submission } from '../types';

export const INITIAL_SUBMISSIONS: Submission[] = [
  {
    id: 'sub-001',
    lokasi: 'Lt. 1',
    tanggal: '2026-06-03',
    jenisPengajuan: 'Biaya Gaji',
    kode: 'HO',
    dibayarkanKepada: 'Andi Dhiya Salsabila',
    dibayarkanDengan: 'Cek/Transfer',
    notes: '',
    dibuatOleh: 'Nur Wahyudi',
    disetujuiOleh: 'Harijon',
    diverifikasiOleh: 'Andi Dhiya Salsabila',
    diverifikasiJabatan: 'Keuangan',
    disetujuiOleh2: 'H. A. Nursyam Halid',
    disetujuiJabatan2: 'Direktur Utama',
    dibukukanOleh: 'Sri Ekowati',
    dibukukanJabatan: 'Accounting',
    items: [
      {
        id: 'item-1',
        no: 1,
        item: 'Biaya Gaji Office Boy dan Satpam Kantor',
        jumlahVolume: '',
        total: 5000000,
        keterangan: ''
      }
    ],
    createdAt: '2026-06-03T08:00:00Z'
  },
  {
    id: 'sub-002',
    lokasi: 'Lt. 2',
    tanggal: '2026-05-15',
    jenisPengajuan: 'Biaya Operasional',
    kode: 'HO',
    dibayarkanKepada: 'Mandiri Stationery',
    dibayarkanDengan: 'Tunai',
    notes: 'Pembelian darurat karena sisa stok di lemari ATK sudah menipis.',
    dibuatOleh: 'Indra Wijaya',
    disetujuiOleh: 'Harijon',
    diverifikasiOleh: 'Andi Dhiya Salsabila',
    diverifikasiJabatan: 'Keuangan',
    disetujuiOleh2: 'H. A. Nursyam Halid',
    disetujuiJabatan2: 'Direktur Utama',
    dibukukanOleh: 'Sri Ekowati',
    dibukukanJabatan: 'Accounting',
    items: [
      {
        id: 'item-2',
        no: 1,
        item: 'Pembelian Kertas A4 80gr & ATK Bulanan',
        jumlahVolume: '5 Box',
        total: 1250000,
        keterangan: 'Nota Terlampir'
      },
      {
        id: 'item-3',
        no: 2,
        item: 'Refill Tinta Printer HP LaserJet',
        jumlahVolume: '2 Pcs',
        total: 850000,
        keterangan: 'Dept. HO'
      }
    ],
    createdAt: '2026-05-15T10:15:00Z'
  },
  {
    id: 'sub-003',
    lokasi: 'Gedung Utama',
    tanggal: '2026-05-28',
    jenisPengajuan: 'Pemeliharaan AC',
    kode: 'HO',
    dibayarkanKepada: 'CV Abadi Teknik',
    dibayarkanDengan: 'Cek/Transfer',
    notes: 'Perawatan rutin 3 bulanan untuk unit AC di lantai 1 dan 2.',
    dibuatOleh: 'Nur Wahyudi',
    disetujuiOleh: 'Harijon',
    diverifikasiOleh: 'Andi Dhiya Salsabila',
    diverifikasiJabatan: 'Keuangan',
    disetujuiOleh2: 'H. A. Nursyam Halid',
    disetujuiJabatan2: 'Direktur Utama',
    dibukukanOleh: 'Sri Ekowati',
    dibukukanJabatan: 'Accounting',
    items: [
      {
        id: 'item-4',
        no: 1,
        item: 'Service & Cuci AC Panasonic 2 PK',
        jumlahVolume: '4 Unit',
        total: 1800000,
        keterangan: 'Lantai 1 dan Lantai 2'
      }
    ],
    createdAt: '2026-05-28T14:30:00Z'
  }
];
