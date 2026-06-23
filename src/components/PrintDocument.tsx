import React, { useState, useEffect } from 'react'; 
import { Submission } from '../types';
import { formatRupiah, formatDateIndonesian, numberToTerbilang } from '../utils';
import { NusantaraLogo } from './NusantaraLogo';
import { Printer, ArrowLeft, Layers, FileText, CheckCircle, Cloud, Loader2, Lock, ShieldAlert, RefreshCw } from 'lucide-react';
import { getStoredGoogleDriveToken, googleDriveLogin, saveSubmissionToFirestore } from '../firebase';

interface PrintDocumentProps {
  submission: Submission;
  onBack: () => void;
  userProfile?: any;
  initialTab?: 'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment';
}

const getGoogleDriveEmbedUrl = (url: string): string => {
  if (!url) return '';
  if (url.includes('/preview')) return url;
  
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    return `https://drive.google.com/file/d/${dMatch[1]}/preview`;
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
  }
  return url;
};

export interface RenderedPage {
  id: string;
  fileName: string;
  fileIndex: number;
  pageNumber: number;
  dataUrl: string;
  isLandscape?: boolean;
  isPlaceholder?: boolean;
  errorReason?: string;
  fileId?: string;
  fileUrl?: string;
}

const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => {
      reject(new Error('Gagal memuat pustaka PDF.js'));
    };
    document.head.appendChild(script);
  });
};

export const PrintDocument: React.FC<PrintDocumentProps> = ({ submission, onBack, userProfile, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment'>(
    initialTab || 'both'
  );
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [fileOwnership, setFileOwnership] = useState<{[key: string]: 'mine' | 'others' | 'unknown'}>({});
  const [isCopying, setIsCopying] = useState<{[key: string]: boolean}>({});

  const [isConnectedToDrive, setIsConnectedToDrive] = useState(!!getStoredGoogleDriveToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  const handleConnectDriveFromWarning = async () => {
    setIsConnectingDrive(true);
    try {
      const loginRes = await googleDriveLogin();
      if (loginRes.accessToken) {
        setIsConnectedToDrive(true);
        setReloadTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Gagal menghubungkan Google Drive Anda: " + (err.message || err));
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const grandTotal = submission.items.reduce((sum, item) => sum + item.total, 0);

  const billFiles = (submission.googleDriveFiles || []).filter(
    (f: any) => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran
  );
  
  const legacyFiles = !submission.googleDriveFiles && submission.googleDriveFileUrl
    ? [{ url: submission.googleDriveFileUrl, name: submission.googleDriveFileName || 'Lampiran Bukti' }]
    : [];
    
  const activeBillFiles = billFiles.length > 0 ? billFiles : legacyFiles;

  const paymentProofFile = submission.buktiPembayaran || (submission.googleDriveFiles || []).find((f: any) => f.isBuktiPembayaran);
  
  const attachmentFiles = [
    ...activeBillFiles,
    ...(paymentProofFile ? [{ ...paymentProofFile, isBuktiPembayaran: true }] : [])
  ];

  // Check which files are owned by the current user vs others in Drive
  useEffect(() => {
    const checkFilesOwnership = async () => {
      const token = getStoredGoogleDriveToken();
      if (!token || attachmentFiles.length === 0) return;

      const newOwnership: {[key: string]: 'mine' | 'others' | 'unknown'} = {};
      
      for (const file of attachmentFiles) {
        if (!file.url) continue;
        const dMatch = file.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        const idMatch = file.url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
        
        if (fileId) {
          try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=owners(me,emailAddress)`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (res.ok) {
              const data = await res.json();
              const isMine = data.owners && data.owners.some((o: any) => o.me === true);
              newOwnership[fileId] = isMine ? 'mine' : 'others';
            } else {
              // If we fail because we don't own it or can't see owners, it's owned by others
              newOwnership[fileId] = 'others';
            }
          } catch (err) {
            newOwnership[fileId] = 'unknown';
          }
        }
      }
      
      setFileOwnership(prev => ({ ...prev, ...newOwnership }));
    };

    checkFilesOwnership();
  }, [submission, reloadTrigger]);

  const handleCopyFileToMyDrive = async (fileUrl: string, fileName: string) => {
    const dMatch = fileUrl ? fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) : null;
    const idMatch = fileUrl ? fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) : null;
    const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
    
    if (!fileId) {
      alert("Maaf, ID berkas tidak ditemukan di URL ini.");
      return;
    }
    
    let token = getStoredGoogleDriveToken();
    if (!token) {
      try {
        const loginRes = await googleDriveLogin();
        token = loginRes.accessToken;
      } catch (err: any) {
        alert("Gagal menghubungkan Google Drive Anda: " + (err.message || err));
        return;
      }
    }
    
    if (!token) {
      alert("Silakan hubungkan akun Google Drive Anda terlebih dahulu.");
      return;
    }
    
    setIsCopying(prev => ({ ...prev, [fileId]: true }));
    
    try {
      // 1. Copy the file in Drive using copy API
      const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileName
        })
      });
      
      if (!copyRes.ok) {
        const errText = await copyRes.text();
        throw new Error(`Google API error ${copyRes.status}: ${errText}`);
      }
      
      const newFileData = await copyRes.json();
      const newFileId = newFileData.id;
      const newFileUrl = `https://docs.google.com/uc?export=view&id=${newFileId}`;
      
      // 2. Grant permissions to anyone with link as reader
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${newFileId}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (perErr) {
        console.warn("Could not set permissions for copied file:", perErr);
      }
      
      // 3. Update paths in Firestore
      const updatedSubmission = { ...submission };
      
      if (updatedSubmission.googleDriveFileUrl === fileUrl) {
        updatedSubmission.googleDriveFileUrl = newFileUrl;
      }
      
      if (updatedSubmission.buktiPembayaran && updatedSubmission.buktiPembayaran.url === fileUrl) {
        updatedSubmission.buktiPembayaran = {
          ...updatedSubmission.buktiPembayaran,
          url: newFileUrl
        };
      }
      
      if (updatedSubmission.googleDriveFiles) {
        updatedSubmission.googleDriveFiles = updatedSubmission.googleDriveFiles.map(f => {
          if (f.url === fileUrl) {
            return {
              ...f,
              url: newFileUrl
            };
          }
          return f;
        });
      }
      
      await saveSubmissionToFirestore(
        updatedSubmission,
        userProfile?.companyId || 'nmsa',
        userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi'
      );
      
      // Update local states
      setFileOwnership(prev => ({ ...prev, [newFileId]: 'mine' }));
      
      alert(`Sukses menyalin berkas "${fileName}" ke Google Drive Anda! Sekarang berkas aman tersimpan di akun Anda.`);
      
      setReloadTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error("Failed to copy file:", err);
      const errMsg = err.message || String(err);
      if (errMsg.includes("404") || errMsg.toLowerCase().includes("not found")) {
        alert(`Dokumen asli "${fileName}" tidak ditemukan di Google Drive.\n\nKemungkinan:\n1. Berkas telah dihapus atau dipindahkan ke Sampah oleh pemiliknya.\n2. Berkas diunggah menggunakan akun Google Apps yang berbeda, sehingga akun Anda saat ini tidak memiliki hak akses.\n\nSaran: Silakan periksa atau unggah ulang berkas dokumen pendukung Anda melalui tombol "Edit Transaksi".`);
      } else {
        alert("Gagal menyalin berkas ke Google Drive Anda: " + errMsg);
      }
    } finally {
      setIsCopying(prev => ({ ...prev, [fileId]: false }));
    }
  };

  // Dynamic document title based on "Jenis Pengajuan & Nomor Kode" for proper PDF download naming
  useEffect(() => {
    const originalTitle = document.title;
    if (submission) {
      const jenis = submission.jenisPengajuan || 'Pengajuan';
      const kode = submission.kode || 'Dokumen';
      const cleanTitle = `${jenis}-${kode}`
        .replace(/[\s/\\_]+/g, '-') // Replace spaces, slashes, backslashes, underscores with '-'
        .replace(/-+/g, '-')        // Collapse consecutive '-' to a single '-'
        .trim()                     // Trim leading/trailing whitespace
        .replace(/^-+|-+$/g, '');   // Trim leading/trailing dashes

      document.title = cleanTitle || originalTitle;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [submission]);

  useEffect(() => {
    if (attachmentFiles.length === 0) {
      setRenderedPages([]);
      return;
    }

    let isMounted = true;
    const processFiles = async () => {
      setIsLoadingPages(true);
      setLoadError('');
      setRenderedPages([]);

      try {
        const token = getStoredGoogleDriveToken();
        const tempPages: RenderedPage[] = [];

        for (let i = 0; i < attachmentFiles.length; i++) {
          const file = attachmentFiles[i];
          if (isMounted) {
            setLoadingProgress(`Mengunduh berkas ${i + 1} dari ${attachmentFiles.length}: ${file.name}...`);
          }

          if (file.url && (file.url.startsWith('data:') || file.url.startsWith('blob:'))) {
            const isPdf = /\.pdf/i.test(file.name || '') || file.url.startsWith('data:application/pdf');
            if (isPdf) {
              if (isMounted) {
                setLoadingProgress(`Membaca dokumen PDF ${file.name}...`);
              }
              try {
                const pdfjsLib = await loadPdfJs();
                let pdfData: any = file.url;
                if (file.url.startsWith('data:application/pdf;base64,')) {
                  const base64Content = file.url.split(',')[1];
                  const binStr = atob(base64Content);
                  const len = binStr.length;
                  const bytes = new Uint8Array(len);
                  for (let j = 0; j < len; j++) {
                    bytes[j] = binStr.charCodeAt(j);
                  }
                  pdfData = { data: bytes.buffer };
                }
                const pdf = await pdfjsLib.getDocument(pdfData).promise;

                for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
                  if (isMounted) {
                    setLoadingProgress(`Merender PDF ${file.name} - Halaman ${pNum} dari ${pdf.numPages}...`);
                  }
                  const page = await pdf.getPage(pNum);
                  const viewport = page.getViewport({ scale: 2.2 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  if (!context) continue;

                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  await page.render({
                    canvasContext: context,
                    viewport: viewport
                  }).promise;

                  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                  const isLandscape = viewport.width > viewport.height;
                  tempPages.push({
                    id: `b64-pdf-${i}-p${pNum}`,
                    fileName: file.name,
                    fileIndex: i,
                    pageNumber: pNum,
                    dataUrl,
                    isLandscape
                  });
                }
              } catch (pdfErr) {
                console.error('Error rendering base64 PDF, falling back to direct:', pdfErr);
                tempPages.push({
                  id: `direct-b64-${i}-${Date.now()}`,
                  fileName: file.name,
                  fileIndex: i,
                  pageNumber: 1,
                  dataUrl: file.url,
                  isLandscape: false
                });
              }
            } else {
              let isLandscape = false;
              try {
                const img = new Image();
                img.src = file.url;
                await new Promise((resolve) => {
                  img.onload = () => {
                    isLandscape = img.width > img.height;
                    resolve(null);
                  };
                  img.onerror = () => resolve(null);
                });
              } catch (e) {
                console.warn('Failed to parse direct file orientation, defaulting to portrait', e);
              }
              tempPages.push({
                id: `direct-b64-${i}-${Date.now()}`,
                fileName: file.name,
                fileIndex: i,
                pageNumber: 1,
                dataUrl: file.url,
                isLandscape
              });
            }
            continue;
          }

          const dMatch = file.url ? file.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) : null;
          const idMatch = file.url ? file.url.match(/[?&]id=([a-zA-Z0-9_-]+)/) : null;
          const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);

          if (!fileId) {
            console.warn('Tidak dapat menemukan file ID untuk', file?.url);
            continue;
          }

          try {
            const isPdf = /\.pdf/i.test(file.name || '') || file.url.includes('.pdf');

            // Download file content via public export or auth media
            let fileBlob: Blob | null = null;
            try {
              const headers: HeadersInit = {};
              if (token) {
                headers['Authorization'] = `Bearer ${token}`;
              }
              const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
              if (!fileRes.ok) {
                throw new Error(`HTTP ${fileRes.status}`);
              }
              fileBlob = await fileRes.blob();
            } catch (fetchErr: any) {
              console.warn('Gagal mengunduh menggunakan token, mencoba unduhan publik langsung:', fetchErr);
              if (!isPdf) {
                // Non-PDF files (images) do not need CORS-compliant binary blobs!
                // We can render them directly using the Google Drive direct uc export view URL inside img tags
                const dataUrl = `https://docs.google.com/uc?export=view&id=${fileId}`;
                let isLandscape = false;
                try {
                  const img = new Image();
                  img.src = dataUrl;
                  await new Promise((resolve) => {
                    img.onload = () => {
                      isLandscape = img.width > img.height;
                      resolve(null);
                    };
                    img.onerror = () => resolve(null);
                  });
                } catch (e) {
                  console.warn('Failed to parse fallback image orientation, defaulting to portrait', e);
                }

                tempPages.push({
                  id: `${fileId}-fallback-img`,
                  fileName: file.name,
                  fileIndex: i,
                  pageNumber: 1,
                  dataUrl,
                  isLandscape
                });
                continue;
              }
              // Fallback to docs.google.com direct download helper
              try {
                const publicRes = await fetch(`https://docs.google.com/uc?export=download&id=${fileId}`);
                if (!publicRes.ok) {
                  throw new Error('Gagal mengunduh file dari Google Drive. Pastikan berkas dapat diakses publik atau hubungkan ulang akun Google Drive.');
                }
                fileBlob = await publicRes.blob();
              } catch (pdfFallbackErr) {
                throw new Error(`Gagal mengunduh dokumen PDF dari Google Drive. Sesi koneksi Anda kemungkinan telah kedaluwarsa atau berkas tidak diatur publik.`);
              }
            }

            if (isPdf && fileBlob) {
              if (isMounted) {
                setLoadingProgress(`Membaca dokumen PDF ${file.name}...`);
              }
              const pdfjsLib = await loadPdfJs();
              const arrayBuffer = await fileBlob.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

              for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
                if (isMounted) {
                  setLoadingProgress(`Merender PDF ${file.name} - Halaman ${pNum} dari ${pdf.numPages}...`);
                }
                const page = await pdf.getPage(pNum);
                // Scale to 2.2 for high-definition print resolution which preserves micro-text readability
                const viewport = page.getViewport({ scale: 2.2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                  canvasContext: context,
                  viewport: viewport
                }).promise;

                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                const isLandscape = viewport.width > viewport.height;
                tempPages.push({
                  id: `${fileId}-p${pNum}`,
                  fileName: file.name,
                  fileIndex: i,
                  pageNumber: pNum,
                  dataUrl,
                  isLandscape
                });
              }
            } else if (fileBlob) {
              // Treat as single-page image
              const dataUrl = URL.createObjectURL(fileBlob);
              
              // Asynchronously load the image to determine its orientation (portrait or landscape)
              let isLandscape = false;
              try {
                const img = new Image();
                img.src = dataUrl;
                await new Promise((resolve) => {
                  img.onload = () => {
                    isLandscape = img.width > img.height;
                    resolve(null);
                  };
                  img.onerror = () => resolve(null);
                });
              } catch (e) {
                console.warn('Failed to parse image orientation, defaulting to portrait', e);
              }

              tempPages.push({
                id: `${fileId}-img`,
                fileName: file.name,
                fileIndex: i,
                pageNumber: 1,
                dataUrl,
                isLandscape
              });
            }
          } catch (fileErr: any) {
            console.warn(`Error rendering individual attachment ${file.name}:`, fileErr);
            tempPages.push({
              id: `${fileId}-placeholder-error`,
              fileName: file.name,
              fileIndex: i,
              pageNumber: 1,
              dataUrl: '',
              isLandscape: false,
              isPlaceholder: true,
              errorReason: fileErr.message || String(fileErr),
              fileId: fileId,
              fileUrl: file.url
            });
          }
        }

        if (isMounted) {
          setRenderedPages(tempPages);
        }
      } catch (err: any) {
        console.error('Failure rendering attachments:', err);
        if (isMounted) {
          setLoadError(`Gagal mempersiapkan dokumen lampiran bukti: ${err.message || err}. Silakan hubungkan ulang Google Drive Anda.`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPages(false);
        }
      }
    };

    processFiles();

    return () => {
      isMounted = false;
    };
  }, [submission, reloadTrigger]);

  const handlePrint = () => {
    window.print();
  };

  const visiblePages = renderedPages.filter(page => {
    if (activeTab === 'only_invoice_payment') {
      const fileObj = attachmentFiles[page.fileIndex];
      return fileObj?.docType === 'invoice_vendor' || fileObj?.isBuktiPembayaran;
    }
    return true;
  });

  const totalPagesCount = activeTab === 'only_invoice_payment'
    ? visiblePages.length
    : (activeTab === 'pengajuan' || activeTab === 'pengeluaran' ? 1 : (activeTab === 'lampiran' ? renderedPages.length : 2 + renderedPages.length));

  return (
    <div className="space-y-6">
      {/* Tab Controls / Print Actions */}
      <div className="p-4 bg-white rounded-2xl border border-stone-250 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            id="btn-print-back"
            className="p-1.5 hover:bg-stone-100 text-stone-500 hover:text-stone-850 rounded-lg transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="space-y-0.5">
            <h3 className="font-bold text-stone-900">Preview & Cetak Dokumen</h3>
            <p className="text-xs text-stone-400">Pilih format cetak di bawah dan tekan tombol cetak.</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('both')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'both' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
            }`}
          >
            <Layers size={13} />
            {attachmentFiles.length > 0 ? `Cetak Semua (${isLoadingPages ? '...' : totalPagesCount} Hal)` : 'Cetak Dua Halaman'}
          </button>
          <button
            onClick={() => setActiveTab('pengajuan')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'pengajuan' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
            }`}
          >
            <FileText size={13} />
            Hanya Formulir Pengajuan
          </button>
          <button
            onClick={() => setActiveTab('pengeluaran')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === 'pengeluaran' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
            }`}
          >
            <CheckCircle size={13} />
            Hanya Bukti Pengeluaran
          </button>
          {attachmentFiles.length > 0 && (
            <button
              onClick={() => setActiveTab('lampiran')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'lampiran' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-555 hover:text-stone-955'
              }`}
            >
              <Cloud size={13} className="text-amber-600" />
              Hanya Lampiran ({isLoadingPages ? '...' : renderedPages.length})
            </button>
          )}
          {attachmentFiles.some(f => f.docType === 'invoice_vendor' || f.isBuktiPembayaran) && (
            <button
              onClick={() => setActiveTab('only_invoice_payment')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'only_invoice_payment' ? 'bg-amber-100 text-[#917118] border border-amber-200 shadow-3xs font-black' : 'text-stone-550 hover:text-stone-955'
              }`}
              title="Cetak khusus halaman berkas Invoice Vendor dan Bukti Pembayaran saja"
            >
              <FileText size={13} className="text-amber-600" />
              Invoice & Bukti Bayar Saja
            </button>
          )}
        </div>

        {attachmentFiles.length > 0 && (
          <div className="flex flex-col gap-2 p-3 bg-stone-50 border border-stone-200 rounded-xl print:hidden w-full lg:max-w-[340px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cloud size={14} className="text-amber-600" />
                <span className="font-semibold text-stone-700 text-xs">Akses & Status Lampiran:</span>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-sm">
                {attachmentFiles.length} Berkas
              </span>
            </div>
            <div className="text-[11px] max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin">
              {attachmentFiles.map((file, i) => {
                const url = file.url || '';
                const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
                
                const ownership = fileId ? fileOwnership[fileId] : 'unknown';
                const copying = fileId ? isCopying[fileId] : false;

                return (
                  <div key={i} className="p-1.5 bg-white border border-stone-200 rounded-lg flex flex-col gap-1 shadow-3xs">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <a 
                          href={url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="font-bold text-stone-850 hover:text-amber-700 hover:underline block truncate"
                          title={file.name}
                        >
                          {i + 1}. {file.name}
                        </a>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1 mt-0.5">
                      <span className="text-[9px] font-mono leading-none flex items-center gap-1">
                        {ownership === 'mine' ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Tersimpan di Drive Anda
                          </span>
                        ) : ownership === 'others' ? (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Di Drive Akun Lain
                          </span>
                        ) : (
                          <span className="text-stone-400">Memeriksa kepemilikan...</span>
                        )}
                      </span>

                      {fileId && ownership === 'others' && (
                        <button
                          onClick={() => handleCopyFileToMyDrive(url, file.name)}
                          disabled={copying}
                          className="text-[9px] bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 text-white font-bold px-2 py-0.5 rounded transition flex items-center gap-0.5 shrink-0"
                        >
                          {copying ? (
                            <>
                              <Loader2 size={10} className="animate-spin" />
                              <span>Menyalin...</span>
                            </>
                          ) : (
                            <>
                              <Cloud size={10} />
                              <span>Salin ke Drive Saya</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handlePrint}
          id="btn-print-document"
          className="flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white font-bold px-5 py-2 rounded-xl transition"
        >
          <Printer size={16} />
          Cetak PDF / A4
        </button>
      </div>

      {/* DOCUMENT PAGE HOLDER */}
      <div className="flex flex-col items-center space-y-8 print:space-y-0 print:bg-white">
        
        {/* ================= PAGE 1: BUKTI PENGELUARAN KAS / BANK ================= */}
        {(activeTab === 'both' || activeTab === 'pengeluaran') && (
          <div className="w-[210mm] min-h-[297mm] bg-white p-[15mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 page-break">
            
            {/* Header Block Left (Logo) & Right (Code & Tanggal) */}
            <div className="flex justify-between items-start mb-6">
              <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />

              <div className="flex flex-col items-end pt-2">
                <div className="text-right text-stone-400 font-mono text-[10px] mb-1">
                  Halaman: 1 / {isLoadingPages ? '...' : totalPagesCount} (Kas/Bank)
                </div>
                {/* Double border or standard rectangular HO code box */}
                <div className="border border-black px-8 py-1.5 font-bold text-base text-black bg-stone-50 mb-2 min-w-[120px] text-center font-mono">
                  {submission.kode}
                </div>
                <div className="text-xs text-black font-semibold">
                  Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                </div>
              </div>
            </div>

            {/* Document Title Block */}
            <div className="border-[2px] border-black bg-white py-2.5 text-center mb-6">
              <h1 className="text-sm font-bold text-black font-sans uppercase tracking-[1.5px]">
                BUKTI PENGELUARAN KAS / BANK
              </h1>
            </div>

            {/* Metadata Fields Area */}
            <div className="text-sm font-sans space-y-2 mb-6 px-1">
              <div className="grid grid-cols-[140px_10px_1fr] gap-y-3">
                <span className="font-semibold text-black">Dibayarkan Kepada</span>
                <span className="text-black">:</span>
                <span className="text-black font-bold">{submission.dibayarkanKepada}</span>

                {submission.isPettyCash && (
                  <>
                    <span className="font-semibold text-black">Pemegang Petty Cash</span>
                    <span className="text-black">:</span>
                    <span className="text-black font-bold text-violet-800">{submission.pettyCashCustodian}</span>
                  </>
                )}

                <span className="font-semibold text-black">Jenis Pengajuan</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.jenisPengajuan}</span>

                <span className="font-semibold text-black">Kode</span>
                <span className="text-black">:</span>
                <span className="text-black font-mono">{submission.kode}</span>

                <span className="font-semibold text-black">Dibayarkan dengan</span>
                <span className="text-black">:</span>
                <div className="flex items-center gap-6">
                  {/* Tunai block check */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-5 border border-black flex items-center justify-center font-bold text-black bg-stone-50 font-mono">
                      {submission.dibayarkanDengan === 'Tunai' ? 'X' : ''}
                    </div>
                    <span>Tunai</span>
                  </div>

                  {/* Cek/Transfer block check */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-5 border border-black flex items-center justify-center font-bold text-black bg-stone-50 font-mono">
                      {submission.dibayarkanDengan === 'Cek/Transfer' ? 'X' : ''}
                    </div>
                    <span>Cek / Transfer</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Voucher */}
            <div className="mb-6">
              <table className="w-full border-collapse border-[1.5px] border-black text-sm">
                <thead>
                  <tr className="bg-white border-b-[1.5px] border-black text-black font-bold uppercase text-xs">
                    <th className="border-r border-black py-2.5 px-4 text-left">JENIS PENGAJUAN</th>
                    <th className="py-2.5 px-4 text-right w-64">JUMLAH</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.items.map((item) => (
                    <tr key={item.id} className="border-b border-black text-black min-h-[70px]">
                      <td className="border-r border-black py-5 px-4 leading-relaxed font-semibold">
                        {item.item}
                      </td>
                      <td className="py-5 px-4 text-right font-mono font-bold text-base">
                        Rp <span className="float-right">{formatRupiah(item.total)}</span>
                      </td>
                    </tr>
                  ))}
                  
                  {/* Exact total spacer block like the screenshot */}
                  <tr className="border-t-[1.5px] border-black font-bold text-black">
                    <td className="border-r border-black py-2 px-4 bg-stone-50"></td>
                    <td className="py-2.5 px-4 text-right font-mono text-base font-bold bg-[#fcfcfc]">
                      Rp <span className="float-right">{formatRupiah(grandTotal)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Terbilang block - Very professional accounting requirement */}
            <div className="border border-black p-3.5 mb-8 bg-stone-50/30 text-sm flex gap-2">
              <span className="font-bold text-black">Terbilang :</span>
              <span className="text-black italic font-medium">
                "{numberToTerbilang(grandTotal)}"
              </span>
            </div>

            {/* 4 Cells Signatures Table Grid */}
            <table className="w-full border-collapse border border-black bg-white mt-12 text-center text-xs table-fixed">
              <thead>
                <tr className="bg-stone-50 border-b border-black text-[10px] font-bold uppercase text-stone-700">
                  <th className="border-r border-black py-1.5 w-1/4">Diverifikasi</th>
                  <th className="border-r border-black py-1.5 w-1/4">Disetujui</th>
                  <th className="border-r border-black py-1.5 w-1/4">Disetujui</th>
                  <th className="py-1.5 w-1/4">Dibukukan</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ height: '110px' }} className="align-bottom">
                  <td className="border-r border-black py-2 px-1 pb-3 align-bottom">
                    <div className="text-black font-bold text-[11px] leading-tight uppercase truncate">{submission.diverifikasiOleh}</div>
                    <div className="text-[9px] text-stone-500 font-medium font-mono border-t border-stone-200 mt-1 pt-1 mx-2 uppercase truncate">{submission.diverifikasiJabatan}</div>
                  </td>
                  <td className="border-r border-black py-2 px-1 pb-3 align-bottom">
                    <div className="text-black font-bold text-[11px] leading-tight uppercase truncate">{submission.disetujuiOleh}</div>
                    <div className="text-[9px] text-stone-500 font-medium font-mono border-t border-stone-200 mt-1 pt-1 mx-2 uppercase text-stone-500">Dir Keuangan</div>
                  </td>
                  <td className="border-r border-black py-2 px-1 pb-3 align-bottom">
                    <div className="text-black font-bold text-[11px] leading-tight uppercase truncate">{submission.disetujuiOleh2}</div>
                    <div className="text-[9px] text-stone-500 font-medium font-mono border-t border-stone-200 mt-1 pt-1 mx-2 uppercase truncate">{submission.disetujuiJabatan2 || 'DIREKTUR'}</div>
                  </td>
                  <td className="py-2 px-1 pb-3 align-bottom">
                    <div className="text-black font-bold text-[11px] leading-tight uppercase truncate">{submission.dibukukanOleh}</div>
                    <div className="text-[9px] text-stone-500 font-medium font-mono border-t border-stone-200 mt-1 pt-1 mx-2 uppercase truncate">{submission.dibukukanJabatan}</div>
                  </td>
                </tr>
              </tbody>
            </table>



          </div>
        )}

        {/* Divider for Screen View, hidden during printing */}
        {activeTab === 'both' && (
          <div className="w-[210mm] border-t-2 border-dashed border-stone-300 py-2 print:hidden flex justify-center">
            <span className="text-xs bg-stone-100 text-stone-500 px-3 py-1 rounded-full font-semibold">BATAS HALAMAN CETAK (PAGE BREAK)</span>
          </div>
        )}

        {/* ================= PAGE 2: FORMULIR PENGAJUAN HO ================= */}
        {(activeTab === 'both' || activeTab === 'pengajuan') && (
          <div className="w-[210mm] min-h-[297mm] bg-white p-[15mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 page-break">
            
            {/* Header Area */}
            <div className="flex justify-between items-start mb-6">
              {/* Logo reconstructed with exact details */}
              <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
              
              <div className="text-right text-stone-400 font-mono text-[10px] mt-2">
                Halaman: 2 / {isLoadingPages ? '...' : totalPagesCount} (Pengajuan)
              </div>
            </div>

            {/* Document Title Block */}
            <div className="border-[2px] border-black bg-[#D9D9D9] py-2.5 text-center mb-6">
              <h1 className="text-base font-bold text-black font-sans uppercase tracking-[1px]">
                FORMULIR PENGAJUAN HO
              </h1>
            </div>

            {/* Metadata Fields Box */}
            <div className="border border-black p-4 mb-6 text-sm font-sans">
              <div className="grid grid-cols-[140px_10px_1fr] gap-y-2">
                <span className="font-semibold text-black">Lokasi</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.lokasi}</span>

                <span className="font-semibold text-black">Tanggal</span>
                <span className="text-black">:</span>
                <span className="text-black">{formatDateIndonesian(submission.tanggal)}</span>

                <span className="font-semibold text-black">Jenis Pengajuan</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.jenisPengajuan}</span>

                <span className="font-semibold text-black">Kode</span>
                <span className="text-black">:</span>
                <span className="text-black font-mono">{submission.kode}</span>
              </div>
            </div>

            {/* Main Items Table */}
            <div className="mb-6">
              <table className="w-full border-collapse border-[1.5px] border-black text-sm table-fixed">
                <thead>
                  <tr className="bg-[#D9D9D9]/30 border-b-[1.5px] border-black text-black font-bold uppercase text-xs">
                    <th className="border-r border-black py-2.5 px-1 text-center w-[5%]">NO</th>
                    <th className="border-r border-black py-2.5 px-3 text-left w-[41%]">ITEM DETIL (INVOICE / DESKRIPSI)</th>
                    <th className="border-r border-black py-2.5 px-2 text-center w-[8%]">VOL</th>
                    <th className="border-r border-black py-2.5 px-3 text-center w-[24%]">TOTAL (RP)</th>
                    <th className="py-2.5 px-3 text-left w-[22%]">KETERANGAN</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-black align-top text-black">
                      <td className="border-r border-black py-3 px-1 text-center font-mono text-xs">{idx + 1}</td>
                      <td className="border-r border-black py-3 px-3 font-semibold text-xs leading-relaxed break-words whitespace-pre-wrap text-stone-900">{item.item}</td>
                      <td className="border-r border-black py-3 px-2 text-center text-xs text-stone-800">{item.jumlahVolume || '-'}</td>
                      <td className="border-r border-black py-3 px-3 text-right font-mono font-bold text-xs font-semibold">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-3 px-3 text-stone-700 text-[10px] italic break-all break-words whitespace-pre-wrap leading-tight text-left">{item.keterangan || '-'}</td>
                    </tr>
                  ))}
                  
                  {/* Total Row */}
                  <tr className="border-t-[1.5px] border-black font-bold text-black bg-stone-50">
                    <td colSpan={3} className="border-r border-black py-3 px-4 text-center uppercase tracking-wider text-xs">
                       TOTAL PENYERAHAN
                    </td>
                    <td className="border-r border-black py-3 px-3 text-right font-mono text-sm font-bold bg-amber-50/10">
                      {formatRupiah(grandTotal)}
                    </td>
                    <td className="py-3 px-3 bg-stone-50"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures Row */}
            <div className="flex justify-between px-10 mb-8 mt-12 text-sm text-black">
              <div className="flex flex-col items-center w-60">
                 <span className="font-sans font-medium mb-16">Dibuat Oleh</span>
                <span className="border-b border-black pb-0.5 px-4 font-bold tracking-wide">
                  {submission.dibuatOleh}
                </span>
              </div>
              
              <div className="flex flex-col items-center w-60">
                <span className="font-sans font-medium mb-16">Disetujui</span>
                <span className="border-b border-black pb-0.5 px-4 font-bold tracking-wide">
                  {submission.disetujuiOleh}
                </span>
              </div>
            </div>

            {/* Notes Section - Exact match to PDF 1 bottom layout */}
            <div className="mt-8">
              <span className="block text-xs font-bold text-black tracking-wide uppercase mb-1">
                NOTE :
              </span>
              <div className="border-[1.5px] border-black p-4 min-h-[70px] rounded-xs text-sm text-stone-800 leading-relaxed font-sans bg-stone-50/30">
                {submission.notes ? submission.notes : ""}
              </div>
            </div>

          </div>
        )}

        {/* Loading state indicator on screen only */}
        {isLoadingPages && (
          <div className="w-[210mm] min-h-[140mm] bg-white border border-stone-250 shadow-md rounded-xl p-8 flex flex-col items-center justify-center gap-3 print:hidden">
            <Loader2 size={36} className="animate-spin text-amber-500" />
            <span className="text-sm font-semibold text-stone-700">Mempersiapkan Lembar Lampiran Pendukung Transaksi...</span>
            <span className="text-xs text-stone-400 font-mono animate-pulse">{loadingProgress}</span>
          </div>
        )}

        {/* Error state indicator on screen only */}
        {loadError && (
          <div className="w-[210mm] min-h-[100mm] bg-rose-50 border border-rose-250 rounded-xl p-8 flex flex-col items-center justify-center gap-3 print:hidden shadow-xs">
            <Cloud size={36} className="text-rose-500" />
            <span className="text-sm font-bold text-rose-800 text-center">{loadError}</span>
            <p className="text-xs text-rose-600 text-center max-w-lg mb-2 leading-relaxed">
              Sesi koneksi Google Drive Anda kemungkinan sudah kedaluwarsa (berlaku maksimum 60 menit semenjak login terakhir demi keamanan Google), atau berkas tidak diatur agar dapat diakses oleh publik. Silakan sambungkan kembali.
            </p>
            <button
              onClick={async () => {
                try {
                  setIsLoadingPages(true);
                  setLoadError('');
                  setLoadingProgress('Menghubungkan ke Google Drive...');
                  const res = await googleDriveLogin();
                  if (res && res.accessToken) {
                    setReloadTrigger(prev => prev + 1);
                  } else {
                    throw new Error('Gagal mendapatkan token akses baru.');
                  }
                } catch (err: any) {
                  setLoadError(`Gagal menyambungkan kembali Google Drive: ${err?.message || err}`);
                } finally {
                  setIsLoadingPages(false);
                }
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Cloud size={14} />
              Sambungkan Ulang Google Drive
            </button>
          </div>
        )}

        {/* ================= PAGE 3+: LAMPIRAN DOKUMEN BUKTI (DYNAMIC SEVERAL PAGES) ================= */}
        {(activeTab === 'both' || activeTab === 'lampiran' || activeTab === 'only_invoice_payment') && !isLoadingPages && visiblePages.map((page, idx) => {
          const pageNum = activeTab === 'only_invoice_payment' ? (1 + idx) : (3 + idx);
          const fileObj = attachmentFiles[page.fileIndex];
          const fileLabel = fileObj?.isBuktiPembayaran ? 'Bukti Bayar'
                          : fileObj?.docType === 'po' ? 'PO'
                          : fileObj?.docType === 'lhv' ? 'LHV'
                          : fileObj?.docType === 'draft_survei' ? 'Survei'
                          : fileObj?.docType === 'bill_of_lading' ? 'Bill of Lading'
                          : fileObj?.docType === 'cargo_manifest' ? 'Cargo'
                          : fileObj?.docType === 'cow_coa_ds_bongkar' ? 'COW & COA DS Bongkar'
                          : fileObj?.docType === 'bukti_pembayaran_batubara' ? 'P.Batubara'
                          : fileObj?.docType === 'bukti_shipment_tongkang_founder' ? 'S.Tongkang'
                          : fileObj?.docType === 'bukti_pajak_trader_founder' ? 'Pajak Trader'
                          : fileObj?.docType === 'merged_all' ? 'Gabungan Dokumen Utama'
                          : `Lampiran B${page.fileIndex + 1}`;

          const isLandscape = page.isLandscape === true;

          return (
            <React.Fragment key={page.id}>
              {/* Divider for Screen View, hidden during printing */}
              {activeTab === 'both' && (
                <div className={`${isLandscape ? 'w-[297mm]' : 'w-[210mm]'} border-t-2 border-dashed border-stone-300 py-3 print:hidden flex justify-center transition-all duration-200`}>
                  <span className="text-xs bg-stone-100 text-[#917118] px-3 py-1 rounded-full font-semibold uppercase font-mono">
                    BATAS HALAMAN {fileLabel.toUpperCase()} (PAGE BREAK - {isLandscape ? 'LANDSCAPE' : 'PORTRAIT'})
                  </span>
                </div>
              )}

              {/* Responsive container matching orientation format on screen & print */}
              <div 
                className={`bg-white border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 page-break relative overflow-hidden bg-stone-50/10 flex items-center justify-center transition-all duration-200 ${
                  isLandscape 
                    ? 'w-[297mm] min-h-[210mm] h-[210mm] print-landscape' 
                    : 'w-[210mm] min-h-[297mm] h-[297mm] print-portrait'
                }`}
              >
                {page.isPlaceholder && page.fileId ? (
                  <div className="w-full h-full relative flex flex-col items-center justify-between bg-stone-100">
                    {/* Native Google Drive Embedded Viewer */}
                    <iframe
                      src={`https://drive.google.com/file/d/${page.fileId}/preview`}
                      className="w-full h-full border-0 z-0 bg-stone-50"
                      allow="autoplay"
                      referrerPolicy="no-referrer"
                    />

                    {/* Floating Controls Overlay specifically configured for quick sync and manual copy overrides */}
                    <div className="absolute bottom-4 left-4 right-4 bg-stone-900/90 hover:bg-stone-950/95 text-white rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md z-10 print:hidden transition-all duration-150 border border-stone-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-500/10 border border-amber-500/35 rounded-lg text-[#D4AF37]">
                          <Cloud size={14} />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-extrabold tracking-wide uppercase text-stone-300">Pratinjau Langsung Google Drive</p>
                          <p className="text-[9px] text-stone-400 font-medium">Bekerja via otorisasi browser Anda. Jika file tidak muncul, Anda dapat menyalin file atau membuka tab baru.</p>
                        </div>
                      </div>

                      {(() => {
                        const file = attachmentFiles[page.fileIndex];
                        const url = file?.url || '';
                        const copying = isCopying[page.fileId!];

                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={handleConnectDriveFromWarning}
                              disabled={isConnectingDrive}
                              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-750 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1.5"
                            >
                              <RefreshCw size={11} className={isConnectingDrive ? 'animate-spin' : ''} />
                              Ganti Akun
                            </button>

                            <button
                              onClick={() => handleCopyFileToMyDrive(url, file.name)}
                              disabled={copying}
                              className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#Bca031] disabled:bg-stone-700 text-stone-950 font-extrabold rounded-lg text-[10px] transition flex items-center gap-1.5 cursor-pointer"
                            >
                              {copying ? (
                                <>
                                  <Loader2 size={11} className="animate-spin text-stone-950" />
                                  Menyalin...
                                </>
                              ) : (
                                <>
                                  <Cloud size={11} className="text-stone-950" />
                                  Salin ke GDrive Saya
                                </>
                              )}
                            </button>
                            
                            <a
                              href={`https://drive.google.com/file/d/${page.fileId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-750 text-white font-bold rounded-lg text-[10px] transition flex items-center gap-1.5 cursor-pointer no-underline"
                            >
                              Buka di Tab Baru ↗
                            </a>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : page.isPlaceholder ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 max-w-xl animate-fade-in">
                    {/* Modern Secure Lock Badge */}
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-[#D4AF37]/10 rounded-full blur-xl opacity-60 animate-pulse"></div>
                      <div className="relative h-20 w-20 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center shadow-xs">
                        <div className="h-16 w-16 rounded-full bg-amber-50/50 border border-amber-100 flex items-center justify-center">
                          <Lock className="text-[#917118] w-7 h-7" />
                        </div>
                      </div>
                    </div>

                    <h4 className="text-base font-bold text-stone-900 tracking-wide uppercase mb-1">
                      Lampiran Dokumen: {fileLabel}
                    </h4>
                    <span className="text-[10px] text-stone-500 font-mono mb-6 bg-stone-100 border border-stone-200 px-3 py-1 rounded-full max-w-sm truncate inline-block">
                      {page.fileName}
                    </span>

                    {/* Classy Corporate Notification Box */}
                    <div className="bg-white border border-stone-250 border-t-4 border-t-[#D4AF37] rounded-2xl p-6 text-left max-w-md shadow-sm space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-[#917118] shrink-0 mt-0.5">
                          <ShieldAlert size={18} />
                        </div>
                        <div className="space-y-1">
                          <h5 className="text-[11px] font-extrabold text-stone-900 tracking-wide uppercase">
                            Proteksi Dokumen Google Drive
                          </h5>
                          <p className="text-[11px] text-stone-600 leading-relaxed">
                            Akun aktif Anda saat ini belum memiliki hak akses langsung atau otorisasi penuh untuk menampilkan berkas ini dari pihak pengunggah asal.
                          </p>
                        </div>
                      </div>

                      <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 font-mono">Langkah Solusi</span>
                        </div>
                        <p className="text-[11px] text-stone-600 leading-relaxed font-medium">
                          Silakan tautkan akun Google Drive Anda atau lakukan penyalinan berkas secara instan ke Drive pribadi Anda demi kenyamanan pratinjau dan pencetakan dokumen.
                        </p>
                      </div>

                      {/* Action Interface */}
                      {(() => {
                        const file = attachmentFiles[page.fileIndex];
                        const url = file?.url || '';
                        const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                        const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
                        const copying = fileId ? isCopying[fileId] : false;

                        return (
                          <div className="pt-3 border-t border-stone-150 flex flex-col gap-2">
                            <button
                              onClick={handleConnectDriveFromWarning}
                              disabled={isConnectingDrive}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-300 text-white font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer"
                            >
                              <Cloud size={14} className="text-[#D4AF37]" />
                              <span>{isConnectedToDrive ? 'Ganti Otorisasi Google Drive' : 'Hubungkan Akun Google Drive'}</span>
                            </button>

                            {fileId && (
                              <button
                                onClick={() => handleCopyFileToMyDrive(url, file.name)}
                                disabled={copying}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#Bca031] disabled:bg-stone-200 disabled:text-stone-400 text-stone-900 font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer"
                              >
                                {copying ? (
                                  <>
                                    <Loader2 size={13} className="animate-spin text-stone-900" />
                                    <span>Menyalin Dokumen...</span>
                                  </>
                                ) : (
                                  <>
                                    <Cloud size={13} className="text-stone-900" />
                                    <span>Salin ke GDrive Saya & Tampilkan</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <img
                    src={page.dataUrl}
                    alt={page.fileName}
                    className="max-w-full max-h-full object-contain"
                  />
                )}

                {/* Floating screen-only badge to maintain complete page counts */}
                <div className="absolute top-4 right-4 bg-stone-900/85 text-white font-mono text-[9px] px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5 select-none print:hidden z-10">
                  <FileText size={10} className="text-amber-400" />
                  <span>
                    Halaman {pageNum} / {totalPagesCount} ({fileLabel} - Hal {page.pageNumber} - {isLandscape ? 'Landscape' : 'Portrait'})
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}

      </div>

      {/* Styled inline media-print stylesheet to dynamically align perfectly fit elements */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }
          @page landscape-page {
            size: A4 landscape;
            margin: 12mm 15mm 12mm 15mm;
          }
          html, body, #app-root, main, #app-root > main {
            background-color: white !important;
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Ensure wrapper elements do not carry external paddings/spacings in print content */
          .space-y-6, .space-y-8 {
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          .print\:hidden {
            display: none !important;
          }
          /* Ensure each form fits exactly on a single A4 page */
          .page-break {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            box-shadow: none !important;
          }
          .page-break.print-landscape {
            page: landscape-page !important;
          }
          .page-break img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
            max-width: 100% !important;
            max-height: none !important;
          }
          .page-break:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
          /* Ensure no cutoffs or overlapping content */
          table {
            page-break-inside: avoid;
          }
        }
      `}</style>

    </div>
  );
};
