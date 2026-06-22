import React, { useState, useEffect, useRef } from 'react';
import { Submission, REQUIRED_TRANSACTION_DOCS } from '../types';
import { 
  ConnectedDrive, 
  getConnectedDrives, 
  saveConnectedDrives, 
  googleDriveLogin, 
  refreshAllDrivesQuota,
  saveSubmissionToFirestore
} from '../firebase';
import { 
  Cloud, 
  RefreshCw, 
  FolderSync, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  FolderOpen, 
  CornerDownRight, 
  Terminal, 
  Sparkles,
  UserPlus
} from 'lucide-react';

interface DriveMigrationProps {
  submissions: Submission[];
  onUpdateSubmissions: (updated: Submission[]) => void;
}

export const DriveMigration: React.FC<DriveMigrationProps> = ({ submissions, onUpdateSubmissions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [drives, setDrives] = useState<ConnectedDrive[]>([]);
  const [sourceEmail, setSourceEmail] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>('');

  // Migration status
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [summaryText, setSummaryText] = useState<string | null>(null);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  const loadConnectedDrives = () => {
    const list = getConnectedDrives();
    setDrives(list);
    
    // Auto-select defaults
    if (list.length > 0) {
      if (!sourceEmail) setSourceEmail(list[0].email);
      if (list.length > 1 && !targetEmail) {
        setTargetEmail(list[1].email);
      } else if (!targetEmail) {
        setTargetEmail(list[0].email);
      }
    }
  };

  useEffect(() => {
    loadConnectedDrives();
  }, []);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [migrationLogs]);

  const handleConnectNewDrive = async () => {
    try {
      const result = await googleDriveLogin();
      if (result.accessToken) {
        const list = getConnectedDrives();
        setDrives(list);
        setTargetEmail(result.driveDetails?.email || result.user.email || '');
        addLog(`✓ Berhasil menghubungkan akun Google Drive baru: ${result.user.email}`);
      }
    } catch (err: any) {
      addLog(`❌ Gagal menghubungkan Google Drive: ${err.message || err}`);
    }
  };

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString('id-ID');
    setMigrationLogs(prev => [...prev, `[${time}] ${text}`]);
  };

  // Helper inside loop: find or create folder on a specific account
  const getOrCreateFolder = async (token: string, name: string, parentId: string): Promise<string> => {
    const cleanName = name.trim().replace(/'/g, "\\'");
    const query = `name = '${cleanName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }
    
    // Create new
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    
    if (!createRes.ok) {
      throw new Error(`Gagal membuat folder "${name}"`);
    }
    const createdData = await createRes.json();
    return createdData.id;
  };

  // Helper: Download file using Source token
  const downloadFileBytes = async (sourceToken: string, fileId: string): Promise<Uint8Array | null> => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${sourceToken}` }
      });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.error('Download error for ID ' + fileId, e);
      return null;
    }
  };

  // Helper: Upload file to specific directory using Target token and set Reader sharing
  const uploadFileToTarget = async (
    targetToken: string,
    fileName: string,
    fileMimeType: string,
    fileBytes: Uint8Array,
    folderId: string
  ): Promise<{ url: string; name: string }> => {
    // Delete target duplicate with same name to write freshly
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
        )}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${targetToken}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          for (const existingFile of searchData.files) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${targetToken}` }
            });
          }
        }
      }
    } catch (err) {
      console.warn('Checking duplicates failed:', err);
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
        headers: { Authorization: `Bearer ${targetToken}` },
        body: formData,
      }
    );

    if (!res.ok) {
      throw new Error(`Upload gagal untuk files: ${fileName}`);
    }

    const fileData = await res.json();

    // Set shared viewer permission
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${targetToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
    } catch (perErr) {
      console.warn('Set shared permissions failed for target file', perErr);
    }

    return {
      url: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view?usp=drivesdk`,
      name: fileData.name || fileName
    };
  };

  const getOrCreatePettyCashFolderHierarchy = async (
    token: string,
    custodian: string,
    year: string,
    month: string,
    day: string
  ): Promise<string> => {
    const rootId = 'root';
    const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
    const pettyCashId = await getOrCreateFolder(token, 'Petty Cash', voucherAppId);
    const cleanCustodian = (custodian || 'Pemegang Petty Cash').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const custodianId = await getOrCreateFolder(token, cleanCustodian, pettyCashId);
    const yearId = await getOrCreateFolder(token, year, custodianId);
    const monthId = await getOrCreateFolder(token, month, yearId);
    const dayId = await getOrCreateFolder(token, day, monthId);
    return dayId;
  };

  const handleStartMigration = async () => {
    setMigrationLogs([]);
    setSummaryText(null);
    setSuccessCount(0);
    setFailedCount(0);
    setWarningCount(0);
    setMigrationProgress(0);

    const list = getConnectedDrives();
    const sourceDrive = list.find(d => d.email.toLowerCase() === sourceEmail.toLowerCase());
    const targetDrive = list.find(d => d.email.toLowerCase() === targetEmail.toLowerCase());

    if (!sourceDrive || !targetDrive) {
      alert('Pilihlah Akun Sumber dan Akun Tujuan migrasi dengan benar.');
      return;
    }

    if (sourceDrive.email.toLowerCase() === targetDrive.email.toLowerCase()) {
      if (!window.confirm('PERINGATAN: Akun Sumber dan Tujuan adalah email yang sama. Ini akan menyalin ulang file dalam satu akun yang sama. Lanjutkan?')) {
        return;
      }
    }

    setIsMigrating(true);
    addLog(`🛫 MEMULAI MIGRASI GOOGLE DRIVE BARU`);
    addLog(`Sedia dari: ${sourceDrive.email} (Akun Sumber)`);
    addLog(`Pindah ke: ${targetDrive.email} (Akun Tujuan)`);

    const sourceToken = sourceDrive.accessToken;
    const targetToken = targetDrive.accessToken;

    const filteredSubmissionsWithFiles = submissions.filter(sub => {
      const hasGFolders = sub.googleDriveFiles && sub.googleDriveFiles.length > 0;
      const hasBuktiBayar = !!sub.buktiPembayaran;
      const hasLPJ = sub.isPettyCash && !!sub.pettyCashFile;
      return hasGFolders || hasBuktiBayar || hasLPJ;
    });

    if (filteredSubmissionsWithFiles.length === 0) {
      addLog('⚠️ Tidak mendeteksi adanya dokumen Google Drive yang tersimpan di transaksi Anda.');
      setIsMigrating(false);
      return;
    }

    addLog(`Ditemukan ${filteredSubmissionsWithFiles.length} transaksi berisi file yang perlu dipindahkan...`);

    const updatedSubmissions = [...submissions];
    let successes = 0;
    let failures = 0;
    let warnings = 0;

    const indonesianMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    for (let index = 0; index < filteredSubmissionsWithFiles.length; index++) {
      const sub = filteredSubmissionsWithFiles[index];
      const percent = Math.round(((index + 1) / filteredSubmissionsWithFiles.length) * 100);
      setMigrationProgress(percent);

      const kodeStr = sub.kode || 'Tanpa Kode';
      addLog(`--------------------------------------------------`);
      addLog(`👉 [${index + 1}/${filteredSubmissionsWithFiles.length}] Memproses Transaksi: ${kodeStr}`);

      try {
        // Date computations
        const parts = (sub.tanggal || '').split('-');
        let yearStr = '2026';
        let monthStr = '1. Januari';
        let dayStr = '1';

        if (parts.length === 3) {
          yearStr = parts[0];
          const monthIdx = parseInt(parts[1], 10) - 1;
          const mNum = monthIdx + 1;
          const mName = indonesianMonths[monthIdx] || 'Januari';
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(parseInt(parts[2], 10));
        } else {
          const dateObj = new Date(sub.createdAt || Date.now());
          yearStr = String(dateObj.getFullYear());
          const mNum = dateObj.getMonth() + 1;
          const mName = indonesianMonths[dateObj.getMonth()];
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(dateObj.getDate());
        }

        const folderCompanyUpper = (sub.companyId || 'nmsa').toUpperCase();

        // 1. Rebuild Target Folder Hierarchy
        const rootId = 'root';
        const voucherAppId = await getOrCreateFolder(targetToken, 'Voucher-APP', rootId);
        const companyId = await getOrCreateFolder(targetToken, folderCompanyUpper, voucherAppId);
        const yearId = await getOrCreateFolder(targetToken, yearStr, companyId);
        const monthId = await getOrCreateFolder(targetToken, monthStr, yearId);
        const dayId = await getOrCreateFolder(targetToken, dayStr, monthId);

        const cleanJenis = (sub.jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanPenerima = (sub.dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const txFolderName = `${cleanJenis} - ${cleanPenerima}`;
        const targetFolderId = await getOrCreateFolder(targetToken, txFolderName, dayId);

        addLog(`[TARGET DIRECTORY] /Voucher-APP/${folderCompanyUpper}/${yearStr}/${monthStr}/${dayStr}/${txFolderName}`);

        const newlyUploadedFiles: { url: string; name: string; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[] = [];
        let newlyUploadedPaymentDoc: { url: string; name: string } | undefined = undefined;
        let newlyUploadedPettyCashFile: { url: string; name: string } | undefined = undefined;

        // 2. Transmit Attachments
        if (sub.googleDriveFiles && sub.googleDriveFiles.length > 0) {
          for (const fileObj of sub.googleDriveFiles) {
            const fileIdMatch = fileObj.url.match(/[-\w]{25,}/);
            if (!fileIdMatch) {
              addLog(`⚠️ Link file tidak berbentuk Drive standard: ${fileObj.name}. Melewatkan...`);
              newlyUploadedFiles.push(fileObj);
              warnings++;
              continue;
            }

            const fileId = fileIdMatch[0];
            addLog(`⚡ Mengunduh "${fileObj.name}" dari sumber...`);
            const fileBytes = await downloadFileBytes(sourceToken, fileId);

            if (fileBytes) {
              let mimeType = 'application/octet-stream';
              const lowName = fileObj.name.toLowerCase();
              if (lowName.endsWith('.pdf')) mimeType = 'application/pdf';
              else if (lowName.endsWith('.png')) mimeType = 'image/png';
              else if (lowName.endsWith('.jpg') || lowName.endsWith('.jpeg')) mimeType = 'image/jpeg';

              addLog(`🚀 Mengunggah "${fileObj.name}" ke akun Drive tujuan...`);
              const uploaded = await uploadFileToTarget(targetToken, fileObj.name, mimeType, fileBytes, targetFolderId);
              
              newlyUploadedFiles.push({
                ...fileObj,
                url: uploaded.url,
                name: uploaded.name
              });
              successes++;
            } else {
              addLog(`❌ Berkas "${fileObj.name}" tidak dapat diunduh (mungkin sudah terhapus di akun sumber).`);
              newlyUploadedFiles.push(fileObj);
              failures++;
            }
          }
        }

        // 3. Transmit Bukti Pembayaran
        if (sub.buktiPembayaran) {
          const bpObj = sub.buktiPembayaran;
          const fileIdMatch = bpObj.url.match(/[-\w]{25,}/);
          if (fileIdMatch) {
            const fileId = fileIdMatch[0];
            addLog(`⚡ Mengunduh bukti pembayaran "${bpObj.name}" dari sumber...`);
            const fileBytes = await downloadFileBytes(sourceToken, fileId);
            if (fileBytes) {
              const folderBuktiBayarId = await getOrCreateFolder(targetToken, 'Bukti Pembayaran', targetFolderId);
              let mimeType = 'application/octet-stream';
              const lowName = bpObj.name.toLowerCase();
              if (lowName.endsWith('.pdf')) mimeType = 'application/pdf';
              else if (lowName.endsWith('.png')) mimeType = 'image/png';
              else if (lowName.endsWith('.jpg') || lowName.endsWith('.jpeg')) mimeType = 'image/jpeg';

              addLog(`🚀 Menyimpan bukti pembayaran ke tujuan...`);
              const uploaded = await uploadFileToTarget(targetToken, bpObj.name, mimeType, fileBytes, folderBuktiBayarId);
              newlyUploadedPaymentDoc = uploaded;
              
              // Also keep inside googleDriveFiles if it was index-listed
              newlyUploadedFiles.push({
                url: uploaded.url,
                name: uploaded.name,
                isBuktiPembayaran: true
              });
              successes++;
            } else {
              addLog(`❌ Gagal mentransmisikan bukti pembayaran.`);
              newlyUploadedPaymentDoc = bpObj;
              failures++;
            }
          } else {
            newlyUploadedPaymentDoc = bpObj;
          }
        }

        // 4. Transmit Petty Cash LPJ file
        if (sub.isPettyCash && sub.pettyCashFile) {
          const pcFile = sub.pettyCashFile;
          const fileIdMatch = pcFile.url.match(/[-\w]{25,}/);
          if (fileIdMatch) {
            const fileId = fileIdMatch[0];
            addLog(`⚡ Mengunduh berkas LPJ Petty Cash "${pcFile.name}" dari sumber...`);
            const fileBytes = await downloadFileBytes(sourceToken, fileId);
            if (fileBytes) {
              const pcTargetDirId = await getOrCreatePettyCashFolderHierarchy(
                targetToken,
                sub.pettyCashCustodian || 'Custodian',
                yearStr,
                monthStr,
                dayStr
              );
              let mimeType = 'application/octet-stream';
              const lowName = pcFile.name.toLowerCase();
              if (lowName.endsWith('.pdf')) mimeType = 'application/pdf';
              else if (lowName.endsWith('.png')) mimeType = 'image/png';
              else if (lowName.endsWith('.jpg') || lowName.endsWith('.jpeg')) mimeType = 'image/jpeg';

              addLog(`🚀 Menyimpan LPJ Petty Cash ke tujuan...`);
              const uploaded = await uploadFileToTarget(targetToken, pcFile.name, mimeType, fileBytes, pcTargetDirId);
              newlyUploadedPettyCashFile = uploaded;
              successes++;
            } else {
              addLog(`❌ Gagal mentransmisikan berkas LPJ Petty Cash.`);
              newlyUploadedPettyCashFile = pcFile;
              failures++;
            }
          } else {
            newlyUploadedPettyCashFile = pcFile;
          }
        }

        // Save updated local object references
        const indexOfParent = updatedSubmissions.findIndex(s => s.id === sub.id);
        if (indexOfParent !== -1) {
          const updatedSub: Submission = {
            ...sub,
            googleDriveFiles: newlyUploadedFiles,
            buktiPembayaran: newlyUploadedPaymentDoc || sub.buktiPembayaran,
            pettyCashFile: newlyUploadedPettyCashFile || sub.pettyCashFile
          };
          
          updatedSubmissions[indexOfParent] = updatedSub;
          
          // Save to firestore under current user company configs
          try {
            await saveSubmissionToFirestore(updatedSub, sub.companyId || 'nmsa', sub.companyName || 'PT Nusantara Mineral Sukses Abadi');
            addLog(`✓ Saved & updated Firestore metadata.`);
          } catch (fireErr: any) {
            addLog(`[Peringatan] Berhasil pindah drive tapi gagal perbarui cloud db: ${fireErr.message}`);
          }
        }

        setSuccessCount(successes);
        setFailedCount(failures);
        setWarningCount(warnings);
      } catch (err: any) {
        addLog(`❌ Error kategorial saat memproses transaksi ${kodeStr}: ${err.message || err}`);
        failures++;
        setFailedCount(failures);
      }
    }

    // Persist all localized state updates
    onUpdateSubmissions(updatedSubmissions);

    setIsMigrating(false);
    addLog(`=== PROSES MIGRASI LENGKAP ===`);
    addLog(`✓ Total file sukses dipindahkan: ${successes}`);
    addLog(`⚠️ Total warning: ${warnings}`);
    addLog(`❌ Total gagal: ${failures}`);

    setSummaryText(`PROSES MIGRASI LENGKAP! Berhasil memindahkan total ${successes} berkas keuangan (Forms F1, F2 & lampiran foto) secara aman. Seluruh tautan transaksi Anda saat ini sudah diperbarui mengarah ke folder Google Drive tujuan yang baru (${targetDrive.email}).`);
    alert('Congratulations! Seluruh file Google Drive berhasil dimigrasikan ke Google Drive baru Anda.');
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 print:hidden space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={18} className="text-amber-600 animate-pulse" />
          <h4 className="text-xs font-bold text-stone-850 uppercase tracking-wider font-display">
            Asisten Migrasi Berkas Google Drive
          </h4>
        </div>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setSummaryText(null);
            setMigrationLogs([]);
            loadConnectedDrives();
          }}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
            isOpen 
              ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' 
              : 'bg-stone-900 text-white hover:bg-stone-800'
          }`}
        >
          {isOpen ? 'Batal Migrasi' : 'Pindah Google Drive'}
        </button>
      </div>

      {!isOpen && (
        <p className="text-xs text-stone-500 leading-relaxed">
          Ingin memindahkan seluruh <strong>berkas attachment, bukti transfer, dan lampiran transaksi</strong> ke akun Google Drive yang baru tanpa merusak database dan tautan voucher? Gunakan asisten otomatisasi penyalinan awan ini.
        </p>
      )}

      {isOpen && (
        <div className="border border-stone-200 bg-white rounded-xl p-4 space-y-5 animate-fade-in">
          <div className="flex gap-2.5 items-start bg-amber-50 p-3 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
            <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">METODE SINKRONISASI DRIVE-TO-DRIVE:</p>
              <p>Asisten akan mendownload berkas-berkas dari akun Drive lama dan menyisipkannya kembali ke akun Drive baru Anda, merapikan struktur direktori secara otomatis, serta mengupdate seluruh link di transaksi.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Account selection */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                1. Akun Google Drive Sumber *
              </label>
              {drives.length === 0 ? (
                <div className="p-2 border border-rose-150 bg-rose-50/20 text-rose-800 text-xs rounded-lg font-medium">
                  Belum ada Drive terhubung. Sila klik Hubungkan di bawah.
                </div>
              ) : (
                <select
                  value={sourceEmail}
                  onChange={(e) => setSourceEmail(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none text-stone-800 font-medium"
                >
                  {drives.map(d => (
                    <option key={d.email} value={d.email}>
                      📁 {d.displayName || d.email} ({d.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Target Account selection */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                2. Akun Google Drive Tujuan / Baru *
              </label>
              <div className="flex gap-2">
                <select
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  className="flex-1 p-2.5 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none text-stone-800 font-medium"
                >
                  {drives.map(d => (
                    <option key={d.email} value={d.email}>
                      🎯 {d.displayName || d.email} ({d.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleConnectNewDrive}
                  className="px-3 bg-[#D4AF37] text-stone-955 rounded-xl hover:bg-[#Bca031] transition flex items-center gap-1 text-xs font-bold cursor-pointer"
                  title="Hubungkan Akun Google Drive Baru"
                >
                  <UserPlus size={14} />
                  <span>+ Akun</span>
                </button>
              </div>
            </div>
          </div>

          {/* Setup verification metrics panel */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between text-xs text-stone-600">
            <span>
              Transaksi Terpindas: <strong>{submissions.filter(sub => (sub.googleDriveFiles && sub.googleDriveFiles.length > 0) || sub.buktiPembayaran || (sub.isPettyCash && sub.pettyCashFile)).length} dari {submissions.length} transaksi</strong> memiliki file awan.
            </span>
          </div>

          {summaryText && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs leading-relaxed space-y-2">
              <div className="flex gap-1.5 items-center font-bold text-emerald-800">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>MIGRASI KESELURUHAN SELESAI SUKSES!</span>
              </div>
              <p>{summaryText}</p>
            </div>
          )}

          {/* Log Window Terminal */}
          {(migrationLogs.length > 0 || isMigrating) && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                <span>TERMINAL LOG MIGRASI</span>
                <span>Progress: {migrationProgress}%</span>
              </div>
              
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden mb-2">
                <div 
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${migrationProgress}%` }}
                />
              </div>

              <div 
                ref={logsContainerRef}
                className="bg-stone-900 border border-stone-800 text-[10px] font-mono text-emerald-400 p-3 h-48 overflow-y-auto rounded-xl space-y-1 select-text scroll-smooth"
              >
                {migrationLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
              
              <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                <span>Sukses: {successCount}</span>
                <span>Peringatan: {warningCount}</span>
                <span>Gagal: {failedCount}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              onClick={handleStartMigration}
              disabled={isMigrating || drives.length < 1}
              className="px-5 py-2.5 text-xs font-bold bg-[#D4AF37] text-stone-955 hover:bg-[#Bca031] disabled:bg-stone-200 disabled:text-stone-400 rounded-xl transition flex items-center gap-1.5 font-semibold shadow-xs cursor-pointer"
            >
              {isMigrating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Migrasi Sedang Jalan...</span>
                </>
              ) : (
                <>
                  <FolderSync size={14} />
                  <span>Mulai Jalankan Transfer Berkas</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
