import React, { useState } from 'react';
import { FirebaseSyncConfig } from './FirebaseSyncConfig';
import { FirebaseMigration } from './FirebaseMigration';
import { DriveMigration } from './DriveMigration';
import { SheetsImport } from './SheetsImport';
import { Submission } from '../types';
import { 
  Cloud, 
  X, 
  Database, 
  ArrowLeftRight, 
  UploadCloud, 
  FileSpreadsheet, 
  ChevronDown, 
  Sliders, 
  ShieldCheck
} from 'lucide-react';

interface CloudControlCenterProps {
  submissions: Submission[];
  userProfile?: any;
  onSyncData: (cloudData: Submission[]) => void;
  onUpdateSubmissions: (updated: Submission[]) => void;
  onImportSuccess: (imported: Submission[]) => void;
}

export const CloudControlCenter: React.FC<CloudControlCenterProps> = ({
  submissions,
  userProfile,
  onSyncData,
  onUpdateSubmissions,
  onImportSuccess
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sync' | 'db-migrate' | 'drive-migrate' | 'sheets' | null>(null);

  // Quick statistics
  const countWithCloudFiles = submissions.filter(
    sub => (sub.googleDriveFiles && sub.googleDriveFiles.length > 0) || sub.buktiPembayaran || (sub.isPettyCash && sub.pettyCashFile)
  ).length;

  return (
    <div className="print:hidden">
      {/* 1. COMPACT COLLAPSED CONTROLLER BAR */}
      {!isOpen ? (
        <div 
          onClick={() => setIsOpen(true)}
          className="bg-white border hover:border-amber-500/50 border-stone-200 rounded-2xl p-4 shadow-3xs cursor-pointer hover:shadow-2xs transition-all duration-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 group relative overflow-hidden"
        >
          {/* Subtle background ambiance glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-400/5 to-transparent rounded-full blur-2xl pointer-events-none transition-all duration-500 group-hover:scale-105" />
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-stone-50 group-hover:bg-amber-50 text-stone-600 group-hover:text-amber-500 rounded-xl transition duration-300 shadow-3xs">
              <Cloud size={20} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-stone-850 uppercase tracking-wider font-display flex items-center gap-1.5">
                Pusat Layanan Awan & Integrasi
                <span className="text-[9px] font-mono font-normal normal-case bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-full border border-stone-200">
                  Ready
                </span>
              </h4>
              <p className="text-xs text-stone-500 mt-0.5">
                Konfigurasi live-sync, backup, import Google Sheets, & migrasi antar project Firebase.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0 pt-2.5 md:pt-0 border-t md:border-t-0 border-stone-100 shrink-0">
            <div className="flex -space-x-1.5 overflow-hidden text-[9px] pr-2">
              <span className="bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 px-2 py-1 rounded-md font-mono" title="Jumlah File Google Drive">
                📁 {countWithCloudFiles} Files
              </span>
              <span className="bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 px-2 py-1 rounded-md font-mono" title="Total Transaksi Aktif">
                📝 {submissions.length} Tx
              </span>
            </div>
            <button className="text-xs font-bold bg-stone-100 group-hover:bg-amber-500 group-hover:text-stone-955 text-stone-700 px-3.5 py-1.5 rounded-lg transition duration-300 flex items-center gap-1">
              <span>Buka Panel</span>
              <ChevronDown size={14} className="group-hover:translate-y-0.5 transition duration-300" />
            </button>
          </div>
        </div>
      ) : (
        // 2. EXPANDED BOARD CENTRAL CONTROL
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 shadow-xs transition-all duration-300 space-y-4 relative animate-fade-in">
          {/* Header Area */}
          <div className="flex items-center justify-between border-b border-stone-150 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-lg">
                <Cloud size={16} />
              </span>
              <div>
                <h4 className="text-xs font-black text-stone-850 uppercase tracking-widest font-display">
                  Pusat Layanan Awan & Integrasi (Server Hub)
                </h4>
                <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                  Host: {window.location.hostname} • Cloud Mode
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setIsOpen(false);
                setActiveTab(null);
              }}
              className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 rounded-lg transition-all"
              title="Sembunyikan Panel"
            >
              <X size={14} />
            </button>
          </div>

          {/* Quick Menu Selection Bar (Judul-Judul Menu) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            {/* SUBMENU 1: Live Sync */}
            <button
              onClick={() => setActiveTab(activeTab === 'sync' ? null : 'sync')}
              className={`p-3 rounded-xl border text-left transition duration-200 flex items-start gap-2.5 ${
                activeTab === 'sync'
                  ? 'bg-amber-50 border-[#D4AF37] ring-1 ring-[#D4AF37]/30'
                  : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <Database size={16} className={`shrink-0 mt-0.5 ${activeTab === 'sync' ? 'text-amber-600' : 'text-stone-400'}`} />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-stone-850 font-display">Koneksi & Sinkronisasi</div>
                <div className="text-[10px] text-stone-500 leading-tight">Sinkron realtime dengan DB Firebase</div>
              </div>
            </button>

            {/* SUBMENU 2: Sheets */}
            <button
              onClick={() => setActiveTab(activeTab === 'sheets' ? null : 'sheets')}
              className={`p-3 rounded-xl border text-left transition duration-200 flex items-start gap-2.5 ${
                activeTab === 'sheets'
                  ? 'bg-amber-50 border-[#D4AF37] ring-1 ring-[#D4AF37]/30'
                  : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <FileSpreadsheet size={16} className={`shrink-0 mt-0.5 ${activeTab === 'sheets' ? 'text-amber-600' : 'text-stone-400'}`} />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-stone-850 font-display">Hubungkan Sheets</div>
                <div className="text-[10px] text-stone-500 leading-tight">Import data dari spreadsheet</div>
              </div>
            </button>

            {/* SUBMENU 3: Firebase Migration */}
            <button
              onClick={() => setActiveTab(activeTab === 'db-migrate' ? null : 'db-migrate')}
              className={`p-3 rounded-xl border text-left transition duration-200 flex items-start gap-2.5 ${
                activeTab === 'db-migrate'
                  ? 'bg-amber-50 border-[#D4AF37] ring-1 ring-[#D4AF37]/30'
                  : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <ArrowLeftRight size={16} className={`shrink-0 mt-0.5 ${activeTab === 'db-migrate' ? 'text-amber-600' : 'text-stone-400'}`} />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-stone-850 font-display">Migrasi Firebase</div>
                <div className="text-[10px] text-stone-500 leading-tight">Pindah akun / kelola database baru</div>
              </div>
            </button>

            {/* SUBMENU 4: Drive Migration */}
            <button
              onClick={() => setActiveTab(activeTab === 'drive-migrate' ? null : 'drive-migrate')}
              className={`p-3 rounded-xl border text-left transition duration-200 flex items-start gap-2.5 ${
                activeTab === 'drive-migrate'
                  ? 'bg-amber-50 border-[#D4AF37] ring-1 ring-[#D4AF37]/30'
                  : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <UploadCloud size={16} className={`shrink-0 mt-0.5 ${activeTab === 'drive-migrate' ? 'text-amber-600' : 'text-stone-400'}`} />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-stone-850 font-display">Migrasi GDrive</div>
                <div className="text-[10px] text-stone-500 leading-tight">Salin masal lampiran ke Drive baru</div>
              </div>
            </button>
          </div>

          {/* ACTIVE CONTENT EXPANSIONS (Only shows the clicked tab, disappears when done!) */}
          <div className="space-y-2 animate-fade-in">
            {activeTab === 'sync' && (
              <div className="border border-stone-200 bg-white rounded-xl p-0.5 shadow-3xs overflow-hidden">
                <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    ⚙️ PANEL SINKRONISASI AKTIF
                  </span>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="text-[10px] font-bold hover:text-rose-600 text-stone-400 cursor-pointer"
                  >
                    Tutup Submenu
                  </button>
                </div>
                <div className="p-3 bg-white">
                  <FirebaseSyncConfig
                    onSyncData={onSyncData}
                    submissions={submissions}
                    userProfile={userProfile}
                  />
                </div>
              </div>
            )}

            {activeTab === 'sheets' && (
              <div className="border border-stone-200 bg-white rounded-xl p-0.5 shadow-3xs overflow-hidden">
                <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    📊 IMPORT SPREADSHEET PORTAL
                  </span>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="text-[10px] font-bold hover:text-rose-600 text-stone-400 cursor-pointer"
                  >
                    Tutup Submenu
                  </button>
                </div>
                <div className="p-3 bg-white">
                  <SheetsImport
                    onImportSuccess={onImportSuccess}
                    existingCount={submissions.length}
                  />
                </div>
              </div>
            )}

            {activeTab === 'db-migrate' && (
              <div className="border border-stone-200 bg-white rounded-xl p-0.5 shadow-3xs overflow-hidden">
                <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    ⚡ ASISTEN TRANSFER DATABASE CLOUD
                  </span>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="text-[10px] font-bold hover:text-rose-600 text-stone-400 cursor-pointer"
                  >
                    Tutup Submenu
                  </button>
                </div>
                <div className="p-3 bg-white">
                  <FirebaseMigration
                    submissions={submissions}
                    userProfile={userProfile}
                    onMigrationComplete={() => {
                      console.log('Database migrated successfully.');
                      setActiveTab(null);
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'drive-migrate' && (
              <div className="border border-stone-200 bg-white rounded-xl p-0.5 shadow-3xs overflow-hidden">
                <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    📁 TRANSISI MASSAL BERKAS GOOGLE DRIVE
                  </span>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="text-[10px] font-bold hover:text-rose-600 text-stone-400 cursor-pointer"
                  >
                    Tutup Submenu
                  </button>
                </div>
                <div className="p-3 bg-white">
                  <DriveMigration
                    submissions={submissions}
                    onUpdateSubmissions={onUpdateSubmissions}
                  />
                </div>
              </div>
            )}

            {!activeTab && (
              <div className="p-5 text-center bg-stone-100 rounded-xl border border-stone-200 space-y-2">
                <Sliders size={24} className="mx-auto text-stone-400 animate-pulse" />
                <p className="text-xs text-stone-600 font-medium">
                  Masukan panel di atas untuk mengaktifkan menu detail.
                </p>
                <p className="text-[10px] text-stone-400 max-w-sm mx-auto leading-relaxed">
                  Pilih salah satu menu integrasi di atas untuk berinteraksi. Menu akan tetap ringkas dan melayang rapi sesuai dengan perintah Anda!
                </p>
              </div>
            )}
          </div>

          {/* Quick close bar info */}
          <div className="flex justify-between items-center text-[10px] text-stone-400 font-mono pt-1">
            <span>Server sync mode: Online (Firebase active SDK)</span>
            <button 
              onClick={() => {
                setIsOpen(false);
                setActiveTab(null);
              }} 
              className="hover:text-[#D4AF37] font-bold cursor-pointer"
            >
              [× Sembunyikan Pusat Integrasi]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
