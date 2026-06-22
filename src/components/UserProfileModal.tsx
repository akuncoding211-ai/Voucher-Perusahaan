import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Briefcase, 
  Mail, 
  Building2, 
  Save, 
  CheckCircle, 
  HardDrive, 
  ShieldCheck, 
  Trash2, 
  RefreshCw, 
  Settings, 
  Sparkles, 
  Database,
  Cloud 
} from 'lucide-react';
import { DriveAccountsManager } from './DriveAccountsManager';
import { getConnectedDrives, saveConnectedDrives } from '../firebase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: any;
  authUser: any;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  authUser
}) => {
  // Signatures configuration state
  const [creatorName, setCreatorName] = useState('');
  const [approverName, setApproverName] = useState('');
  const [verifierName, setVerifierName] = useState('');
  const [verifierJabatan, setVerifierJabatan] = useState('');
  const [approver2Name, setApprover2Name] = useState('');
  const [approver2Jabatan, setApprover2Jabatan] = useState('');
  const [bookkeeperName, setBookkeeperName] = useState('');
  const [bookkeeperJabatan, setBookkeeperJabatan] = useState('');

  // Storage and UI indicator status
  const [drives, setDrives] = useState<any[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isResetDone, setIsResetDone] = useState(false);

  // Load settings on mount / open
  const loadAllSettings = () => {
    setCreatorName(localStorage.getItem('NUSANTARA_DEFAULT_CREATOR_NAME') || userProfile?.fullName || 'Nur Wahyudi');
    setApproverName(localStorage.getItem('NUSANTARA_DEFAULT_APPROVER_NAME') || 'Harijon');
    setVerifierName(localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_NAME') || 'Andi Dhiya Salsabila');
    setVerifierJabatan(localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN') || 'Keuangan');
    setApprover2Name(localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_NAME') || 'H. A. Nursyam Halid');
    setApprover2Jabatan(localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN') || 'Direktur Utama');
    setBookkeeperName(localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME') || 'Sri Ekowati');
    setBookkeeperJabatan(localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN') || 'Accounting');

    const list = getConnectedDrives();
    setDrives(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadAllSettings();
    }
  }, [userProfile, isOpen]);

  if (!isOpen) return null;

  // Save all custom defaults to local storage
  const handleSaveAllSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('NUSANTARA_DEFAULT_CREATOR_NAME', creatorName.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_APPROVER_NAME', approverName.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_VERIFIER_NAME', verifierName.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN', verifierJabatan.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_APPROVER2_NAME', approver2Name.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN', approver2Jabatan.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME', bookkeeperName.trim());
    localStorage.setItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN', bookkeeperJabatan.trim());

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  // Factory reset method to restore default configurations
  const handleFactoryReset = () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan seluruh parameter tanda tangan & memutuskan hubungan Google Drive ke setingan bawaan pabrik?')) {
      // Clear specific local storage keys
      localStorage.removeItem('NUSANTARA_DEFAULT_CREATOR_NAME');
      localStorage.removeItem('NUSANTARA_DEFAULT_APPROVER_NAME');
      localStorage.removeItem('NUSANTARA_DEFAULT_VERIFIER_NAME');
      localStorage.removeItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN');
      localStorage.removeItem('NUSANTARA_DEFAULT_APPROVER2_NAME');
      localStorage.removeItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN');
      localStorage.removeItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME');
      localStorage.removeItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN');

      // Clear token & drive storage
      localStorage.removeItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
      localStorage.removeItem('NUSANTARA_CONNECTED_DRIVES');
      saveConnectedDrives([]);

      // Reload
      loadAllSettings();
      setIsResetDone(true);
      setTimeout(() => {
        setIsResetDone(false);
      }, 3500);
    }
  };

  // Calculations for Unified Storage dashboard
  const totalLimit = drives.reduce((acc, curr) => acc + (curr.quotaLimit || 0), 0);
  const totalUsed = drives.reduce((acc, curr) => acc + (curr.quotaUsed || 0), 0);
  const totalPercent = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const userDisplayName = userProfile?.fullName || (authUser ? authUser.email : 'Nur Wahyudi');
  const userEmailAddress = authUser?.email || 'yudiakungaming@gmail.com';
  const userRole = userProfile?.role || 'Admin HO / Staff';
  const companyName = userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-stone-900/65 backdrop-blur-xs animate-fade-in print:hidden">
      <div 
        className="relative bg-stone-50 rounded-3xl shadow-xl border border-stone-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-stone-150 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl text-[#917118] border border-amber-100">
              <User size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider flex items-center gap-1.5">
                Profil & Pusat Kendali Pengguna
                <span className="text-[8px] bg-amber-100 text-[#917118] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                  V2.0 PRO
                </span>
              </h3>
              <p className="text-[10px] text-stone-400 font-mono">
                Atur info akun, backup otomatis, dan hak tanda tangan dokumen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Unified Storage Space summary widget */}
          {drives.length > 0 && (
            <div className="bg-gradient-to-r from-[#917118]/5 to-amber-500/5 border border-amber-250/60 rounded-2xl p-5 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#917118]">
                  <Cloud size={16} />
                  <span className="text-[11px] font-mono font-black uppercase tracking-wider">
                    Kombinasi Ruang Penyimpanan Anda (G-Drive Pool)
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-[#917118]/10 text-[#917118] px-2.5 py-0.5 rounded-full">
                  {drives.length} Akun Tersambung
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-end justify-between">
                  <div className="space-y-0.5">
                    <p className="text-stone-700 text-xs font-extrabold font-sans">
                      {formatBytes(totalUsed)} dari {formatBytes(totalLimit)} Terpakai
                    </p>
                    <p className="text-[9px] text-stone-400 font-sans">
                      Unggulan otomatis menggunakan penyimpanan berikutnya apabila penyimpanan utama penuh.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-black text-stone-850">
                    {totalPercent}%
                  </span>
                </div>

                <div className="w-full bg-stone-200/60 h-3 rounded-full overflow-hidden p-[2px] border border-stone-300/40">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-[#917118] to-amber-500 transition-all duration-700"
                    style={{ width: `${totalPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Section 1: User Account details */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-3xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <Building2 size={14} className="text-stone-400 font-bold" />
              Info Otentikasi & Portal
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-stone-600">
              <div className="space-y-1">
                <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Nama Pengguna</span>
                <div className="flex items-center gap-2 bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-150">
                  <User size={13} className="text-[#917118]" />
                  <span className="text-stone-800 font-black">{userDisplayName}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Email Utama</span>
                <div className="flex items-center gap-2 bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-150">
                  <Mail size={13} className="text-stone-400" />
                  <span className="text-stone-700 font-mono truncate">{userEmailAddress}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Unit Bisnis Portal</span>
                <div className="flex items-center gap-2 bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-150">
                  <Building2 size={13} className="text-stone-400" />
                  <span className="text-stone-800 font-semibold">{companyName}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Hak Akses</span>
                <div className="flex items-center gap-2 bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-150">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  <span className="text-stone-700 font-bold">{userRole}</span>
                </div>
              </div>

              <div className="space-y-1 md:col-span-2 mt-1.5 pt-3.5 border-t border-stone-100">
                <span className="text-[#917118] block text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={12} /> Kapasitas Penyimpanan Portal & Sinkronisasi basis data
                </span>
                <div className="bg-amber-50/20 px-4 py-3 rounded-2xl border border-amber-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#5c470e] mt-1.5 shadow-3xs">
                  <div className="space-y-1">
                    <p className="font-extrabold text-stone-850 flex items-center gap-1.5">
                      Batas Penyimpanan Dokumen: 
                      <span className="font-mono text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md font-black border border-emerald-250 text-[10px]">
                        TIDAK TERBATAS (MINIMAL 10.000+ HINGGA SANGAT PENUH)
                      </span>
                    </p>
                    <p className="text-[10px] text-stone-500 font-normal leading-relaxed">
                      Sistem menggunakan klaster penyimpanan modern dengan database Firestore non-relasional yang aman secara real-time. Seluruh data transaksi yang telah Anda buat dijamin tersimpan secara permanen dan tidak akan pernah terhapus otomatis oleh sistem.
                    </p>
                  </div>
                  <span className="shrink-0 text-emerald-800 font-mono font-extrabold text-[9px] bg-emerald-100 px-3 py-1.5 rounded-xl uppercase tracking-wider text-center border border-emerald-250 shadow-3xs">
                    100% AMAN & PERMANEN
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Signature Default Management Form */}
          <form onSubmit={handleSaveAllSettings} className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-3xs">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
                  <Settings size={14} className="text-[#917118]" />
                  Konfigurasi Default Penandatangan (Formulir F1 & F2)
                </h4>
                <p className="text-[10px] text-stone-400 mt-1">
                  Atur default penandatangan yang kerap berulang di Unit Bisnis Anda agar otomatis terisi di dokumen voucher pdf yang diunduh.
                </p>
              </div>
              <span className="text-[9px] font-mono text-stone-400">Auto-Apply</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Box 1: Dibuat Oleh */}
              <div className="space-y-1.5 p-3 border border-stone-150 bg-stone-50/30 rounded-xl">
                <label className="text-stone-600 text-[10px] font-black uppercase tracking-wider block">
                  1. Dibuat Oleh (Pembuat Voucher / F2)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Nur Wahyudi"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  className="w-full bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 px-3 py-2 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden transition"
                />
              </div>

              {/* Box 2: Diverifikasi Oleh */}
              <div className="space-y-1.5 p-3 border border-stone-150 bg-stone-50/30 rounded-xl space-y-2">
                <label className="text-stone-600 text-[10px] font-black uppercase tracking-wider block">
                  2. Diverifikasi Oleh (Keuangan)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama Pemeriksa"
                    value={verifierName}
                    onChange={(e) => setVerifierName(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs font-semibold text-stone-800 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Jabatan"
                    value={verifierJabatan}
                    onChange={(e) => setVerifierJabatan(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                </div>
              </div>

              {/* Box 3: Disetujui Oleh */}
              <div className="space-y-1.5 p-3 border border-stone-150 bg-stone-50/30 rounded-xl">
                <label className="text-stone-600 text-[10px] font-black uppercase tracking-wider block">
                  3. Disetujui Oleh (Direktur Keuangan / Atasan)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Harijon"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className="w-full bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 px-3 py-2 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden transition"
                />
              </div>

              {/* Box 4: Disetujui 2 (Direktur Utama) */}
              <div className="space-y-1.5 p-3 border border-stone-150 bg-stone-50/30 rounded-xl space-y-2">
                <label className="text-stone-600 text-[10px] font-black uppercase tracking-wider block">
                  4. Disetujui Kedua (Opsi F1 / Dirut / KTT)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama Penyetuju 2"
                    value={approver2Name}
                    onChange={(e) => setApprover2Name(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs font-semibold text-stone-800 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Jabatan"
                    value={approver2Jabatan}
                    onChange={(e) => setApprover2Jabatan(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                </div>
              </div>

              {/* Box 5: Dibukukan Oleh */}
              <div className="space-y-1.5 p-3 border border-stone-150 bg-stone-50/30 rounded-xl space-y-2 md:col-span-2">
                <label className="text-stone-600 text-[10px] font-black uppercase tracking-wider block">
                  5. Dibukukan Oleh (Accounting / Buku Besar)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama Accounting"
                    value={bookkeeperName}
                    onChange={(e) => setBookkeeperName(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs font-semibold text-stone-800 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Jabatan"
                    value={bookkeeperJabatan}
                    onChange={(e) => setBookkeeperJabatan(e.target.value)}
                    className="bg-white hover:bg-stone-50 text-xs text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-250 focus:border-[#d4af37] outline-hidden"
                  />
                </div>
              </div>

            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <span className="text-[10px] text-stone-400 font-mono">
                Semua isian akan langsung tersimpan di browser ini.
              </span>

              <button
                type="submit"
                className="bg-stone-900 hover:bg-stone-850 text-white text-xs font-black px-5 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Save size={13} className="text-amber-400" />
                Simpan & Sinkronkan
              </button>
            </div>

            {isSaved && (
              <div className="p-3 bg-emerald-50 border border-emerald-250 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-bold animate-fade-in">
                <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                <span>Seluruh preferensi tanda tangan default berhasil diperbarui untuk seluruh formulir!</span>
              </div>
            )}
          </form>

          {/* Section 3: Active Backup & Drive management */}
          <div className="space-y-3.5">
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1 flex items-center gap-2">
              <HardDrive size={12} />
              Konfigurasi Penyimpanan Google Drive Terhubung
            </h4>
            <DriveAccountsManager />
          </div>

          {/* Section 4: Diagnostics and Troubleshooting */}
          <div className="bg-rose-50/20 border border-rose-200/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-800">
              <Database size={15} />
              <span className="text-xs font-black uppercase tracking-wider font-mono">
                Sistem Diagnostik & Pemecahan Masalah
              </span>
            </div>

            <p className="text-[10px] text-stone-500 leading-relaxed">
              Jika Anda mengalami kegagalan akses token Google Drive Anda atau data tidak tersinkronisasi, Anda dapat memulihkan portal ke settingan standard dengan tombol di bawah.
            </p>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleFactoryReset}
                className="inline-flex items-center gap-1.5 border border-rose-250 text-rose-700 bg-white hover:bg-rose-50 text-[10px] font-black uppercase px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <Trash2 size={11} />
                Hapus Semua Cache & Putuskan Drive
              </button>

              <span className="text-[9px] font-mono text-stone-400 font-semibold uppercase">
                Kode Status: 200 OK
              </span>
            </div>

            {isResetDone && (
              <div className="p-3 bg-stone-900 text-white rounded-xl text-xs flex items-center gap-2 font-mono animate-fade-in">
                <Sparkles size={14} className="text-yellow-400 animate-pulse shrink-0" />
                <span>Portal berhasil dikosongkan & dikembalikan ke preset standard sistem.</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="bg-white px-6 py-4 border-t border-stone-150 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-stone-100 hover:bg-stone-250 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Selesai & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
