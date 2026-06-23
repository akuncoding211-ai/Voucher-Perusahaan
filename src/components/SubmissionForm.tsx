import React, { useState, useEffect } from 'react';
import { Submission, SubmissionItem, PaymentMethod, REQUIRED_TRANSACTION_DOCS } from '../types';
import { 
  googleDriveLogin, 
  getStoredGoogleDriveToken, 
  setGoogleDriveToken, 
  getConnectedDrives 
} from '../firebase';
import { DriveAccountsManager } from './DriveAccountsManager';
import { Trash2, Plus, ArrowLeft, Save, AlertCircle, Sparkles, Cloud, Loader2, FileText, Coins, FileUp, ExternalLink } from 'lucide-react';
import { generateF1PdfBytes, generateF2PdfBytes, formatDateIndonesian, convertImageToPdf } from '../utils';

interface SubmissionFormProps {
  initialSubmission?: Submission | null;
  userProfile?: any;
  submissions?: Submission[];
  onSave: (submission: Submission) => Promise<void> | void;
  onCancel: () => void;
}

const COMMON_NAMES = {
  dibuatOleh: ['Nur Wahyudi', 'Indra Wijaya', 'Sri Utami'],
  disetujuiOleh: ['Harijon', 'Ahmad Sukri'],
  diverifikasiOleh: ['Andi Dhiya Salsabila', 'Faisal Rahman'],
  disetujuiOleh2: ['H. A. Nursyam Halid', 'Budi Santoso'],
  dibukukanOleh: ['Sri Ekowati', 'Dewi Lestari'],
  lokasi: ['Lt. 1', 'Lt. 2', 'Lt. 3', 'Gedung Utama', 'Gudang Utama'],
  jenisPengajuan: ['Biaya Gaji', 'Biaya Operasional', 'Pemeliharaan AC', 'Perjalanan Dinas', 'Perlengkapan Kantor', 'Transportasi'],
  penerima: ['Andi Dhiya Salsabila', 'Mandiri Stationery', 'CV Abadi Teknik', 'Pratama Security', 'Kantin Sehat']
};

const extractGoogleDriveFileId = (url: string): string | null => {
  if (!url) return null;
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    return dMatch[1];
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return null;
};

// ═════════ GOOGLE DRIVE DIR HIERARCHY HELPER ACTIONS ═════════
const getOrCreateFolder = async (token: string, name: string, parentId: string): Promise<string> => {
  const cleanName = name.trim();
  // Escape backslashes first, then single quotes for safe Google Drive query string syntax
  const cleanSearchName = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = `name = '${cleanSearchName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  
  console.log(`[Drive API] Searching folder: "${cleanName}" under parent "${parentId}"`);
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED_DRIVE_TOKEN');
    }
    throw new Error(`Gagal mencari folder '${cleanName}': ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    console.log(`[Drive API] Folder found: "${cleanName}" with ID: ${data.files[0].id}`);
    return data.files[0].id;
  }

  console.log(`[Drive API] Folder NOT found. Creating folder: "${cleanName}" under parent "${parentId}"`);

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) {
      throw new Error('UNAUTHORIZED_DRIVE_TOKEN');
    }
    const errText = await createRes.text();
    throw new Error(`Gagal membuat folder '${cleanName}': ${errText}`);
  }

  const createdData = await createRes.json();
  console.log(`[Drive API] Folder created: "${cleanName}" with ID: ${createdData.id}`);
  return createdData.id;
};

const parseCompanyAndSequence = (kodeStr: string): { company: string; customFolderKode: string } => {
  const clean = (kodeStr || '').trim();
  const upperClean = clean.toUpperCase();
  
  let company = 'nmsa'; // Default company
  
  // 1. If it explicitly contains "NMSA" anywhere, company is "nmsa"
  if (upperClean.includes('NMSA')) {
    company = 'nmsa';
  } else {
    const parts = clean.split(/[\s/\\_-]+/);
    if (parts.length > 0) {
      const p0 = parts[0].toUpperCase();
      const isPrefix = ['BKK', 'BKM', 'INV', 'T', 'VOUCHER', 'LPJ'].includes(p0);
      if (isPrefix && parts.length >= 2) {
        const potentialComp = parts[1].toLowerCase();
        const isNumeric = /^\d+$/.test(potentialComp);
        const isMonthNumeral = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'].includes(potentialComp);
        const isTooShortOrLong = potentialComp.length < 2 || potentialComp.length > 15;
        if (!isNumeric && !isMonthNumeral && !isTooShortOrLong) {
          company = potentialComp;
        } else {
          company = 'nmsa';
        }
      } else if (!isPrefix) {
        const p0Lower = parts[0].toLowerCase();
        const isNumeric = /^\d+$/.test(p0Lower);
        const isTooShortOrLong = p0Lower.length < 2 || p0Lower.length > 15;
        if (!isNumeric && !isTooShortOrLong) {
          company = p0Lower;
        } else {
          company = 'nmsa';
        }
      }
    }
  }

  company = company.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!company || /^\d+$/.test(company)) {
    company = 'nmsa';
  }

  // To build customFolderKode:
  const partsForFolder = clean.split(/[\s/\\_-]+/);
  let prefix = 'BKK';
  let seq = '';
  if (partsForFolder.length > 0) {
    const p0 = partsForFolder[0].toUpperCase();
    if (['BKK', 'BKM', 'INV', 'T', 'VOUCHER', 'LPJ'].includes(p0)) {
      prefix = p0;
      seq = partsForFolder[partsForFolder.length - 1] || '';
    } else {
      prefix = 'BKK';
      seq = partsForFolder[partsForFolder.length - 1] || '';
    }
  }
  const cleanSeq = (seq || '').toUpperCase();
  const customFolderKode = `${prefix}-${company.toUpperCase()}-${cleanSeq}`;

  return {
    company,
    customFolderKode
  };
};

const getOrCreateFolderHierarchy = async (
  token: string,
  company: string,
  year: string,
  month: string,
  day: string,
  jenisPengajuan: string,
  dibayarkanKepada: string
): Promise<string> => {
  // 1. Get or create 'Voucher-APP' under 'root'
  const rootId = 'root';
  const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
  
  // 2. Get or create company folder under 'Voucher-APP'
  const companyId = await getOrCreateFolder(token, company, voucherAppId);

  // 3. Get or create year folder under company folder
  const yearId = await getOrCreateFolder(token, year, companyId);
  
  // 4. Get or create month folder under year folder
  const monthId = await getOrCreateFolder(token, month, yearId);
  
  // 5. Get or create day folder under month folder
  const dayId = await getOrCreateFolder(token, day, monthId);

  // 6. Get or create custom transaction folder under day folder named (Jenis_Pengajuan - Dibayarkan_Kepada)
  const cleanJenis = (jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const cleanPenerima = (dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const txFolderName = `${cleanJenis} - ${cleanPenerima}`;

  const txFolderId = await getOrCreateFolder(token, txFolderName, dayId);
  
  return txFolderId;
};

const getOrCreatePettyCashFolderHierarchy = async (
  token: string,
  custodian: string,
  year: string,
  month: string,
  day: string
): Promise<string> => {
  // 1. Get or create 'Voucher-APP' under 'root'
  const rootId = 'root';
  const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
  
  // 2. Get or create 'Petty Cash' folder under 'Voucher-APP'
  const pettyCashId = await getOrCreateFolder(token, 'Petty Cash', voucherAppId);

  // 3. Get or create custodian folder under 'Petty Cash' folder
  const cleanCustodian = (custodian || 'Pemegang Petty Cash').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const custodianId = await getOrCreateFolder(token, cleanCustodian, pettyCashId);
  
  // 4. Get or create year folder under custodian folder
  const yearId = await getOrCreateFolder(token, year, custodianId);
  
  // 5. Get or create month folder under year folder
  const monthId = await getOrCreateFolder(token, month, yearId);
  
  // 6. Get or create day folder under month folder
  const dayId = await getOrCreateFolder(token, day, monthId);

  return dayId;
};

// Helper to auto-generate monthly dynamic accounting voucher codes based on Company name, month, and year.
const generateAutoKode = (targetDate: string, compCode: string, allSubmissions: Submission[], currentId?: string): string => {
  if (!targetDate) return '';
  
  const dateParts = targetDate.split('-');
  if (dateParts.length !== 3) return '';
  const yearStr = dateParts[0];
  const monthIdx = parseInt(dateParts[1], 10);
  
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const romanMonth = romanMonths[monthIdx - 1] || 'I';
  
  // 2 digit year
  const yy = yearStr.substring(yearStr.length - 2);
  const cleanComp = (compCode || 'NMSA').toUpperCase();
  
  let maxSeq = 1000; // Next starts at 1001 (maxSeq + 1)
  
  allSubmissions.forEach(sub => {
    if (currentId && sub.id === currentId) return;
    const subKode = sub.kode;
    if (!subKode) return;
    
    // Check match for exactly formatting: e.g. BKK-NMSA/VI/26/1001
    const pattern = new RegExp(`^BKK-${cleanComp}\\/${romanMonth}\\/${yy}\\/(\\d+)$`, 'i');
    const match = subKode.trim().match(pattern);
    if (match) {
      const seqVal = parseInt(match[1], 10);
      if (!isNaN(seqVal)) {
        if (seqVal > maxSeq) {
          maxSeq = seqVal;
        }
      }
    }
  });
  
  const nextSeq = maxSeq + 1;
  return `BKK-${cleanComp}/${romanMonth}/${yy}/${nextSeq}`;
};

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  initialSubmission,
  userProfile,
  submissions = [],
  onSave,
  onCancel,
}) => {
  // Local states
  const [id, setId] = useState('');
  const [isManualKode, setIsManualKode] = useState(false);
  const [lokasi, setLokasi] = useState('Lt. 1');
  const [tanggal, setTanggal] = useState('');
  const [jenisPengajuan, setJenisPengajuan] = useState('Biaya Gaji');
  const [kode, setKode] = useState('HO');
  const [dibayarkanKepada, setDibayarkanKepada] = useState('');
  const [dibayarkanDengan, setDibayarkanDengan] = useState<PaymentMethod>('Cek/Transfer');
  const [status, setStatus] = useState<'Lunas' | 'Belum Lunas'>('Belum Lunas');
  const [notes, setNotes] = useState('');

  // Invoice fields
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState<number | string>('');

  // Petty Cash fields
  const [isPettyCash, setIsPettyCash] = useState(false);
  const [pettyCashCustodian, setPettyCashCustodian] = useState('');
  const [pettyCashLocalFile, setPettyCashLocalFile] = useState<File | null>(null);
  const [pettyCashDriveFile, setPettyCashDriveFile] = useState<{ url: string; name: string } | null>(null);

  // Signatures
  const [dibuatOleh, setDibuatOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_CREATOR_NAME') || 'Nur Wahyudi');
  const [disetujuiOleh, setDisetujuiOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER_NAME') || 'Harijon');
  const [diverifikasiOleh, setDiverifikasiOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_NAME') || 'Andi Dhiya Salsabila');
  const [diverifikasiJabatan, setDiverifikasiJabatan] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN') || 'Keuangan');
  const [disetujuiOleh2, setDisetujuiOleh2] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_NAME') || 'H. A. Nursyam Halid');
  const [disetujuiJabatan2, setDisetujuiJabatan2] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN') || 'Direktur Utama');
  const [dibukukanOleh, setDibukukanOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME') || 'Sri Ekowati');
  const [dibukukanJabatan, setDibukukanJabatan] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN') || 'Accounting');

  // Table items
  const [items, setItems] = useState<SubmissionItem[]>([
    { id: '1', no: 1, item: '', jumlahVolume: '', total: 0, keterangan: '' }
  ]);

  const [validationError, setValidationError] = useState('');
  
  // AI Receipt Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResultJson, setScanResultJson] = useState<any>(null);
  const [showLedgerCols, setShowLedgerCols] = useState(false);

  // File handler for AI Receipt processing
  const handleAiScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanSuccess(false);
    setScanError('');
    setScanResultJson(null);

    try {
      const reader = new FileReader();
      const fileLoadedPromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const resultStr = reader.result as string;
          resolve({
            base64: resultStr,
            mimeType: file.type || 'application/octet-stream'
          });
        };
        reader.onerror = () => {
          reject(new Error('Gagal membaca berkas.'));
        };
        reader.readAsDataURL(file);
      });

      const { base64, mimeType } = await fileLoadedPromise;

      const response = await fetch('/api/gemini/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: mimeType
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error || errObj.details || 'Gagal memproses struk menggunakan Gemini AI.');
      }

      const resData = await response.json();
      if (resData.success && resData.result) {
        const extracted = resData.result;
        setScanResultJson(extracted);
        setScanSuccess(true);

        // Pre-fill fields
        if (extracted.tanggal) setTanggal(extracted.tanggal);
        if (extracted.deskripsi) setDibayarkanKepada(extracted.deskripsi);
        if (extracted.keterangan) setNotes(extracted.keterangan);
        if (extracted.nominal) {
          setInvoiceAmount(extracted.nominal);
          setIsInvoice(true);
        }

        // Check if extracted items have ledger details
        let hasLedger = false;

        if (extracted.items && extracted.items.length > 0) {
          const mappedItems: SubmissionItem[] = extracted.items.map((it: any, idx: number) => {
            if (it.debit !== undefined || it.kredit !== undefined || it.saldo !== undefined) {
              hasLedger = true;
            }
            return {
              id: `ai-${idx}-${Math.random()}`,
              no: idx + 1,
              item: it.item || 'Item Terdeteksi',
              jumlahVolume: it.jumlahVolume || '1 Ls',
              total: Number(it.total) || 0,
              keterangan: it.keterangan || 'Diekstrak oleh AI',
              debit: it.debit,
              kredit: it.kredit,
              saldo: it.saldo
            };
          });
          setItems(mappedItems);
        } else {
          if (extracted.debit !== undefined || extracted.kredit !== undefined || extracted.saldo !== undefined) {
            hasLedger = true;
          }
          setItems([
            {
              id: `ai-single-${Math.random()}`,
              no: 1,
              item: extracted.deskripsi || extracted.keterangan || 'Belanja Struk/Kwitansi',
              jumlahVolume: '1 Ls',
              total: Number(extracted.nominal) || 0,
              keterangan: 'Diekstrak oleh AI',
              debit: extracted.debit,
              kredit: extracted.kredit,
              saldo: extracted.saldo
            }
          ]);
        }

        if (hasLedger) {
          setShowLedgerCols(true);
        }
      } else {
        throw new Error('Ekstraksi AI tidak membuahkan hasil data JSON yang valid.');
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || 'Gagal melakukan pemindaian berkas.');
    } finally {
      setIsScanning(false);
    }
  };

  // Google Drive attachment support states
  const [googleDriveFileUrl, setGoogleDriveFileUrl] = useState('');
  const [googleDriveFileName, setGoogleDriveFileName] = useState('');
  const [googleDriveFiles, setGoogleDriveFiles] = useState<{ url: string; name: string }[]>([]);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // keep for display if needed
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Modern unified local/drive files list state
  const [fileItems, setFileItems] = useState<{ id: string; name: string; file?: File; url?: string; isDrive: boolean; docType?: string }[]>([]);
  const [isMergedMethod, setIsMergedMethod] = useState(false);
  
  // Dedicated Bukti Pembayaran states
  const [buktiPembayaranFile, setBuktiPembayaranFile] = useState<File | null>(null);
  const [buktiPembayaranDrive, setBuktiPembayaranDrive] = useState<{ url: string; name: string } | null>(null);

  // Google Drive File deletion confirmation warning states
  const [driveFileToDelete, setDriveFileToDelete] = useState<{
    url: string;
    name: string;
    onConfirm: () => void;
    onForceDeleteFromApp: () => void;
  } | null>(null);
  const [fileToDeleteStatus, setFileToDeleteStatus] = useState<'idle' | 'deleting'>('idle');
  const [fileToDeleteError, setFileToDeleteError] = useState<string | null>(null);

  // Sync payment status state with payment proof file presence
  useEffect(() => {
    setStatus((buktiPembayaranFile || buktiPembayaranDrive) ? 'Lunas' : 'Belum Lunas');
  }, [buktiPembayaranFile, buktiPembayaranDrive]);

  // Check Drive connection status
  useEffect(() => {
    const drives = getConnectedDrives();
    if (drives.length > 0) {
      setIsDriveConnected(true);
    }
  }, []);

  const handleConnectDrive = async () => {
    setUploadError('');
    try {
      const result = await googleDriveLogin();
      if (result.accessToken) {
        setIsDriveConnected(true);
      }
    } catch (err: any) {
      setUploadError(`Gagal menghubungkan Google Drive Anda: ${err.message || err}`);
    }
  };

  const downloadGoogleDriveFile = async (url: string, token: string): Promise<Uint8Array | null> => {
    try {
      const match = url.match(/[-\w]{25,}/);
      if (!match) return null;
      const fileId = match[0];
      
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        console.error(`Failed to download ${url} from Google Drive: ${res.statusText}`);
        return null;
      }
      
      const arrayBuffer = await res.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error(`Error downloading Google Drive file ${url}:`, error);
      return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    const newItems = (Array.from(files) as File[]).map((file, idx) => ({
      id: `local-${Date.now()}-${idx}`,
      name: file.name,
      file: file,
      isDrive: false
    }));

    setFileItems(prev => [...prev, ...newItems]);
    // Reset file input target value so user can select the same/edited files again
    e.target.value = '';
  };

  const handleSpecificFileUpload = (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    const extDoc = REQUIRED_TRANSACTION_DOCS.find(d => d.key === docType);
    const label = extDoc ? extDoc.label : 'Dokumen';

    const newItems = (Array.from(files) as File[]).map((file, idx) => ({
      id: `local-${docType}-${Date.now()}-${idx}`,
      name: `${label} - ${file.name}`,
      file: file,
      isDrive: false,
      docType: docType
    }));

    // Filter out any existing file with this docType to replace it easily
    setFileItems(prev => {
      const filtered = prev.filter(item => item.docType !== docType);
      return [...filtered, ...newItems];
    });

    e.target.value = '';
  };

  const handleDeleteFileItem = (id: string) => {
    const item = fileItems.find(f => f.id === id);
    if (item && item.isDrive && item.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: item.url,
        name: item.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(item.url || '');
          if (fileId) {
            const token = getStoredGoogleDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setFileItems(prev => prev.filter(f => f.id !== id));
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}). Sesi mungkin sudah kedaluwarsa.`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif. Silakan hubungkan kembali akun Google Drive Anda.');
              setFileToDeleteStatus('idle');
            }
          } else {
            // No file ID could be extracted, just remove from local state
            setFileItems(prev => prev.filter(f => f.id !== id));
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setFileItems(prev => prev.filter(f => f.id !== id));
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setFileItems(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleDeleteBuktiPembayaran = () => {
    if (buktiPembayaranDrive && buktiPembayaranDrive.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: buktiPembayaranDrive.url,
        name: buktiPembayaranDrive.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(buktiPembayaranDrive.url);
          if (fileId) {
            const token = getStoredGoogleDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setBuktiPembayaranDrive(null);
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}).`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif atau kadaluarsa.');
              setFileToDeleteStatus('idle');
            }
          } else {
            setBuktiPembayaranDrive(null);
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setBuktiPembayaranDrive(null);
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setBuktiPembayaranDrive(null);
    }
  };

  const handleDeletePettyCashDriveFile = () => {
    if (pettyCashDriveFile && pettyCashDriveFile.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: pettyCashDriveFile.url,
        name: pettyCashDriveFile.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(pettyCashDriveFile.url);
          if (fileId) {
            const token = getStoredGoogleDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setPettyCashDriveFile(null);
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}).`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif atau kadaluarsa.');
              setFileToDeleteStatus('idle');
            }
          } else {
            setPettyCashDriveFile(null);
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setPettyCashDriveFile(null);
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setPettyCashDriveFile(null);
    }
  };

  // Initialize form
  useEffect(() => {
    if (initialSubmission) {
      setId(initialSubmission.id);
      setLokasi(initialSubmission.lokasi);
      setTanggal(initialSubmission.tanggal);
      setJenisPengajuan(initialSubmission.jenisPengajuan);
      setKode(initialSubmission.kode);
      setIsManualKode(true);
      setDibayarkanKepada(initialSubmission.dibayarkanKepada);
      setDibayarkanDengan(initialSubmission.dibayarkanDengan);
      setStatus(initialSubmission.status || 'Belum Lunas');
      setNotes(initialSubmission.notes);
      setIsInvoice(initialSubmission.isInvoice || false);
      setInvoiceNumber(initialSubmission.invoiceNumber || '');
      setInvoiceDate(initialSubmission.invoiceDate || '');
      setInvoiceAmount(initialSubmission.invoiceAmount !== undefined ? initialSubmission.invoiceAmount : '');
      setIsPettyCash(initialSubmission.isPettyCash || false);
      setPettyCashCustodian(initialSubmission.pettyCashCustodian || '');
      setPettyCashDriveFile(initialSubmission.pettyCashFile || null);
      setPettyCashLocalFile(null);
      setGoogleDriveFileUrl(initialSubmission.googleDriveFileUrl || '');
      setGoogleDriveFileName(initialSubmission.googleDriveFileName || '');
      setBuktiPembayaranDrive(initialSubmission.buktiPembayaran || null);
      if (initialSubmission.googleDriveFiles && initialSubmission.googleDriveFiles.length > 0) {
        setGoogleDriveFiles(initialSubmission.googleDriveFiles);
        // Exclude system files (F1, F2, petty cash report, and payment proof) from the editable attachments list
        const filteredAttachmentFiles = initialSubmission.googleDriveFiles.filter(f => {
          if (f.isF1 || f.isF2 || f.isBuktiPembayaran || f.docType === 'petty_cash_report') {
            return false;
          }
          const name = f.name || '';
          if (name.startsWith('F1 - (') && name.endsWith(').pdf')) return false;
          if (name.startsWith('F2 - (') && name.endsWith(').pdf')) return false;
          return true;
        });
        setFileItems(filteredAttachmentFiles.map((f, i) => ({
          id: `drive-${i}`,
          name: f.name,
          url: f.url,
          isDrive: true,
          docType: f.docType
        })));
        setIsMergedMethod(initialSubmission.googleDriveFiles.some(f => f.docType === 'merged_all'));
      } else if (initialSubmission.googleDriveFileUrl) {
        const defaultDrive = [{ url: initialSubmission.googleDriveFileUrl, name: initialSubmission.googleDriveFileName || 'Buka di Drive' }];
        setGoogleDriveFiles(defaultDrive);
        setFileItems(defaultDrive.map((f, i) => ({
          id: `drive-${i}`,
          name: f.name,
          url: f.url,
          isDrive: true
        })));
      } else {
        setGoogleDriveFiles([]);
        setFileItems([]);
      }

      if (initialSubmission.buktiPembayaran) {
        setBuktiPembayaranDrive(initialSubmission.buktiPembayaran);
      } else {
        setBuktiPembayaranDrive(null);
      }
      setBuktiPembayaranFile(null);

      setDibuatOleh(initialSubmission.dibuatOleh);
      setDisetujuiOleh(initialSubmission.disetujuiOleh);
      setDiverifikasiOleh(initialSubmission.diverifikasiOleh);
      setDiverifikasiJabatan(initialSubmission.diverifikasiJabatan);
      setDisetujuiOleh2(initialSubmission.disetujuiOleh2);
      setDisetujuiJabatan2(initialSubmission.disetujuiJabatan2);
      setDibukukanOleh(initialSubmission.dibukukanOleh);
      setDibukukanJabatan(initialSubmission.dibukukanJabatan);

      setItems(initialSubmission.items.map(item => ({ ...item })));
    } else {
      // Setup default current date
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const dy = String(today.getDate()).padStart(2, '0');
      setTanggal(`${yr}-${mo}-${dy}`);
      
      const details = userProfile?.companyDetails;

      // Defaults mapping dynamically from company metadata profile if loaded
      setId('');
      setLokasi(details?.defaultLokasi || 'Lt. 1');
      setJenisPengajuan(details?.defaultJenis || 'Biaya Gaji');
      setKode(details?.defaultKode || 'HO');
      setIsManualKode(false);
      setDibayarkanKepada('');
      setDibayarkanDengan('Cek/Transfer');
      setStatus('Belum Lunas');
      setNotes('');
      setGoogleDriveFileUrl('');
      setGoogleDriveFileName('');
      setGoogleDriveFiles([]);
      setFileItems([]);
      setBuktiPembayaranFile(null);
      setBuktiPembayaranDrive(null);
      setIsPettyCash(false);
      setPettyCashCustodian('');
      setPettyCashLocalFile(null);
      setPettyCashDriveFile(null);
      const storedDefaultCreator = localStorage.getItem('NUSANTARA_DEFAULT_CREATOR_NAME');
      const storedDefaultApprover = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER_NAME');
      const storedDefaultVerifier = localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_NAME');
      const storedDefaultVerifierJabatan = localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN');
      const storedDefaultApprover2 = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_NAME');
      const storedDefaultApprover2Jabatan = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN');
      const storedDefaultBookkeeper = localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME');
      const storedDefaultBookkeeperJabatan = localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN');

      setDibuatOleh(storedDefaultCreator || details?.sigDibuat || userProfile?.fullName || 'Nur Wahyudi');
      setDisetujuiOleh(storedDefaultApprover || details?.sigDisetujui || details?.sigDirKeuangan || 'Harijon');
      setDiverifikasiOleh(storedDefaultVerifier || details?.sigKeuangan || 'Andi Dhiya Salsabila');
      setDiverifikasiJabatan(storedDefaultVerifierJabatan || 'Keuangan');
      setDisetujuiOleh2(storedDefaultApprover2 || details?.sigDirektur || 'H. A. Nursyam Halid');
      setDisetujuiJabatan2(storedDefaultApprover2Jabatan || 'Direktur Utama');
      setDibukukanOleh(storedDefaultBookkeeper || details?.sigAccounting || 'Sri Ekowati');
      setDibukukanJabatan(storedDefaultBookkeeperJabatan || 'Accounting');

      setItems([
        { id: Math.random().toString(), no: 1, item: '', jumlahVolume: '', total: 0, keterangan: '' }
      ]);
    }
  }, [initialSubmission, userProfile]);

  // Hook to dynamically generate voucher code automatically on fields changes
  useEffect(() => {
    if (isManualKode) return;
    
    const compCode = (userProfile?.companyDetails?.code || userProfile?.companyId || 'NMSA').toUpperCase();
    const autoKode = generateAutoKode(tanggal, compCode, submissions, id);
    if (autoKode) {
      setKode(autoKode);
    }
  }, [tanggal, userProfile, submissions, isManualKode, id]);

  // Handle item input updates
  const handleItemChange = (index: number, field: keyof SubmissionItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    setItems(updatedItems);
  };

  // Add Item Row
  const handleAddItemRow = () => {
    const nextNo = items.length + 1;
    setItems([
      ...items,
      { id: Math.random().toString(), no: nextNo, item: '', jumlahVolume: '', total: 0, keterangan: '' }
    ]);
  };

  // Remove Item Row
  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      setValidationError('Minimal harus ada 1 item pengajuan.');
      return;
    }
    const filtered = items.filter((_, i) => i !== index);
    // Re-index row numbers
    const reindexed = filtered.map((item, idx) => ({
      ...item,
      no: idx + 1
    }));
    setItems(reindexed);
    setValidationError('');
  };

  // Run calculation
  const calculatedGrandTotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!dibayarkanKepada.trim()) {
      setValidationError('Penerima pembayaran (Dibayarkan Kepada) wajib diisi.');
      return;
    }
    if (!tanggal) {
      setValidationError('Tanggal pengajuan wajib ditentukan.');
      return;
    }
    if (items.some(item => !item.item.trim())) {
      setValidationError('Nama item pengajuan tidak boleh kosong.');
      return;
    }
    if (isPettyCash && !pettyCashCustodian.trim()) {
      setValidationError('Nama pemegang Petty cash wajib diisi untuk transaksi Pengisian Petty Cash Lapangan.');
      return;
    }
    if (isPettyCash && !pettyCashLocalFile && !pettyCashDriveFile) {
      setValidationError('Berkas laporan pertanggungjawaban Petty cash wajib diunggah/dipilih.');
      return;
    }
    if (calculatedGrandTotal < 0) {
      setValidationError('Total Gabungan pengajuan tidak boleh di bawah 0 (negatif). Harap periksa kembali pengeluaran dan pengurangan/potongan Anda.');
      return;
    }

    setValidationError('');
    setIsSaving(true);
    setSaveProgress('Menyiapkan parameter unggahan...');

    try {
      let finalFiles: { url: string; name: string; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[] = [];
      let finalBuktiPembayaran: { url: string; name: string } | undefined = undefined;
      let finalPettyCashFile: { url: string; name: string } | undefined = undefined;

      const token = getStoredGoogleDriveToken();
      if (token) {
        setSaveProgress('Menghitung format tanggal pengajuan...');
        // 1. Resolve Year/Month/Day folder structure parameters
        const parts = (tanggal || '').split('-');
        let yearStr = '';
        let monthStr = '';
        let dayStr = '';

        if (parts.length === 3) {
          yearStr = parts[0];
          const monthIdx = parseInt(parts[1], 10) - 1;
          const INDONESIAN_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          const mNum = monthIdx + 1;
          const mName = INDONESIAN_MONTHS[monthIdx] || 'Januari';
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(parseInt(parts[2], 10));
        } else {
          const dateObj = new Date();
          yearStr = String(dateObj.getFullYear());
          const INDONESIAN_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          const mNum = dateObj.getMonth() + 1;
          const mName = INDONESIAN_MONTHS[dateObj.getMonth()];
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(dateObj.getDate());
        }

        // Force companyCode to always be 'nmsa' to guarantee folder structure remains inside NMSA company
        const companyCode = 'nmsa';
        const folderCompanyUpper = 'NMSA';
        
        console.log('[Drive Upload] Memulai pembuatan struktur direktori:', { company: folderCompanyUpper, yearStr, monthStr, dayStr });
        
        setSaveProgress('1/6. Mencari/Membuat folder utama: "Voucher-APP"...');
        const rootId = 'root';
        const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
        console.log('[Drive Upload] Folder "Voucher-APP" ID:', voucherAppId);

        setSaveProgress(`2/6. Mencari/Membuat folder perusahaan: "${folderCompanyUpper}"...`);
        const companyId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);
        console.log(`[Drive Upload] Folder perusahaan "${folderCompanyUpper}" ID:`, companyId);

        setSaveProgress(`3/6. Mencari/Membuat folder tahun: "${yearStr}"...`);
        const yearId = await getOrCreateFolder(token, yearStr, companyId);
        console.log(`[Drive Upload] Folder tahun "${yearStr}" ID:`, yearId);

        setSaveProgress(`4/6. Mencari/Membuat folder bulan: "${monthStr}"...`);
        const monthId = await getOrCreateFolder(token, monthStr, yearId);
        console.log(`[Drive Upload] Folder bulan "${monthStr}" ID:`, monthId);

        setSaveProgress(`5/6. Mencari/Membuat folder tanggal: "${dayStr}"...`);
        const dayId = await getOrCreateFolder(token, dayStr, monthId);
        console.log(`[Drive Upload] Folder tanggal "${dayStr}" ID:`, dayId);

        // Name of subfolder under day folder named (Jenis_Pengajuan - Dibayarkan_Kepada)
        const cleanJenis = (jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanPenerima = (dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const txFolderName = `${cleanJenis} - ${cleanPenerima}`;

        setSaveProgress(`6/6. Mencari/Membuat folder transaksi khusus: "${txFolderName}"...`);
        const targetFolderId = await getOrCreateFolder(token, txFolderName, dayId);
        console.log('[Drive Upload] Folder Transaksi Khusus ID:', targetFolderId);

        // Define reusable upload function to avoid duplicates
        const uploadFileToFolder = async (
          fileName: string,
          fileMimeType: string,
          fileBytes: Uint8Array,
          folderId: string
        ): Promise<{ url: string; name: string }> => {
          // Check if file already exists in this folder to avoid duplicates
          try {
            const searchRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
              )}&fields=files(id)`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              if (searchData.files && searchData.files.length > 0) {
                for (const existingFile of searchData.files) {
                  await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
                    method: 'DELETE',
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }
              }
            }
          } catch (dupErr) {
            console.warn('Error checking/deleting duplicate file:', fileName, dupErr);
          }

          const fileBlob = new Blob([fileBytes], { type: fileMimeType });
          const compiledFile = new File([fileBlob], fileName, { type: fileMimeType });

          const metadata = {
            name: fileName,
            mimeType: fileMimeType,
            parents: [folderId],
          };

          const formData = new FormData();
          formData.append(
            'metadata',
            new Blob([JSON.stringify(metadata)], { type: 'application/json' })
          );
          formData.append('file', compiledFile);

          const res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: formData,
            }
          );

          if (!res.ok) {
            if (res.status === 401) {
              setIsDriveConnected(false);
              setGoogleDriveToken(null);
              throw new Error('Sesi otentikasi Google Drive telah kedaluwarsa. Silakan hubungkan ulang Google Drive Anda.');
            }
            const errorText = await res.text();
            throw new Error(`Gagal mengunggah file '${fileName}' ke Drive: ${errorText}`);
          }

          const fileData = await res.json();

          // Set permissions
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone',
              }),
            });
          } catch (perErr) {
            console.warn('Could not set permissions for uploaded file:', fileName, perErr);
          }

          return {
            url: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view?usp=drivesdk`,
            name: fileData.name || fileName,
          };
        };

        // Create a temporary object representation for PDF drawing
        const tempSubmissionForPdf = {
          lokasi,
          tanggal,
          jenisPengajuan,
          kode,
          dibayarkanKepada,
          dibayarkanDengan,
          notes,
          dibuatOleh,
          disetujuiOleh,
          diverifikasiOleh,
          diverifikasiJabatan,
          disetujuiOleh2,
          disetujuiJabatan2,
          dibukukanOleh,
          dibukukanJabatan,
          items: items.map(item => ({
            ...item,
            total: Number(item.total) || 0
          }))
        };

        // 2. Generate and Upload F1
        setSaveProgress('Membuat Dokumen PDF Bukti Pengeluaran Kas/Bank (F1)...');
        const f1PdfBytes = await generateF1PdfBytes(tempSubmissionForPdf, calculatedGrandTotal);
        setSaveProgress('Mengunggah Dokumen F1 ke Google Drive...');
        const f1Data = await uploadFileToFolder(`F1 - (${cleanJenis} - ${cleanPenerima}).pdf`, 'application/pdf', f1PdfBytes, targetFolderId);
        finalFiles.push({
          url: f1Data.url,
          name: f1Data.name,
          isF1: true
        });

        // 3. Generate and Upload F2
        setSaveProgress('Membuat Dokumen PDF Form Pengajuan HO (F2)...');
        const f2PdfBytes = await generateF2PdfBytes(tempSubmissionForPdf, calculatedGrandTotal);
        setSaveProgress('Mengunggah Dokumen F2 ke Google Drive...');
        const f2Data = await uploadFileToFolder(`F2 - (${cleanJenis} - ${cleanPenerima}).pdf`, 'application/pdf', f2PdfBytes, targetFolderId);
        finalFiles.push({
          url: f2Data.url,
          name: f2Data.name,
          isF2: true
        });

        // 4. Upload normal selected attachments (fileItems)
        const getFileExtensionForSave = (filename: string): string => {
          const lastDot = filename.lastIndexOf('.');
          return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
        };

        const getCleanOriginalName = (filename: string): string => {
          if (!filename) return '';
          // Strip system-added prefixes to restore the original name
          let cleaned = filename.replace(/^Lampiran - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          cleaned = cleaned.replace(/^File Pendukung Transaksi - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          cleaned = cleaned.replace(/^[^-]+ - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          
          REQUIRED_TRANSACTION_DOCS.forEach(doc => {
            const rx = new RegExp(`^${doc.label}\\s*-\\s*`, 'i');
            cleaned = cleaned.replace(rx, '');
          });
          return cleaned.trim() || filename;
        };

        for (let i = 0; i < fileItems.length; i++) {
          const item = fileItems[i];
          // Skip if they are older versions of generated F1/F2 files to avoid infinite loops / redundant pages
          const isSystemGenerated = (item.name || '').startsWith('F1 - (') && (item.name || '').endsWith(').pdf') ||
                                    (item.name || '').startsWith('F2 - (') && (item.name || '').endsWith(').pdf');
          if (isSystemGenerated) {
            continue;
          }
          setSaveProgress(`Mengunggah Berkas Lampiran (${i + 1}/${fileItems.length}): ${item.name}...`);
          let fileBytes: Uint8Array | null = null;
          let mimeType = 'application/octet-stream';
          const originalName = item.name;

          if (item.file) {
            fileBytes = new Uint8Array(await item.file.arrayBuffer());
            mimeType = item.file.type || 'application/octet-stream';
          } else if (item.isDrive && item.url) {
            fileBytes = await downloadGoogleDriveFile(item.url, token);
            const extLower = getFileExtensionForSave(originalName);
            if (extLower === '.pdf') mimeType = 'application/pdf';
            else if (extLower === '.png') mimeType = 'image/png';
            else if (extLower === '.jpg' || extLower === '.jpeg') mimeType = 'image/jpeg';
            else if (extLower === '.gif') mimeType = 'image/gif';
            else if (extLower === '.webp') mimeType = 'image/webp';
          }

          if (!fileBytes) {
            console.warn('Skipping file as bytes are empty:', originalName);
            if (item.isDrive && item.url) {
              finalFiles.push({
                url: item.url,
                name: item.name,
                docType: item.docType
              });
            }
            continue;
          }

          if (mimeType.startsWith('image/') || /\.jpe?g|\.png/i.test(originalName)) {
            try {
              setSaveProgress(`Mengubah gambar ke PDF (${i + 1}/${fileItems.length}): ${item.name}...`);
              fileBytes = await convertImageToPdf(fileBytes, mimeType);
              mimeType = 'application/pdf';
            } catch (convErr) {
              console.warn('Gagal mengubah gambar ke PDF:', convErr);
            }
          }

          const cleanOriginalName = getCleanOriginalName(originalName);
          const ext = mimeType === 'application/pdf' ? '.pdf' : (getFileExtensionForSave(cleanOriginalName) || '.bin');
          const lastDot = cleanOriginalName.lastIndexOf('.');
          const namePart = lastDot !== -1 ? cleanOriginalName.substring(0, lastDot) : cleanOriginalName;
          
          const finalFileName = i === 0 ? `${namePart}${ext}` : `${namePart} (${i + 1})${ext}`;

          const resData = await uploadFileToFolder(finalFileName, mimeType, fileBytes, targetFolderId);
          finalFiles.push({
            url: resData.url,
            name: resData.name,
            docType: item.docType
          });
        }

        // 5. Upload Bukti Pembayaran file to its special subfolder: "Bukti Pembayaran"
        if (buktiPembayaranFile) {
          setSaveProgress('Membuat/Mencari folder "Bukti Pembayaran"...');
          const folderBuktiBayarId = await getOrCreateFolder(token, 'Bukti Pembayaran', targetFolderId);
          
          setSaveProgress(`Mengunggah berkas Bukti Pembayaran: ${buktiPembayaranFile.name}...`);
          let bytes = new Uint8Array(await buktiPembayaranFile.arrayBuffer());
          let mime = buktiPembayaranFile.type || 'application/octet-stream';
          
          let paymentExt = getFileExtensionForSave(buktiPembayaranFile.name) || '.pdf';
          if (mime.startsWith('image/') || /\.jpe?g|\.png/i.test(buktiPembayaranFile.name)) {
            try {
              setSaveProgress('Mengubah gambar bukti pembayaran ke PDF...');
              bytes = await convertImageToPdf(bytes, mime);
              mime = 'application/pdf';
              paymentExt = '.pdf';
            } catch (convErr) {
              console.warn('Gagal mengubah bukti pembayaran ke PDF:', convErr);
            }
          }
          
          const cleanPaymentName = getCleanOriginalName(buktiPembayaranFile.name);
          const lastDotPayment = cleanPaymentName.lastIndexOf('.');
          const namePartPayment = lastDotPayment !== -1 ? cleanPaymentName.substring(0, lastDotPayment) : cleanPaymentName;
          let finalName = `${namePartPayment}${paymentExt}`;
          
          const uploadResult = await uploadFileToFolder(finalName, mime, bytes, folderBuktiBayarId);
          finalBuktiPembayaran = uploadResult;
          finalFiles.push({
            url: uploadResult.url,
            name: uploadResult.name,
            isBuktiPembayaran: true
          });
        } else if (buktiPembayaranDrive) {
          finalBuktiPembayaran = buktiPembayaranDrive;
          if (!finalFiles.some(f => f.url === buktiPembayaranDrive.url)) {
            finalFiles.push({
              url: buktiPembayaranDrive.url,
              name: buktiPembayaranDrive.name,
              isBuktiPembayaran: true
            });
          }
        }

        // 6. Upload Petty Cash LPJ file to dedicated Petty Cash directory if isPettyCash is true
        if (isPettyCash) {
          if (pettyCashLocalFile) {
            setSaveProgress('Membuat/Mencari folder Laporan Pertanggungjawaban Petty Cash...');
            const pchyHierarchyId = await getOrCreatePettyCashFolderHierarchy(
              token,
              pettyCashCustodian,
              yearStr,
              monthStr,
              dayStr
            );
            
            setSaveProgress(`Mengunggah berkas Laporan Petty Cash: ${pettyCashLocalFile.name}...`);
            let pchyBytes = new Uint8Array(await pettyCashLocalFile.arrayBuffer());
            let pchyMime = pettyCashLocalFile.type || 'application/octet-stream';
            
            let pchyExt = getFileExtensionForSave(pettyCashLocalFile.name) || '.pdf';
            if (pchyMime.startsWith('image/') || /\.jpe?g|\.png/i.test(pettyCashLocalFile.name)) {
              try {
                setSaveProgress('Mengubah gambar laporan petty cash ke PDF...');
                pchyBytes = await convertImageToPdf(pchyBytes, pchyMime);
                pchyMime = 'application/pdf';
                pchyExt = '.pdf';
              } catch (convErr) {
                console.warn('Gagal mengubah berkas laporan petty cash ke PDF:', convErr);
              }
            }
            
            let pchyFinalName = `Laporan Petty Cash - ${pettyCashCustodian.trim()} (${tanggal})${pchyExt}`;
            
            const pchyUploadResult = await uploadFileToFolder(pchyFinalName, pchyMime, pchyBytes, pchyHierarchyId);
            finalPettyCashFile = pchyUploadResult;
            
            finalFiles.push({
              url: pchyUploadResult.url,
              name: pchyUploadResult.name,
              docType: 'petty_cash_report'
            });
          } else if (pettyCashDriveFile) {
            finalPettyCashFile = pettyCashDriveFile;
            finalFiles.push({
              url: pettyCashDriveFile.url,
              name: pettyCashDriveFile.name,
              docType: 'petty_cash_report'
            });
          }
        }
      } else {
        // If Google Drive is not connected or token is falsy, preserve existing files, payment proof and petty cash
        if (initialSubmission) {
          finalFiles = initialSubmission.googleDriveFiles || [];
          finalBuktiPembayaran = initialSubmission.buktiPembayaran || undefined;
          finalPettyCashFile = initialSubmission.pettyCashFile || undefined;
        }
      }

      // Extract the first non-form attachment link as the legacy single-file fallback URL
      const firstRealAttachment = finalFiles.find(f => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran && f.docType !== 'petty_cash_report');
      const finalFileUrl = firstRealAttachment ? firstRealAttachment.url : (finalFiles.length > 0 ? finalFiles[0].url : '');
      const finalFileName = firstRealAttachment ? firstRealAttachment.name : (finalFiles.length > 0 ? finalFiles[0].name : '');

      const cleanedItems = items.map(item => ({
        ...item,
        total: Number(item.total) || 0
      }));

      // Ensure the Lunas status is determined strictly by the presence of a payment proof document
      // uploaded on the dedicated "bukti pembayaran" uploader menu.
      const isLunas = !!(
        finalBuktiPembayaran ||
        buktiPembayaranFile ||
        buktiPembayaranDrive
      );

      const payload: Submission = {
        id: id || `sub-${Date.now()}`,
        lokasi,
        tanggal,
        jenisPengajuan,
        kode,
        dibayarkanKepada,
        dibayarkanDengan,
        status: isLunas ? 'Lunas' : 'Belum Lunas',
        notes,
        
        // Save Invoice properties
        isInvoice,
        invoiceNumber,
        invoiceDate,
        invoiceAmount: invoiceAmount !== '' ? Number(invoiceAmount) : undefined,

        // Save Petty Cash properties
        isPettyCash,
        pettyCashCustodian: isPettyCash ? pettyCashCustodian : undefined,
        pettyCashFile: isPettyCash ? finalPettyCashFile : undefined,

        googleDriveFileUrl: finalFileUrl,
        googleDriveFileName: finalFileName,
        googleDriveFiles: finalFiles,
        buktiPembayaran: finalBuktiPembayaran,
        dibuatOleh,
        disetujuiOleh,
        diverifikasiOleh,
        diverifikasiJabatan,
        disetujuiOleh2,
        disetujuiJabatan2,
        dibukukanOleh,
        dibukukanJabatan,
        items: cleanedItems,
        createdAt: initialSubmission ? initialSubmission.createdAt : new Date().toISOString()
      };

      setSaveProgress('Menyimpan data transaksi ke database Firestore...');
      await onSave(payload);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'UNAUTHORIZED_DRIVE_TOKEN' || (err.message && err.message.includes('UNAUTHORIZED_DRIVE_TOKEN'))) {
        setIsDriveConnected(false);
        setGoogleDriveToken(null);
        setValidationError('Gagal menyinkronkan berkas ke Google Drive: Sesi Google Drive Anda telah kedaluwarsa atau tidak sah. Silakan hubungkan ulang Google Drive Anda melalui tombol "Hubungkan Google Drive Aman" di bagian bawah formulir ini, lalu klik Simpan kembali.');
      } else {
        setValidationError(err.message || 'Sesuatu yang salah terjadi saat memproses dokumen.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-205 shadow-sm overflow-hidden">
      {/* Top Gold Corporate Accent Line on Form Card */}
      <div className="h-[3px] border-header-gradient w-full"></div>
      
      {/* Form Header */}
      <div className="px-6 py-5.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onCancel}
            id="btn-form-back"
            className="p-2 hover:bg-stone-150 border border-transparent hover:border-stone-250 text-stone-550 hover:text-stone-900 rounded-xl transition cursor-pointer shadow-3xs"
          >
            <ArrowLeft size={17} />
          </button>
          <h2 className="text-base sm:text-lg font-black font-display text-stone-900 uppercase tracking-wide">
            {initialSubmission ? 'Edit Data Pengajuan HO' : 'Input Pengajuan Baru'}
          </h2>
        </div>
        <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider font-extrabold select-none">
          {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {validationError && (
          <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl flex items-start gap-2 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        {/* ✨ AI RECEIPT SCANNER ZONE */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/40 p-5 rounded-2xl border border-amber-200/80 shadow-3xs space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-amber-600 animate-pulse" />
                <h4 className="text-sm font-black font-display text-amber-900 uppercase tracking-wide">
                  Pindai Struk / Kwitansi dengan AI
                </h4>
              </div>
              <p className="text-xs text-amber-850">
                Unggah berkas kwitansi digital (format <b>PDF</b> atau <b>Gambar JPG/PNG</b>). AI akan mengekstrak tanggal, deskripsi, keterangan, nominal, debit/kredit, serta saldo secara otomatis!
              </p>
            </div>
            {isScanning && (
              <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-amber-200 shrink-0">
                <Loader2 size={11} className="animate-spin" /> Menganalisis...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-8">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-amber-300 hover:border-amber-400 bg-white/70 hover:bg-white text-[#6c5513] hover:text-[#52400a] rounded-xl py-6 px-4 cursor-pointer transition text-center group">
                <FileUp size={28} className="text-amber-500 group-hover:scale-105 transition mb-2" />
                <span className="text-xs font-bold">Pilih atau Seret Dokumen Struk / Kwitansi</span>
                <span className="text-[10px] text-stone-400 mt-1">PDF, JPG, JPEG, atau PNG (Maks 15 MB)</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={handleAiScanFile}
                  disabled={isScanning}
                />
              </label>
            </div>

            <div className="md:col-span-4 space-y-2">
              <div className="bg-white/80 p-3.5 rounded-xl border border-amber-200/60 shadow-4xs text-xs space-y-2 h-full flex flex-col justify-center">
                <div className="text-amber-900 font-bold flex items-center gap-1">
                  💡 Tips Efektif
                </div>
                <p className="text-[11px] text-amber-800/80 leading-relaxed">
                  Gunakan foto yang cerah dan teks yang terbaca jelas agar AI dapat mendeteksi tanggal, keterangan, atau baris debit/kredit dengan akurat.
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {scanError && (
            <div className="p-3 bg-red-50 border border-red-150 text-red-750 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Success Message / Summary Badge */}
          {scanSuccess && scanResultJson && (
            <div className="p-4 bg-amber-50/20 border border-amber-200/60 rounded-xl text-xs space-y-3 font-sans shadow-4xs animate-fade-in">
              <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
                <div className="text-[#654d0c] font-black uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600" />
                  Struk Berhasil Diproses AI!
                </div>
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md">
                  Form Terisi Otomatis
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-stone-650">
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase font-mono">📅 Tanggal</span>
                  <span className="font-bold text-stone-800">{scanResultJson.tanggal || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase font-mono">👤 Merchant/Penerima</span>
                  <span className="font-bold text-stone-800 truncate block">{scanResultJson.deskripsi || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase font-mono">💵 Total Nominal</span>
                  <span className="font-bold text-amber-800 font-mono">
                    Rp {new Intl.NumberFormat('id-ID').format(scanResultJson.nominal || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase font-mono">📇 Ringkasan</span>
                  <span className="font-semibold text-stone-700 truncate block">{scanResultJson.keterangan || '-'}</span>
                </div>
              </div>

              {scanResultJson.items && scanResultJson.items.length > 0 && (
                <div className="pt-2 border-t border-amber-200/30">
                  <div className="text-[10px] text-amber-900/80 font-bold uppercase tracking-wider mb-1.5">
                    Rincian Item Yang Diekstrak ({scanResultJson.items.length})
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px] bg-white/60 p-2 rounded-lg border border-amber-200/30">
                    {scanResultJson.items.map((it: any, idxOr: number) => (
                      <div key={idxOr} className="flex justify-between items-center text-stone-750 hover:bg-amber-100/30 px-1 py-0.5 rounded transition">
                        <span className="truncate max-w-sm">{it.item} ({it.jumlahVolume || '1 Ls'})</span>
                        <div className="flex gap-2.5 shrink-0 text-stone-500">
                          {it.debit !== undefined && <span className="text-emerald-700 font-bold">D: {it.debit}</span>}
                          {it.kredit !== undefined && <span className="text-rose-700 font-bold">K: {it.kredit}</span>}
                          {it.saldo !== undefined && <span className="text-blue-700 font-extrabold">S: {it.saldo}</span>}
                          <span className="text-stone-900 font-bold font-mono">Rp {new Intl.NumberFormat('id-ID').format(it.total || 0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 1: Form & Metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-stone-50/50 p-5 rounded-2xl border border-stone-200">
          <div className="lg:col-span-4 pb-2 border-b border-stone-200">
            <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500">Form & Identitas</h3>
          </div>

          {/* Lokasi */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Lokasi</label>
            <input
              type="text"
              list="preset-lokasi"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
            />
            <datalist id="preset-lokasi">
              {COMMON_NAMES.lokasi.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>

          {/* Tanggal */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Tanggal Pengajuan</label>
            <input
              type="date"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>

          {/* Jenis Pengajuan */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Jenis Pengajuan</label>
            <input
              type="text"
              list="preset-jenis"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={jenisPengajuan}
              onChange={(e) => setJenisPengajuan(e.target.value)}
            />
            <datalist id="preset-jenis">
              {COMMON_NAMES.jenisPengajuan.map(j => <option key={j} value={j} />)}
            </datalist>
          </div>

          {/* Kode */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-medium text-stone-500">Kode Dokumen</label>
              {isManualKode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsManualKode(false);
                    const compCode = (userProfile?.companyDetails?.code || userProfile?.companyId || 'NMSA').toUpperCase();
                    const autoKode = generateAutoKode(tanggal, compCode, submissions, id);
                    if (autoKode) {
                      setKode(autoKode);
                    }
                  }}
                  className="text-[10px] text-amber-600 hover:text-amber-700 font-bold flex items-center gap-0.5"
                >
                  <Sparkles size={11} className="text-amber-500" />
                  Reset Otomatis
                </button>
              )}
            </div>
            <input
              type="text"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 font-mono"
              value={kode}
              onChange={(e) => {
                setKode(e.target.value);
                setIsManualKode(true);
              }}
            />
          </div>

          {/* Dibayarkan Kepada */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-stone-500 mb-1">Dibayarkan Kepada (Penerima)</label>
            <input
              type="text"
              list="preset-penerima"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              placeholder="Masukkan nama penerima..."
              value={dibayarkanKepada}
              onChange={(e) => setDibayarkanKepada(e.target.value)}
            />
            <datalist id="preset-penerima">
              {COMMON_NAMES.penerima.map(p => <option key={p} value={p} />)}
            </datalist>
            
            {/* Quick Presets row */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-[10px] text-stone-400 self-center">Preset:</span>
              {COMMON_NAMES.penerima.map((p) => (
                <button
                  type="button"
                  key={p}
                  className="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-0.5 rounded transition"
                  onClick={() => setDibayarkanKepada(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Dibayarkan Dengan */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Metode Bayar</label>
            <select
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={dibayarkanDengan}
              onChange={(e) => {
                const method = e.target.value as PaymentMethod;
                setDibayarkanDengan(method);
              }}
            >
              <option value="Cek/Transfer">Cek / Transfer</option>
              <option value="Tunai">Tunai</option>
            </select>
          </div>

          {/* Status Pembayaran (Auto-Calculated Badge based on proof upload) */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Status Pembayaran</label>
            <div className="w-full bg-stone-50 border border-stone-200 rounded-lg py-1.5 px-3 text-sm flex items-center justify-between min-h-[38px]">
              <span className="font-medium text-stone-500 text-xs">Auto-System</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${
                (buktiPembayaranFile || buktiPembayaranDrive) 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' 
                  : 'bg-amber-50 text-[#a58421] border border-amber-250'
              }`}>
                {(buktiPembayaranFile || buktiPembayaranDrive) ? 'Lunas' : 'Belum Lunas'}
              </span>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Status ditentukan berdasarkan bukti pembayaran.</p>
          </div>

          {/* Catatan / Notes */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-stone-500 mb-1">Catatan Tambahan (Keterangan/Note)</label>
            <input
              type="text"
              placeholder="Catatan di bagian bawah formulir..."
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* SECTION KLASIFIKASI TRANSAKSI UNIFIKASI */}
        <div className="border border-stone-200/80 rounded-2xl p-5 space-y-5 bg-stone-50/25">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-xs font-black uppercase font-mono tracking-wider text-stone-600 flex items-center gap-1.5">
                <Sparkles size={14} className="text-gold-dynamic animate-pulse" />
                Klasifikasi Jenis Transaksi
              </h3>
              <p className="text-[11px] text-stone-400 font-medium">Tentukan klasifikasi khusus transaksi ini untuk pemrosesan rekapitulasi, integrasi berkas LPJ lapangan, atau invoice secara teratur.</p>
            </div>

            {/* Selector Options (Dropdown & Buttons) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Dropdown Menu for extensible future options */}
              <select
                className="px-3.5 py-1.5 bg-white border border-stone-150 rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-400 cursor-pointer shadow-3xs"
                value={isInvoice ? 'invoice' : isPettyCash ? 'petty_cash' : 'standard'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'standard') {
                    setIsInvoice(false);
                    setInvoiceNumber('');
                    setInvoiceDate('');
                    setIsPettyCash(false);
                    setPettyCashCustodian('');
                    setPettyCashLocalFile(null);
                  } else if (val === 'invoice') {
                    setIsInvoice(true);
                    setIsPettyCash(false);
                    setPettyCashCustodian('');
                    setPettyCashLocalFile(null);
                  } else if (val === 'petty_cash') {
                    setIsInvoice(false);
                    setInvoiceNumber('');
                    setInvoiceDate('');
                    setIsPettyCash(true);
                  }
                }}
              >
                <option value="standard">📁 Transaksi Standar / Umum</option>
                <option value="invoice">📄 Tagihan / Invoice Vendor</option>
                <option value="petty_cash">🪙 Petty Cash Lapangan</option>
              </select>

              {/* Quick Choice Buttons for rapid clicking */}
              <div className="inline-flex rounded-xl bg-stone-100 p-0.5 border border-stone-200/60 shadow-3xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsInvoice(false);
                    setInvoiceNumber('');
                    setInvoiceDate('');
                    setIsPettyCash(false);
                    setPettyCashCustodian('');
                    setPettyCashLocalFile(null);
                  }}
                  className={`px-3 py-1 text-[10.5px] font-bold rounded-lg transition-all duration-155 cursor-pointer ${
                    !isInvoice && !isPettyCash
                      ? 'bg-white text-stone-900 shadow-3xs'
                      : 'text-stone-500 hover:text-stone-850'
                  }`}
                >
                  Standar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsInvoice(true);
                    setIsPettyCash(false);
                    setPettyCashCustodian('');
                    setPettyCashLocalFile(null);
                  }}
                  className={`px-3 py-1 text-[10.5px] font-bold rounded-lg transition-all duration-155 cursor-pointer ${
                    isInvoice
                      ? 'bg-white text-amber-600 shadow-3xs'
                      : 'text-stone-500 hover:text-stone-850'
                  }`}
                >
                  Invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsInvoice(false);
                    setInvoiceNumber('');
                    setInvoiceDate('');
                    setIsPettyCash(true);
                  }}
                  className={`px-3 py-1 text-[10.5px] font-bold rounded-lg transition-all duration-155 cursor-pointer ${
                    isPettyCash
                      ? 'bg-white text-violet-750 shadow-3xs'
                      : 'text-stone-500 hover:text-stone-850'
                  }`}
                >
                  Petty Cash
                </button>
              </div>
            </div>
          </div>

          {/* Conditional Content rendering */}
          {isInvoice && (
            <div className="space-y-4 pt-4 border-t border-stone-200/60 animate-fade-in">
              <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <Sparkles size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Transaksi Berjenis Invoice Aktif</span>
                  <p className="text-stone-550">Sistem akan otomatis merekap transaksi ini berdasarkan <strong>Kode Dokumen</strong> dan <strong>Tanggal Transaksi</strong> yang diinput di atas. Tidak memerlukan pengisian ganda yang membingungkan!</p>
                </div>
              </div>

              {/* Dedicated Upload Button and status specifically for Bukti/Dokumen Invoice */}
              <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shadow-3xs">
                <div className="flex items-center gap-1.5 justify-start text-[11.5px] font-mono font-black uppercase tracking-wider text-stone-700">
                  <FileText size={13} className="text-amber-500" />
                  <span>Lampiran Dokumen / Nota Invoice Resmi Vendor</span>
                  <span className="text-rose-500 font-extrabold">*</span>
                </div>

                {(() => {
                  const matched = fileItems.find((itm) => itm.docType === 'invoice_vendor');
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                      <div>
                        {matched ? (
                          <div className="p-3 bg-emerald-50/20 border border-emerald-250 rounded-xl flex items-center justify-between gap-3 shadow-3xs">
                            <div className="min-w-0 flex-1">
                              <span className="block text-xs font-bold text-emerald-800 truncate" title={matched.name}>
                                {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[8px] text-emerald-600 font-bold uppercase tracking-widest font-mono mt-0.5">
                                {matched.isDrive ? '● Terunggah di Google Drive' : '● File Lokal (Belum Disimpan)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {matched.isDrive && matched.url && (
                                <a
                                  href={matched.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-1 px-2.5 rounded-lg font-bold transition flex items-center shadow-3xs"
                                >
                                  Buka
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteFileItem(matched.id)}
                                className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 p-1.5 rounded-lg font-bold transition shadow-3xs cursor-pointer"
                                title="Hapus berkas invoice"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-stone-400 italic bg-stone-100/50 p-3 rounded-xl border border-stone-200 border-dashed">
                            Faktur/Berkas invoice belum terpilih. Silakan klik tombol di samping kanan untuk memilih berkas lampiran invoice resmi.
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col">
                        {!matched && (
                          <label className="cursor-pointer text-xs text-center border border-dashed border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 text-[#6c5513] hover:text-[#52400a] font-extrabold rounded-xl py-4 px-4 transition flex items-center justify-center gap-2 shadow-3xs">
                            <Cloud size={15} className="text-[#D4AF37]" />
                            Klik untuk Pilih & Upload Lampiran Invoice
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                              onChange={(e) => handleSpecificFileUpload(e, 'invoice_vendor')}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {isPettyCash && (
            <div className="space-y-4 pt-4 border-t border-stone-200/60 animate-fade-in">
              <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-[11px] text-violet-800 flex items-start gap-2">
                <Sparkles size={14} className="text-violet-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Transaksi Berjenis Pengisian Petty Cash Aktif</span>
                  <p className="text-stone-550">Sistem akan mengelompokkan voucher ini ke dalam rekapitulasi real-time Petty Cash lapangan pertunjukan berdasarkan personil yang berhak.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">
                    Nama Pemegang Petty Cash (Custodian) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required={isPettyCash}
                    placeholder="Contoh: Muhammad Akbar, Nurul Izza..."
                    className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 font-semibold"
                    value={pettyCashCustodian}
                    onChange={(e) => setPettyCashCustodian(e.target.value)}
                  />
                </div>
              </div>

              {/* Dedicated Upload space for Laporan Pertanggungjawaban / Laporan Periode Petty Cash */}
              <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shadow-3xs">
                <div className="flex items-center gap-1.5 justify-start text-[11px] font-mono font-bold uppercase tracking-wider text-stone-700">
                  <Coins size={13} className="text-violet-500" />
                  <span>Berkas Laporan Pertanggungjawaban Petty Cash Lapangan</span>
                  <span className="text-rose-500 font-extrabold">*</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                  <div>
                    {pettyCashLocalFile || pettyCashDriveFile ? (
                      <div className="p-3 bg-emerald-50/20 border border-emerald-250 rounded-xl flex items-center justify-between gap-3 shadow-3xs">
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-emerald-800 truncate" title={pettyCashLocalFile ? pettyCashLocalFile.name : pettyCashDriveFile?.name}>
                            {pettyCashLocalFile ? pettyCashLocalFile.name : pettyCashDriveFile?.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[8px] text-emerald-600 font-bold uppercase tracking-widest font-mono mt-0.5">
                            {pettyCashLocalFile ? '● File Berkas Baru (Belum Disimpan)' : '● Terunggah di Google Drive'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!pettyCashLocalFile && pettyCashDriveFile?.url && (
                            <a
                              href={pettyCashDriveFile.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 hover:bg-emerald-100/55 rounded-lg text-emerald-700 transition cursor-pointer"
                              title="Buka Berkas di Google Drive"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (pettyCashLocalFile) {
                                setPettyCashLocalFile(null);
                              } else if (pettyCashDriveFile) {
                                handleDeletePettyCashDriveFile();
                              }
                            }}
                            className="p-1.5 hover:bg-rose-150 rounded-lg text-rose-600 transition cursor-pointer"
                            title="Hapus Berkas Laporan"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-stone-400 italic bg-stone-100/50 p-3 rounded-xl border border-stone-200 border-dashed">
                        LPJ Berkas belum terunggah. Silakan klik tombol di samping kanan untuk menyertakan pindaian/Laporan resmi.
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <label className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 hover:bg-stone-50 border border-stone-250 text-stone-850 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer select-none">
                      <FileUp size={13} className="text-violet-500" />
                      <span>{pettyCashLocalFile || pettyCashDriveFile ? 'Ganti File Laporan' : 'Pilih File Laporan'}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setPettyCashLocalFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <p className="text-[10px] text-stone-400 leading-relaxed font-mono font-medium">
                  Berkas LPJ dikompresi serta diletakkan pada folder Google Drive:
                  <code className="block mt-1 p-1 bg-stone-50 border border-stone-150 text-[9.5px] text-violet-950 font-mono rounded-lg">
                    Voucher-APP &gt; Petty Cash &gt; [Pemegang Petty Cash] &gt; [Tahun] &gt; [Bulan] &gt; (LPJ File)
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SECTION GOOGLE DRIVE UPLOAD */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4 bg-stone-50/20">
          <div className="flex items-center justify-between border-b border-stone-200 pb-2">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500 flex items-center gap-1.5">
                <Cloud size={14} className="text-[#D4AF37]" />
                File Pendukung Transaksi (Google Drive)
              </h3>
              <p className="text-xs text-stone-400">Unggah file/berkas pendukung atau nota pendukung transaksi langsung ke cloud Google Drive Anda.</p>
            </div>
            
            {isDriveConnected && (
              <button
                type="button"
                onClick={() => {
                  setGoogleDriveToken(null);
                  setIsDriveConnected(false);
                  setGoogleDriveFileUrl('');
                  setGoogleDriveFileName('');
                }}
                className="text-[10px] font-mono font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition"
              >
                Disconnect Drive
              </button>
            )}
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 text-rose-750 border border-rose-100 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {!isDriveConnected ? (
            <DriveAccountsManager onConnectionChange={setIsDriveConnected} />
          ) : (
            <div className="space-y-6">
              {isInvoice && (
                <>
                  {/* Segmented control to choose between separate vs merged upload */}
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/85 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                    <div className="space-y-0.5">
                      <span className="block text-xs font-bold text-stone-800">Format Dokumen Transaksi Utama:</span>
                      <p className="text-[10px] text-stone-500">Apakah dokumen Anda terpisah atau sudah digabung menjadi 1 file utuh?</p>
                    </div>
                    <div className="flex gap-1 bg-stone-200/60 p-1 rounded-lg self-start sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsMergedMethod(false)}
                        className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                          !isMergedMethod
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-500 hover:text-stone-850'
                        }`}
                      >
                        📂 9 Dokumen Terpisah
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMergedMethod(true)}
                        className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                          isMergedMethod
                            ? 'bg-[#917118] text-white shadow-xs'
                            : 'text-stone-500 hover:text-stone-850'
                        }`}
                      >
                        📄 1 Berkas Gabungan (Utuh)
                      </button>
                    </div>
                  </div>

                  {isMergedMethod ? (
                    /* Beautiful block for 1 Merged PDF File */
                    <div className="space-y-3">
                      <span className="block text-[11px] font-mono font-bold text-[#917118] uppercase tracking-wider">
                        Berkas Gabungan Dokumen Utama (PO, LHV, B/L, Cargo dll. dalam 1 PDF)
                      </span>
                      {(() => {
                        const matched = fileItems.find((itm) => itm.docType === 'merged_all');
                        return (
                          <div
                            className={`p-5 border rounded-2xl transition duration-150 flex flex-col justify-between min-h-[145px] ${
                              matched
                                ? 'border-emerald-250 bg-emerald-50/20'
                                : 'border-stone-250 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 bg-white'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex justify-between items-start gap-1">
                                <div>
                                  <span className="text-xs font-bold text-stone-800">
                                    Berkas Gabungan Utama (Kompleks)
                                  </span>
                                  <p className="text-[10px] text-stone-500 mt-0.5">
                                    Unggah terus 1 berkas PDF utuh hasil penggabungan (Lengkapi PO, LHV, Draft Survei, B/L, Cargo Manifest, DLL).
                                  </p>
                                </div>
                                {matched && (
                                  <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                                    Ada
                                  </span>
                                )}
                              </div>
                              
                              {matched ? (
                                <div className="space-y-1 mt-2.5 bg-white/60 p-2.5 rounded-lg border border-stone-200">
                                  <p className="text-[10px] text-stone-600 truncate font-mono uppercase" title={matched.name}>
                                    {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                                  </p>
                                  {matched.isDrive ? (
                                    <span className="inline-block text-[8px] text-amber-600 font-extrabold uppercase tracking-wide">
                                      ● Drive Cloud
                                    </span>
                                  ) : (
                                    <span className="inline-block text-[8px] text-blue-600 font-extrabold uppercase tracking-wide">
                                      ● Lokal (Belum Simpan)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[10px] text-stone-400 italic mt-1 bg-stone-50 p-2 rounded-lg border border-stone-150 border-dashed">
                                  Belum ada berkas gabungan yang dimasukkan. Silakan pilih berkas PDF gabungan Anda di bawah.
                                </p>
                              )}
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-stone-150/50 flex items-center justify-between">
                              {matched ? (
                                <div className="flex gap-1.5 items-center w-full">
                                  {matched.isDrive && matched.url && (
                                    <a
                                      href={matched.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-1 px-2.5 rounded-md font-bold transition flex items-center gap-0.5"
                                    >
                                      Buka File
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFileItem(matched.id)}
                                    className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1 px-2.5 rounded-md font-bold transition flex items-center gap-0.5 ml-auto"
                                  >
                                    <Trash2 size={10} />
                                    Hapus File
                                  </button>
                                </div>
                              ) : (
                                <label className="cursor-pointer text-[10px] text-[#917118] hover:text-stone-850 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/35 py-1.5 px-3 rounded-lg transition font-semibold block text-center w-full">
                                  Pilih Berkas Gabungan
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                                    onChange={(e) => handleSpecificFileUpload(e, 'merged_all')}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* Grid 9 required documents for coal transactions */
                    <div className="space-y-3">
                      <span className="block text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                        {isInvoice ? 'Berkas Dokumen Pendukung Tambahan (Batubara)' : '9 Dokumen Pendukung Transaksi Wajib / Utama (Batubara)'}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {REQUIRED_TRANSACTION_DOCS.filter(doc => isInvoice ? doc.key !== 'invoice_vendor' : true).map((doc) => {
                          const matched = fileItems.find((itm) => itm.docType === doc.key);
                          return (
                            <div
                              key={doc.key}
                              className={`p-3 border rounded-xl transition duration-150 flex flex-col justify-between min-h-[120px] ${
                                matched
                                  ? 'border-emerald-250 bg-emerald-50/20'
                                  : 'border-stone-200 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 bg-white'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex justify-between items-start gap-1">
                                  <span className="text-xs font-bold text-stone-800 line-clamp-2" title={doc.fullName}>
                                    {doc.fullName}
                                  </span>
                                  {matched && (
                                    <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                                      Ada
                                    </span>
                                  )}
                                </div>
                                
                                {matched ? (
                                  <div className="space-y-1 mt-1">
                                    <p className="text-[10px] text-stone-600 truncate font-mono uppercase" title={matched.name}>
                                      {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                                    </p>
                                    {matched.isDrive ? (
                                      <span className="inline-block text-[8px] text-amber-600 font-extrabold uppercase tracking-wide">
                                        ● Drive Cloud
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[8px] text-blue-600 font-extrabold uppercase tracking-wide">
                                        ● Lokal (Belum Simpan)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-stone-400 italic">Berkas belum dilampirkan</p>
                                )}
                              </div>

                              <div className="mt-2.5 pt-2 border-t border-stone-150/50 flex items-center justify-between">
                                {matched ? (
                                  <div className="flex gap-1.5 items-center w-full">
                                    {matched.isDrive && matched.url && (
                                      <a
                                        href={matched.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-0.5 px-2 rounded-md font-bold transition flex items-center gap-0.5"
                                      >
                                        Buka
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFileItem(matched.id)}
                                      className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-0.5 px-2 rounded-md font-bold transition flex items-center gap-0.5 ml-auto"
                                    >
                                      <Trash2 size={10} />
                                      Hapus
                                    </button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-[10px] text-[#917118] hover:text-stone-850 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/35 py-1 px-2.5 rounded-lg transition font-semibold block text-center w-full">
                                    Pilih Berkas / Upload File
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                                      onChange={(e) => handleSpecificFileUpload(e, doc.key)}
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* General Attachments */}
              <div className={`${isInvoice ? 'pt-4 border-t border-stone-200/80' : ''} space-y-3`}>
                <span className="block text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                  Lampiran Pendukung Lainnya (General Attachments)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* General file selector */}
                  <div className="border border-dashed border-stone-300 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-white min-h-[110px]">
                    <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center py-2 space-y-1 hover:bg-stone-50/50 rounded-lg transition duration-250">
                      <Cloud size={20} className="text-stone-400" />
                      <span className="text-xs font-bold text-stone-700">Pilih Berkas Lampiran Lain</span>
                      <span className="text-[9px] text-stone-400">PDF, Excel, Word, Image, dll.</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                        multiple
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  {/* List of general attachments */}
                  <div className="flex flex-col p-4 bg-white border border-stone-200 rounded-xl max-h-[180px] overflow-y-auto">
                    <span className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                      Daftar Lampiran Lain ({fileItems.filter(f => !f.docType).length})
                    </span>
                    {fileItems.filter(f => !f.docType).length > 0 ? (
                      <div className="space-y-1.5">
                        {fileItems
                          .filter((f) => !f.docType)
                          .map((item, idx) => (
                            <div
                              key={item.id}
                              className="p-1.5 border border-stone-200 rounded-lg bg-stone-50/50 flex items-center justify-between gap-1.5 text-[11px]"
                            >
                              <span className="truncate font-medium text-stone-700 flex-1" title={item.name}>
                                {idx + 1}. {item.name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {item.isDrive && item.url && (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#917118] border border-[#D4AF37]/30 py-0.5 px-1.5 rounded text-[9px] font-bold"
                                  >
                                    Buka
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFileItem(item.id)}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 p-1 rounded-md"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs italic text-stone-400 my-auto text-center">Tidak ada lampiran lain.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Multi Google Drive Accounts Manager */}
              <div className="border-t border-stone-200 pt-5 mt-6">
                <DriveAccountsManager onConnectionChange={setIsDriveConnected} />
              </div>
            </div>
          )}

          {/* Section: Dedicated Bukti Pembayaran */}
          {isDriveConnected && (
            <div className="mt-6 pt-5 border-t border-stone-200">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold uppercase font-mono tracking-wider text-[#917118] flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#D4AF37]" />
                    Bukti Pembayaran Khusus (Transfer Proof)
                  </h4>
                  <p className="text-[11px] text-stone-400">Tombol khusus untuk mengunggah bukti pembayaran hasil transfer kas/bank.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Upload Button */}
                <div className="border border-dashed border-[#D4AF37]/50 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-amber-50/10 hover:bg-amber-50/25 transition">
                  <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center py-2 space-y-1">
                    <Cloud size={20} className="text-[#D4AF37]" />
                    <span className="text-xs font-bold text-stone-700">Upload Bukti Pembayaran</span>
                    <span className="text-[10px] text-stone-400">Pilih file bukti transfer bank</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setBuktiPembayaranFile(e.target.files[0]);
                          setBuktiPembayaranDrive(null); // overwrite existing
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Display Current Bukti Pembayaran */}
                <div className="flex flex-col p-4 bg-white border border-stone-200 rounded-xl justify-center min-h-[90px]">
                  <span className="block text-[10px] font-mono font-bold text-[#917118] uppercase tracking-wider mb-2">
                    Bukti Pembayaran Terpilih
                  </span>
                  {buktiPembayaranFile ? (
                    <div className="p-2 border border-[#D4AF37]/30 rounded-lg bg-amber-50/10 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold text-stone-800 truncate" title={buktiPembayaranFile.name}>
                          {buktiPembayaranFile.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[8.5px] text-blue-600 font-semibold uppercase tracking-wider mt-0.5">
                          ● Lokal (Menunggu Simpan)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBuktiPembayaranFile(null)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 p-1 rounded-md transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : buktiPembayaranDrive ? (
                    <div className="p-2 border border-green-200 rounded-lg bg-green-50/20 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold text-stone-800 truncate" title={buktiPembayaranDrive.name}>
                          {buktiPembayaranDrive.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[8.5px] text-emerald-600 font-semibold uppercase tracking-wider mt-0.5">
                          ● Terunggah di Google Drive
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {buktiPembayaranDrive.url && (
                          <a
                            href={buktiPembayaranDrive.url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#917118] border border-[#D4AF37]/30 py-1 px-2 rounded-md text-[10px] font-bold transition"
                          >
                            Buka
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={handleDeleteBuktiPembayaran}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 p-1 rounded-md transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <span className="text-xs italic text-stone-400">Belum ada bukti transfer dipilih.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Dynamic Row Items */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500">Item & Transaksi Pengeluaran</h3>
              <p className="text-xs text-stone-450">Tulis deskripsi detail item serta nominal transaksinya.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer hover:text-stone-900 select-none bg-stone-100 hover:bg-stone-200/80 px-3 py-1.5 rounded-lg transition border border-stone-200 shadow-3xs">
                <input
                  type="checkbox"
                  checked={showLedgerCols}
                  onChange={(e) => setShowLedgerCols(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-stone-500 h-3.5 w-3.5 cursor-pointer"
                />
                Kolom Akunting (D/K/Saldo)
              </label>

              <button
                type="button"
                onClick={handleAddItemRow}
                className="flex items-center gap-1.5 text-xs bg-stone-900 hover:bg-stone-850 text-white font-medium px-3 py-1.5 rounded-lg transition"
              >
                <Plus size={14} />
                Tambah Baris Item
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-550 font-mono text-xs uppercase">
                  <th className="py-2 w-10">No</th>
                  <th className="py-2">Item Deskripsi Pengeluaran</th>
                  <th className="py-2 w-32">Jumlah / Volume</th>
                  {showLedgerCols && (
                    <>
                      <th className="py-2 w-32 text-right">Debit (Rp)</th>
                      <th className="py-2 w-32 text-right">Kredit (Rp)</th>
                      <th className="py-2 w-32 text-right">Saldo (Rp)</th>
                    </>
                  )}
                  <th className="py-2 w-44 text-right">Nilai Total (Rp)</th>
                  <th className="py-2 w-44 pl-4">Keterangan Halaman</th>
                  <th className="py-2 w-12 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="py-3 font-mono text-stone-450">{index + 1}</td>
                    
                    {/* Item Name */}
                    <td className="py-3 pr-2">
                      <input
                        type="text"
                        placeholder="Contoh: Biaya Gaji Office Boy dan Satpam Kantor"
                        className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                        value={item.item}
                        onChange={(e) => handleItemChange(index, 'item', e.target.value)}
                      />
                    </td>

                    {/* Volume (e.g. 5 Box, 1 Lot etc.) */}
                    <td className="py-3 pr-2">
                      <input
                        type="text"
                        placeholder="e.g. 5 Box / 1 Bln"
                        className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                        value={item.jumlahVolume}
                        onChange={(e) => handleItemChange(index, 'jumlahVolume', e.target.value)}
                      />
                    </td>

                    {/* Conditional Ledger Columns D/K/S */}
                    {showLedgerCols && (
                      <>
                        {/* Debit */}
                        <td className="py-3 pr-2 text-right">
                          <input
                            type="text"
                            placeholder="0"
                            className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={item.debit ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                handleItemChange(index, 'debit', val === '' ? undefined : parseInt(val, 10));
                              }
                            }}
                          />
                        </td>

                        {/* Kredit */}
                        <td className="py-3 pr-2 text-right">
                          <input
                            type="text"
                            placeholder="0"
                            className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={item.kredit ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                handleItemChange(index, 'kredit', val === '' ? undefined : parseInt(val, 10));
                              }
                            }}
                          />
                        </td>

                        {/* Saldo */}
                        <td className="py-3 pr-2 text-right font-medium">
                          <input
                            type="text"
                            placeholder="0"
                            className="w-full bg-amber-50/50 border border-amber-200/60 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none font-semibold text-stone-800"
                            value={item.saldo ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                handleItemChange(index, 'saldo', val === '' ? undefined : parseInt(val, 10));
                              }
                            }}
                          />
                        </td>
                      </>
                    )}

                    {/* Numeric Rupiah Total */}
                    <td className="py-3 pr-2 text-right">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-mono">Rp</span>
                        <input
                          type="text"
                          placeholder="0"
                          className="w-full bg-white border border-stone-200 rounded-lg py-1.5 pl-8 pr-2 text-right text-sm font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={item.total}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || val === '-' || val === '-0' || /^-?\d+$/.test(val)) {
                              handleItemChange(index, 'total', val);
                            }
                          }}
                        />
                      </div>
                    </td>

                    {/* Column Keterangan */}
                    <td className="py-3 pl-4 pr-2">
                      <input
                        type="text"
                        placeholder="Sesuai nota terlampir"
                        className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                        value={item.keterangan}
                        onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)}
                      />
                    </td>

                    {/* Remove Action */}
                    <td className="py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(index)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Running Totals visual */}
          <div className="flex justify-end p-4 bg-stone-55 border border-stone-200 rounded-xl font-mono text-sm">
            <span className="text-stone-500 font-sans mr-2">Total Gabungan: </span>
            <span className="font-bold text-stone-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
              Rp {new Intl.NumberFormat('id-ID').format(calculatedGrandTotal)}
            </span>
          </div>
        </div>

        {/* SECTION 3: Signatories and Personnel mapping */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4 bg-stone-50/20">
          <div className="border-b border-stone-200 pb-2">
            <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500">Otorisasi & Tanda Tangan</h3>
            <p className="text-xs text-stone-450">Tentukan nama penandatangan untuk kedua format dokumen (Formulir PO maupun Kwitansi Kas).</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Form 1: Dibuat Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Dibuat Oleh (Formulir HO)</label>
              <input
                type="text"
                list="preset-dibuat"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={dibuatOleh}
                onChange={(e) => setDibuatOleh(e.target.value)}
              />
              <datalist id="preset-dibuat">
                {COMMON_NAMES.dibuatOleh.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Form 1: Disetujui Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Oleh (Formulir HO)</label>
              <input
                type="text"
                list="preset-disetujui1"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh}
                onChange={(e) => setDisetujuiOleh(e.target.value)}
              />
              <datalist id="preset-disetujui1">
                {COMMON_NAMES.disetujuiOleh.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Form 2: Diverifikasi Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Diverifikasi Oleh (Formulir Kasir)</label>
              <input
                type="text"
                list="preset-diverifikasi"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={diverifikasiOleh}
                onChange={(e) => setDiverifikasiOleh(e.target.value)}
              />
              <datalist id="preset-diverifikasi">
                {COMMON_NAMES.diverifikasiOleh.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={diverifikasiJabatan}
                onChange={(e) => setDiverifikasiJabatan(e.target.value)}
              />
            </div>

            {/* Form 2: Disetujui Voucher 1 */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Voucher (Dir-Keu)</label>
              <input
                type="text"
                list="preset-disetujui2"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh}
                onChange={(e) => setDisetujuiOleh(e.target.value)}
              />
            </div>

            {/* Form 2: Disetujui Voucher 2 */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Voucher (Dir-Utama)</label>
              <input
                type="text"
                list="preset-disetujuiUtama"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh2}
                onChange={(e) => setDisetujuiOleh2(e.target.value)}
              />
              <datalist id="preset-disetujuiUtama">
                {COMMON_NAMES.disetujuiOleh2.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={disetujuiJabatan2}
                onChange={(e) => setDisetujuiJabatan2(e.target.value)}
              />
            </div>

            {/* Form 2: Dibukukan Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Dibukukan Oleh (Accounting)</label>
              <input
                type="text"
                list="preset-dibukukan"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={dibukukanOleh}
                onChange={(e) => setDibukukanOleh(e.target.value)}
              />
              <datalist id="preset-dibukukan">
                {COMMON_NAMES.dibukukanOleh.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={dibukukanJabatan}
                onChange={(e) => setDibukukanJabatan(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full sm:w-auto px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-750 font-semibold rounded-xl transition disabled:opacity-50"
          >
            Batal
          </button>
          
          <button
            type="submit"
            id="btn-save-submission"
            disabled={isSaving}
            className="w-full sm:w-auto flex flex-col items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 font-bold px-6 py-2.5 rounded-xl transition shadow-xs disabled:opacity-75"
          >
            {isSaving ? (
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-stone-900" />
                  <span className="text-sm font-bold">Sedang Diproses...</span>
                </div>
                {saveProgress && (
                  <span className="text-[10px] text-stone-750 font-mono mt-0.5 select-none animate-pulse max-w-[280px] truncate">
                    {saveProgress}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Save size={18} />
                <span>Simpan Data Pengajuan</span>
              </div>
            )}
          </button>
        </div>
      </form>

      {/* Google Drive File Delete Confirmation Warning Modal */}
      {driveFileToDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertCircle size={24} className="animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-stone-900 tracking-tight">PERINGATAN KERAS</h3>
                <p className="text-xs text-rose-700 font-semibold bg-rose-50/70 p-2.5 rounded-lg border border-rose-100 leading-relaxed">
                  Menghapus berkas lampiran ini melalui aplikasi akan otomatis menghapus berkas fisik tersebut secara permanen dari sistem Google Drive Anda!
                </p>
              </div>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono block">Nama Berkas di Drive</span>
              <span className="text-xs font-bold text-stone-800 break-all block">{driveFileToDelete.name}</span>
            </div>

            {fileToDeleteError && (
              <div className="text-[11px] text-rose-650 font-semibold bg-rose-50 border border-rose-100 p-2.5 rounded-lg flex items-start gap-1.5 leading-relaxed">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{fileToDeleteError}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={fileToDeleteStatus === 'deleting'}
                onClick={driveFileToDelete.onConfirm}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition text-xs shadow-3xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {fileToDeleteStatus === 'deleting' ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-white" />
                    <span>Menghapus Berkas di Google Drive...</span>
                  </>
                ) : (
                  <span>Ya, Hapus Permanen dari Google Drive & Aplikasi</span>
                )}
              </button>

              {fileToDeleteError && (
                <button
                  type="button"
                  onClick={driveFileToDelete.onForceDeleteFromApp}
                  className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-250 font-bold rounded-xl transition text-xs cursor-pointer"
                >
                  Hapus Saja dari Aplikasi (Abaikan Error Drive)
                </button>
              )}

              <button
                type="button"
                disabled={fileToDeleteStatus === 'deleting'}
                onClick={() => {
                  setDriveFileToDelete(null);
                  setFileToDeleteError(null);
                }}
                className="w-full py-2 bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 font-bold rounded-xl transition text-xs cursor-pointer disabled:opacity-50"
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
