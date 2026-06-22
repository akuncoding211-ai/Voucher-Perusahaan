import React, { useState, useEffect } from 'react';
import { Submission } from '../types';
import { 
  loadSubmissionsFromFirestore, 
  saveSubmissionToFirestore, 
  isFirebaseConfigured,
  googleDriveLogin,
  getStoredGoogleDriveToken,
  setGoogleDriveToken,
  getConnectedDrives,
  saveActivityLogToFirestore
} from '../firebase';
import { DriveAccountsManager } from './DriveAccountsManager';
import { formatRupiah, formatDateIndonesian, convertImageToPdf, compressImage } from '../utils';
import { 
  ArrowLeft, 
  UploadCloud, 
  CheckCircle, 
  Search, 
  FileText, 
  X, 
  CreditCard,
  Building,
  Calendar,
  User,
  AlertCircle,
  Clock,
  Filter,
  Check,
  TrendingUp,
  TrendingDown,
  Info,
  CalendarDays,
  Tag,
  Coins,
  MapPin,
  ListFilter,
  SlidersHorizontal,
  Cloud,
  CheckSquare,
  Link
} from 'lucide-react';

interface InputBuktiTransferProps {
  onBack: () => void;
  submissions: Submission[];
  onUpdateSubmissions: (updatedSubmissions: Submission[]) => void;
  userProfile?: any;
}

export const InputBuktiTransfer: React.FC<InputBuktiTransferProps> = ({ 
  onBack, 
  submissions: parentSubmissions, 
  onUpdateSubmissions,
  userProfile
}) => {
  const [localSubmissions, setLocalSubmissions] = useState<Submission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced Filter state variables
  const [filterStatus, setFilterStatus] = useState<'All' | 'Lunas' | 'Belum Lunas'>('Belum Lunas');
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [filterJenis, setFilterJenis] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'tanggal-desc' | 'tanggal-asc' | 'nominal-desc' | 'nominal-asc'>('tanggal-desc');

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; base64: string; fileObject?: File } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successCode, setSuccessCode] = useState('');

  // Google Drive state variables
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');

  // Check Drive connection status on mount and userProfile changes
  useEffect(() => {
    const drives = getConnectedDrives();
    if (drives.length > 0) {
      setIsDriveConnected(true);
    }
  }, []);

  const handleConnectDrive = async () => {
    setErrorText('');
    try {
      const result = await googleDriveLogin();
      if (result.accessToken) {
        setIsDriveConnected(true);
      }
    } catch (err: any) {
      setErrorText(`Gagal menghubungkan Google Drive Anda: ${err.message || err}`);
    }
  };

  // Fetch newest submissions on startup
  useEffect(() => {
    const fetchLatest = async () => {
      setIsLoading(true);
      try {
        if (isFirebaseConfigured()) {
          const freshData = await loadSubmissionsFromFirestore(userProfile?.companyId);
          if (freshData && freshData.length > 0) {
            setLocalSubmissions(freshData);
            onUpdateSubmissions(freshData);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Fallback silent read to local state', err);
      }
      
      // Fallback
      setLocalSubmissions(parentSubmissions.length > 0 ? parentSubmissions : loadFromLocalStorage());
      setIsLoading(false);
    };

    fetchLatest();
  }, [userProfile]);

  const loadFromLocalStorage = (): Submission[] => {
    try {
      const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  // Helper to calculate total for a submission
  const getSubmissionTotal = (sub: Submission): number => {
    return sub.items?.reduce((sum, item) => sum + (Number(item.total) || 0), 0) || 0;
  };

  // ═════════ GOOGLE DRIVE DIR HIERARCHY HELPER ACTIONS ═════════
  const getOrCreateFolder = async (token: string, name: string, parentId: string): Promise<string> => {
    const cleanName = name.trim();
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

  const uploadFileToFolder = async (
    token: string,
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
        throw new Error('UNAUTHORIZED_DRIVE_TOKEN');
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

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file) return;

    setErrorText('');
    
    try {
      const mimeType = file.type || '';
      const isImage = mimeType.startsWith('image/') || /\.jpe?g|\.png/i.test(file.name);
      
      if (isImage) {
        setIsLoading(true);
        setSaveProgress('Mengompresi gambar bukti transfer secara otomatis...');
        
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        const compressed = await compressImage(bytes, mimeType, 1200, 0.7);
        
        // Convert back to compressed File object
        const blob = new Blob([compressed.bytes], { type: compressed.mimeType });
        const compressedFile = new File([blob], file.name, { type: compressed.mimeType });
        
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          if (base64Data) {
            setUploadedFile({
              name: compressedFile.name,
              base64: base64Data,
              fileObject: compressedFile
            });
            setErrorText('');
          }
          setIsLoading(false);
          setSaveProgress('');
        };
        reader.onerror = () => {
          setErrorText('Gagal membaca file hasil kompresi.');
          setIsLoading(false);
          setSaveProgress('');
        };
        reader.readAsDataURL(compressedFile);
      } else {
        // Standard non-image file path (e.g. PDF) or when compression skipped
        if (file.size > 10 * 1024 * 1024) {
          setErrorText('File terlalu besar. Batas ukuran maksimal dokumen PDF adalah 10 MB.');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          if (base64Data) {
            setUploadedFile({
              name: file.name,
              base64: base64Data,
              fileObject: file
            });
            setErrorText('');
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error('File treatment/compression failure:', err);
      setErrorText('Terjadi kesalahan saat memproses file bukti transfer.');
      setIsLoading(false);
      setSaveProgress('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  // Submit and upload the receipt
  const handleSubmitReceipt = async () => {
    if (!selectedSubmission) {
      setErrorText('Harap pilih salah satu pengajuan voucher terlebih dahulu.');
      return;
    }
    if (!uploadedFile) {
      setErrorText('Harap sertakan file/foto bukti transfer terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    setErrorText('');
    setSaveProgress('Memulai validasi lunas...');

    try {
      const cleanJenis = (selectedSubmission.jenisPengajuan || 'Non-Kategori').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      const cleanPenerima = (selectedSubmission.dibayarkanKepada || 'Penerima').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      
      const extIndex = uploadedFile.name.lastIndexOf('.');
      const rawExt = extIndex !== -1 ? uploadedFile.name.substring(extIndex).toLowerCase() : '.pdf';
      const ext = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
      const formattedFileName = `Bukti Pembayaran - (${cleanJenis} - ${cleanPenerima})${ext}`;

      let finalBuktiPembayaran = {
        url: uploadedFile.base64,
        name: formattedFileName
      };

      let finalDriveFiles = [
        ...(selectedSubmission.googleDriveFiles || []).filter(
          f => !f.isBuktiPembayaran
        )
      ];

      const token = getStoredGoogleDriveToken();
      if (token && isDriveConnected) {
        setSaveProgress('Menghubungkan ke layanan Google Drive...');
        
        let yearStr = '';
        let monthStr = '';
        let dayStr = '';

        const parts = (selectedSubmission.tanggal || '').split('-');
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

        const folderCompanyUpper = 'NMSA';

        try {
          // 1. Get or create 'Voucher-APP' under 'root'
          const rootId = 'root';
          setSaveProgress('1/7. Menghubungkan folder utama "Voucher-APP"...');
          const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);

          // 2. Get or create company folder under 'Voucher-APP'
          setSaveProgress(`2/7. Menyusun folder perusahaan "${folderCompanyUpper}"...`);
          const companyFolderId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);

          // 3. Get or create year folder under company folder
          setSaveProgress(`3/7. Menyusun folder tahun "${yearStr}"...`);
          const yearId = await getOrCreateFolder(token, yearStr, companyFolderId);

          // 4. Get or create month folder under year folder
          setSaveProgress(`4/7. Menyusun folder bulan "${monthStr}"...`);
          const monthId = await getOrCreateFolder(token, monthStr, yearId);

          // 5. Get or create day folder under month folder
          setSaveProgress(`5/7. Menyusun folder tanggal "${dayStr}"...`);
          const dayId = await getOrCreateFolder(token, dayStr, monthId);

          // 6. Get or create custom transaction folder under day folder named (Jenis_Pengajuan - Dibayarkan_Kepada)
          const cleanJenisFolder = (selectedSubmission.jenisPengajuan || 'Non-Kategori').trim().replace(/[\/\\?%*:|"<>.]/g, '');
          const cleanPenerimaFolder = (selectedSubmission.dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
          const txFolderName = `${cleanJenisFolder} - ${cleanPenerimaFolder}`;

          setSaveProgress(`6/7. Membuka folder transaksi "${txFolderName}"...`);
          const targetFolderId = await getOrCreateFolder(token, txFolderName, dayId);

          // 7. Get or create folder "Bukti Pembayaran" inside targetFolderId
          setSaveProgress('7/7. Membuka folder khusus "Bukti Pembayaran"...');
          const folderBuktiBayarId = await getOrCreateFolder(token, 'Bukti Pembayaran', targetFolderId);

          // Convert bytes and handle image to pdf transformation
          setSaveProgress('Menyiapkan file bukti pembayaran...');
          let fileBytes: Uint8Array;
          let mime = 'application/octet-stream';

          if (uploadedFile.fileObject) {
            fileBytes = new Uint8Array(await uploadedFile.fileObject.arrayBuffer());
            mime = uploadedFile.fileObject.type || 'application/octet-stream';
          } else {
            // Parse base64 fallback
            const base64Content = uploadedFile.base64.split(',')[1];
            const binaryString = window.atob(base64Content);
            fileBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              fileBytes[i] = binaryString.charCodeAt(i);
            }
            if (uploadedFile.base64.startsWith('data:')) {
              mime = uploadedFile.base64.split(';')[0].split(':')[1];
            }
          }

          let paymentExt = ext;
          const originalName = uploadedFile.name;
          
          if (mime.startsWith('image/') || /\.jpe?g|\.png/i.test(originalName)) {
            try {
              setSaveProgress('Mengonversi gambar bukti transfer ke dokumen PDF...');
              fileBytes = await convertImageToPdf(fileBytes, mime);
              mime = 'application/pdf';
              paymentExt = '.pdf';
            } catch (convErr) {
              console.warn('Gagal merubah gambar bukti pembayaran ke PDF:', convErr);
            }
          }

          const driveFileName = `Bukti Pembayaran - (${cleanJenis} - ${cleanPenerima})${paymentExt}`;
          
          setSaveProgress('Mengunggah berkas bukti pembayaran langsung ke Google Drive...');
          const uploadResult = await uploadFileToFolder(
            token,
            driveFileName,
            mime,
            fileBytes,
            folderBuktiBayarId
          );

          finalBuktiPembayaran = {
            url: uploadResult.url,
            name: uploadResult.name
          };

          finalDriveFiles.push({
            url: uploadResult.url,
            name: uploadResult.name,
            isBuktiPembayaran: true
          });

          console.log('[Drive Upload] Upload Bukti Pembayaran berhasil:', uploadResult);
        } catch (driveErr: any) {
          console.error('[Drive Upload] Error syncing to Google Drive:', driveErr);
          if (driveErr.message === 'UNAUTHORIZED_DRIVE_TOKEN') {
            setErrorText('Sesi Google Drive berakhir. Silakan hubungkan kembali Google Drive di bar status.');
            setIsLoading(false);
            return;
          } else {
            // Soft failure, add local fallback and log
            finalDriveFiles.push({
              url: uploadedFile.base64,
              name: formattedFileName,
              isBuktiPembayaran: true
            });
          }
        }
      } else {
        // Fallback or upload without Drive synced
        finalDriveFiles.push({
          url: uploadedFile.base64,
          name: formattedFileName,
          isBuktiPembayaran: true
        });
      }

      const updatedSubmission: Submission = {
        ...selectedSubmission,
        status: 'Lunas',
        buktiPembayaran: finalBuktiPembayaran,
        googleDriveFiles: finalDriveFiles
      };

      setSaveProgress('Memperbarui data status transaksi di Firestore...');

      // Push to Firestore
      if (isFirebaseConfigured()) {
        const finalCompanyId = selectedSubmission.companyId || 'nmsa';
        const finalCompanyName = selectedSubmission.companyName || 'PT Nusantara Mineral Sukses Abadi';
        await saveSubmissionToFirestore(updatedSubmission, finalCompanyId, finalCompanyName);
      }

      // Sync local listing states
      const nextList = localSubmissions.map(sub => 
        sub.id === selectedSubmission.id ? updatedSubmission : sub
      );

      setLocalSubmissions(nextList);
      onUpdateSubmissions(nextList);
      
      // Save directly to localStorage as backup
      try {
        localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(nextList));
      } catch (localSaveErr) {
        console.warn('LocalStorage save failure:', localSaveErr);
      }

      // Log the event for the Audit log
      try {
        const totalVal = selectedSubmission.items.reduce((sum, item) => sum + item.total, 0);
        await saveActivityLogToFirestore(
          'pay_submission',
          `Mengunggah bukti transfer untuk voucher ${selectedSubmission.kode} kepada ${selectedSubmission.dibayarkanKepada} senilai Rp ${formatRupiah(totalVal)}. Status transaksi diubah menjadi Lunas.`,
          'success',
          selectedSubmission.id,
          selectedSubmission.kode
        );
      } catch (logErr) {
        console.warn('Gagal mencatat log aktivitas:', logErr);
      }

      setSuccessCode(selectedSubmission.kode || 'BKK-VOUCHER');
      setIsSuccess(true);
      setUploadedFile(null);
      setSelectedSubmission(null);
    } catch (err: any) {
      console.error(err);
      setErrorText(`Gagal memproses bukti pembayaran: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
      setSaveProgress('');
    }
  };

  // Compile unique lists for drop-down filters dynamically
  const uniqueLocations = Array.from(new Set(localSubmissions.map(s => s.lokasi).filter(Boolean)));
  const uniqueJenis = Array.from(new Set(localSubmissions.map(s => s.jenisPengajuan).filter(Boolean)));

  // Filter Submissions based on search + filters
  const filteredSubmissions = localSubmissions.filter(sub => {
    // 1. Text Search query filter
    const q = searchQuery.toLowerCase();
    const matchesCode = (sub.kode || '').toLowerCase().includes(q);
    const matchesRecipient = (sub.dibayarkanKepada || '').toLowerCase().includes(q);
    const matchesType = (sub.jenisPengajuan || '').toLowerCase().includes(q);
    
    // Check item details of each submission
    const matchesItems = sub.items?.some(item => 
      (item.item || '').toLowerCase().includes(q) || 
      (item.keterangan || '').toLowerCase().includes(q)
    );

    const matchesSearch = matchesCode || matchesRecipient || matchesType || matchesItems || q === '';

    // 2. Status Filter
    const matchesStatus = 
      filterStatus === 'All' ? true :
      filterStatus === 'Lunas' ? sub.status === 'Lunas' :
      sub.status !== 'Lunas';

    // 3. Location Filter
    const matchesLocation = 
      filterLocation === 'All' ? true : 
      sub.lokasi === filterLocation;

    // 4. Category / Jenis Filter
    const matchesJenis = 
      filterJenis === 'All' ? true : 
      sub.jenisPengajuan === filterJenis;

    return matchesSearch && matchesStatus && matchesLocation && matchesJenis;
  });

  // Sort submissions based on dropdown choice
  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    if (sortBy === 'tanggal-desc') {
      return new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime();
    }
    if (sortBy === 'tanggal-asc') {
      return new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime();
    }
    if (sortBy === 'nominal-desc') {
      return getSubmissionTotal(b) - getSubmissionTotal(a);
    }
    if (sortBy === 'nominal-asc') {
      return getSubmissionTotal(a) - getSubmissionTotal(b);
    }
    return 0;
  });

  // Calculate high level KPI totals for the finance dashboard view
  const totalSubmissionsCount = localSubmissions.length;
  const unpaidCount = localSubmissions.filter(s => s.status !== 'Lunas').length;
  const paidCount = localSubmissions.filter(s => s.status === 'Lunas').length;
  const outstandingDebtValue = localSubmissions
    .filter(s => s.status !== 'Lunas')
    .reduce((sum, s) => sum + getSubmissionTotal(s), 0);

  return (
    <div className="max-w-7xl mx-auto py-2 px-1 sm:px-3">
      
      {/* CARD CONTEXT */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden transition-all duration-300">
        
        {/* PREMIUM GOLD TOP BAR ACCENT */}
        <div className="h-2 bg-gradient-to-r from-stone-850 via-[#D4AF37] to-stone-900"></div>

        {/* INTERACTIVE COMPONENT HEADER */}
        <div className="p-6 sm:p-8 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-50/50">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1 px-3 bg-amber-500/10 text-[#a58421] rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-amber-500/20">
                Divisi Keuangan • Nusantara Portal
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-sans">
              Dashboard Verifikasi Bukti Transfer HO
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 font-medium">
              Manajemen kompilasi voucher transaksi Nusantara Mineral. Unggah tanda bukti/struk untuk menyelesaikan pelunasan.
            </p>
          </div>
          
          <button
            onClick={onBack}
            className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 border border-stone-200 hover:border-stone-350 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer font-mono"
          >
            <ArrowLeft size={13} />
            <span>KEMBALI KE PORTAL UTAMA</span>
          </button>
        </div>

        {/* MAIN BODY AREA */}
        <div className="p-4 sm:p-6 space-y-6">
          
          {/* KPI BLOCKS: QUICK REVIEW STATS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider block">Total Transaksi</span>
                <span className="text-xl font-black text-stone-900">{totalSubmissionsCount} Voucher</span>
              </div>
              <div className="p-2.5 bg-stone-100 rounded-lg text-stone-600">
                <SlidersHorizontal size={16} />
              </div>
            </div>

            <div className="bg-amber-50/40 rounded-xl p-4 border border-amber-200 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-[#a58421] font-bold uppercase tracking-wider block">Belum Lunas (Pending)</span>
                <span className="text-xl font-black text-amber-700">{unpaidCount} Voucher</span>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg text-[#a58421]">
                <Clock size={16} />
              </div>
            </div>

            <div className="bg-emerald-50/30 rounded-xl p-4 border border-emerald-150 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider block">Lunas (Paid)</span>
                <span className="text-xl font-black text-emerald-800">{paidCount} Voucher</span>
              </div>
              <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-700">
                <CheckCircle size={16} />
              </div>
            </div>

            <div className="bg-stone-905 bg-stone-900 text-stone-100 rounded-xl p-4 border border-stone-850 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider block">Total Tagihan Pending</span>
                <span className="text-lg font-black text-amber-400 font-mono tracking-tight">{formatRupiah(outstandingDebtValue)}</span>
              </div>
              <div className="p-2.5 bg-stone-800 rounded-lg text-amber-400">
                <Check size={16} />
              </div>
            </div>

          </div>

          {/* ADVANCED FILTER TOOLBAR */}
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
              <Filter size={14} className="text-amber-500" />
              <h2 className="text-xs font-mono font-black text-stone-800 uppercase tracking-widest">Piringan Filter & Penyortiran Rinci</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              
              {/* Search String */}
              <div className="md:col-span-4 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Kata Kunci / Pencarian Cepat</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Kode, penerima, atau keterangan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-1.5 bg-white text-xs text-stone-900 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Status Pembayaran</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none"
                >
                  <option value="All">Semua Transaksi</option>
                  <option value="Belum Lunas">Belum Lunas (Pending)</option>
                  <option value="Lunas">Lunas (Paid)</option>
                </select>
              </div>

              {/* Location */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Lokasi Pengajuan</label>
                <select
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none"
                >
                  <option value="All">Semua Lokasi</option>
                  {uniqueLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Kategori / Jenis</label>
                <select
                  value={filterJenis}
                  onChange={(e) => setFilterJenis(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none"
                >
                  <option value="All">Semua Kategori</option>
                  {uniqueJenis.map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>

              {/* Order Sort */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Sortir Urutan</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none"
                >
                  <option value="tanggal-desc">📆 Tanggal Terbaru</option>
                  <option value="tanggal-asc">📆 Tanggal Terlama</option>
                  <option value="nominal-desc">💰 Nominal Tertinggi</option>
                  <option value="nominal-asc">💰 Nominal Terendah</option>
                </select>
              </div>

            </div>
          </div>

          {/* DUAL COLUMN SPLIT BOARD */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT SIDE: FILTERED MASTER LIST OF COPIES (2 COLUMNS) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-xs font-mono font-black text-stone-400 uppercase tracking-widest block">
                  Daftar Voucher Ditemukan ({sortedSubmissions.length})
                </h3>
                <span className="text-[10px] text-stone-400 bg-stone-100 px-2.5 py-0.5 rounded-full font-bold">
                  Klik item untuk mengunggah bukti bayar
                </span>
              </div>

              {isLoading ? (
                <div className="p-16 border rounded-xl bg-white text-center text-stone-400 text-xs">
                  <span className="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3"></span>
                  <p className="font-mono">Menyelaraskan data real-time dengan server cloud...</p>
                </div>
              ) : sortedSubmissions.length === 0 ? (
                <div className="p-16 border-2 border-dashed border-stone-200 rounded-xl bg-white text-center text-stone-450 text-xs space-y-2">
                  <SlidersHorizontal size={24} className="mx-auto text-stone-300" />
                  <p className="font-bold">Tidak Menemukan Data Transaksi</p>
                  <p className="text-[11px] text-stone-400">Silakan sesuaikan filter pencarian, status, atau kategori di atas.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                  {sortedSubmissions.map((sub) => {
                    const totalVoucher = getSubmissionTotal(sub);
                    const isSelected = selectedSubmission?.id === sub.id;
                    const isLunas = sub.status === 'Lunas';

                    return (
                      <div
                        key={sub.id}
                        onClick={() => {
                          setSelectedSubmission(sub);
                          setErrorText('');
                          setIsSuccess(false);
                        }}
                        className={`p-4 border rounded-xl bg-white transition shadow-3xs cursor-pointer flex flex-col sm:flex-row gap-3 sm:items-center justify-between group text-xs text-stone-600 ${
                          isSelected 
                            ? 'border-amber-450 ring-2 ring-amber-100 bg-amber-50/10' 
                            : 'border-stone-200 hover:border-stone-350 hover:bg-stone-50/40'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0 pr-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span 
                              className="font-sans text-stone-900 font-extrabold text-sm tracking-tight group-hover:text-amber-700 transition block truncate max-w-full"
                              title={sub.items && sub.items.length > 0 ? sub.items.map(i => i.item).filter(Boolean).join(', ') : sub.jenisPengajuan}
                            >
                              {sub.items && sub.items.length > 0 
                                ? sub.items.map(i => i.item).filter(Boolean).join(', ') 
                                : sub.jenisPengajuan || 'Non-Kategori'}
                            </span>
                            
                            <span className="text-[10px] bg-amber-50 text-[#a58421] border border-amber-250 px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap">
                              {sub.kode || 'BKK-VOUCHER'}
                            </span>
                            
                            <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-mono font-bold">
                              {sub.lokasi || 'N/A'}
                            </span>

                            <span className="text-[10px] bg-stone-100/80 text-stone-500 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
                              {sub.jenisPengajuan || 'Non-Kategori'}
                            </span>

                            {/* Clear indicator badges requested by client */}
                            {isLunas ? (
                              <span className="ml-auto sm:ml-0 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black font-mono rounded uppercase border border-emerald-250">
                                <CheckCircle size={10} className="fill-emerald-50" />
                                LUNAS
                              </span>
                            ) : (
                              <span className="ml-auto sm:ml-0 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-55 bg-amber-50 text-[#a58421] text-[10px] font-black font-mono rounded uppercase border border-amber-250 animate-pulse">
                                <Clock size={10} />
                                BELUM LUNAS
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-stone-500 font-sans mt-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User size={12} className="text-stone-400 shrink-0" />
                              <span className="truncate">Kepada: <strong className="text-stone-750 font-medium">{sub.dibayarkanKepada || '-'}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CalendarDays size={12} className="text-stone-400 shrink-0" />
                              <span>Tanggal: {formatDateIndonesian(sub.tanggal)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Nominal right box */}
                        <div className="text-left sm:text-right font-mono shrink-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-stone-100 pt-2 sm:pt-0">
                          <span className="text-[9px] text-stone-400 font-bold block">NOMINAL VOUCHER</span>
                          <span className={`text-sm sm:text-md font-black tracking-tight ${isLunas ? 'text-stone-800' : 'text-stone-900'}`}>
                            {formatRupiah(totalVoucher)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT SIDE: SELECTED CONTEXT WORKSPACE & DRAG-DROP UPLOADER */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xs font-mono font-black text-stone-400 uppercase tracking-widest block">
                Workspace Bukti Pembayaran
              </h3>

              {/* GOOGLE DRIVE INTEGRATION STATUS */}
              <DriveAccountsManager onConnectionChange={setIsDriveConnected} />

              {isSuccess && (
                <div className="p-5 border border-emerald-200 bg-emerald-50/40 rounded-2xl text-center space-y-4 animate-fade-in shadow-2xs">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto border border-emerald-200">
                    <CheckCircle size={20} className="stroke-[2.5]" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider font-mono">SIMPAN SUKSES!</h4>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Bukti transfer untuk voucher <strong className="font-mono text-stone-850">{successCode}</strong> telah diunggah & dicatat ke cloud server.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsSuccess(false)}
                    className="w-full py-2 bg-stone-900 hover:bg-stone-850 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                  >
                    Unggah Bukti Pembayaran Lain
                  </button>
                </div>
              )}

              {!isSuccess && !selectedSubmission && (
                <div className="p-8 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50 text-center text-stone-400 text-xs flex flex-col items-center justify-center min-h-[340px] space-y-3">
                  <div className="p-3 bg-white rounded-xl shadow-3xs border border-stone-150">
                    <ListFilter size={20} className="text-[#D4AF37]" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-stone-700">Tidak Ada Item Terpilih</p>
                    <p className="text-[10px] text-stone-400 px-3">
                      Silakan pilih salah satu data transaksi dari kompilasi menu di sebelah kiri untuk melihat rincian pengajuan dan modul input bukti bayar.
                    </p>
                  </div>
                </div>
              )}

              {!isSuccess && selectedSubmission && (
                <div className="border border-stone-200 rounded-2xl bg-white p-4.5 space-y-4 shadow-sm animate-fade-in">
                  
                  {/* Miniature Detail card */}
                  <div className="bg-stone-50/80 p-3.5 rounded-xl border border-stone-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider">RINCIAN TRANS-VOUCHER</span>
                      <button 
                        onClick={() => setSelectedSubmission(null)}
                        className="text-stone-400 hover:text-stone-600 p-0.5 rounded transition"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-stone-900 font-bold font-mono text-sm">
                        <span>{selectedSubmission.kode}</span>
                        {selectedSubmission.status === 'Lunas' ? (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase rounded font-mono">
                            Lunas
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-[#a58421] text-[9px] font-bold uppercase rounded font-mono animate-pulse">
                            Belum Lunas
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500">{formatDateIndonesian(selectedSubmission.tanggal)}</p>
                    </div>

                    <div className="h-px bg-stone-200" />

                    <div className="space-y-1.5 text-[11px] text-stone-600">
                      <div className="flex justify-between">
                        <span className="text-stone-400 font-medium">Dibayarkan Kepada:</span>
                        <strong className="text-stone-800">{selectedSubmission.dibayarkanKepada || '-'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400 font-medium">Kategori:</span>
                        <strong className="text-stone-800">{selectedSubmission.jenisPengajuan || '-'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400 font-medium">Lokasi:</span>
                        <strong className="text-stone-800">{selectedSubmission.lokasi || '-'}</strong>
                      </div>
                      {selectedSubmission.rekeningTujuan && (
                        <div className="flex justify-between">
                          <span className="text-stone-400 font-medium">Rekening:</span>
                          <strong className="text-stone-800 tracking-tight font-mono text-[10px]">{selectedSubmission.rekeningTujuan}</strong>
                        </div>
                      )}
                      <div className="pt-1.5 flex justify-between items-baseline border-t border-stone-200/55">
                        <span className="text-stone-400 text-[10px] font-black uppercase tracking-wider font-mono">TOTAL NILAI:</span>
                        <strong className="text-sm font-black text-stone-900 font-mono">
                          {formatRupiah(getSubmissionTotal(selectedSubmission))}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Drag drop zone for uploaded Receipt */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                      UPLOAD BUKTI TRANSFER (KEUANGAN)
                    </label>

                    {uploadedFile ? (
                      <div className="border border-stone-200 rounded-xl overflow-hidden bg-stone-50">
                        <div className="p-2 bg-stone-150/75 border-b border-stone-200 flex items-center justify-between text-[11px] text-stone-700">
                          <div className="flex items-center gap-1.5 font-mono truncate max-w-[190px]">
                            <FileText size={13} className="text-amber-500 shrink-0" />
                            <span className="font-bold truncate">{uploadedFile.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="p-1 text-stone-400 hover:text-rose-600 hover:bg-stone-200 rounded transition cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="p-3 flex items-center justify-center min-h-32 max-h-48 overflow-hidden bg-stone-50">
                          {uploadedFile.base64.startsWith('data:image/') ? (
                            <img
                              src={uploadedFile.base64}
                              alt="Bukti Bayar Preview"
                              className="max-h-36 object-contain rounded border border-stone-200 shadow-3xs"
                            />
                          ) : (
                            <div className="text-center p-2 space-y-1">
                              <FileText size={24} className="text-stone-300 mx-auto" />
                              <p className="text-stone-500 font-mono text-[10px] font-bold truncate max-w-[160px]">{uploadedFile.name}</p>
                              <p className="text-[9px] text-stone-400">PDF Dokumentasi</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center gap-2.5 transition min-h-36 cursor-pointer ${
                          dragActive 
                            ? 'border-[#D4AF37] bg-amber-50/5' 
                            : 'border-stone-200 hover:border-stone-350 bg-stone-50/50'
                        }`}
                        onClick={() => document.getElementById('bukti_transfer_upload_file')?.click()}
                      >
                        <input
                          id="bukti_transfer_upload_file"
                          type="file"
                          accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        <div className="w-10 h-10 bg-amber-500/5 text-[#D4AF37] border border-amber-500/10 rounded-xl flex items-center justify-center shadow-3xs">
                          <UploadCloud size={18} />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-bold text-stone-750">
                            Drop bukti pembayaran di sini, atau <span className="text-[#a58421] hover:underline">pilih file</span>
                          </p>
                          <p className="text-[9px] text-stone-400">
                            Format PDF / Gambar Maks. 5 MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progress Indicator */}
                  {isLoading && saveProgress && (
                    <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-stone-800 text-[11px] flex items-center gap-2.5 animate-pulse">
                      <span className="inline-block w-4 h-4 border-2 border-[#a58421] border-t-transparent rounded-full animate-spin shrink-0"></span>
                      <span className="font-mono font-medium">{saveProgress}</span>
                    </div>
                  )}

                  {/* Errors inside card */}
                  {errorText && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] flex items-center gap-2">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{errorText}</span>
                    </div>
                  )}

                  {/* Actions inside card */}
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(null)}
                      className="px-3.5 py-2 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-lg text-xs font-bold transition font-mono uppercase text-[10px]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitReceipt}
                      disabled={isLoading || !uploadedFile}
                      className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition font-mono uppercase text-[10px] ${
                        isLoading || !uploadedFile
                          ? 'bg-stone-200 text-stone-400 border border-stone-200 cursor-not-allowed'
                          : 'bg-[#D4AF37] border border-[#a58421] hover:bg-[#bfa035] text-white shadow-3xs hover:shadow-2xs cursor-pointer'
                      }`}
                    >
                      {isLoading ? 'Menyimpan...' : 'Validasi Lunas ➔'}
                    </button>
                  </div>

                  {/* Friendly prompt line */}
                  <div className="flex gap-1.5 p-2.5 bg-blue-50/50 text-blue-800 text-[10px] rounded-lg border border-blue-150 leading-relaxed font-sans">
                    <Info size={11} className="shrink-0 mt-0.5 text-blue-500" />
                    <span>Mengunggah bukti pembayaran di sini akan mengubah status voucher secara real-time menjadi <strong>LUNAS</strong> dan menghasilkan pratinjau bukti bayar otomatis di folder lampiran.</span>
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
