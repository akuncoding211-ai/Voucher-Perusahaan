import React, { useState, useEffect } from 'react';
import { 
  ConnectedDrive, 
  getConnectedDrives, 
  saveConnectedDrives, 
  googleDriveLogin, 
  refreshAllDrivesQuota 
} from '../firebase';
import { Cloud, Plus, Trash2, ShieldCheck, RefreshCw, AlertTriangle, HardDrive } from 'lucide-react';

interface DriveAccountsManagerProps {
  onConnectionChange?: (isConnected: boolean) => void;
}

export const DriveAccountsManager: React.FC<DriveAccountsManagerProps> = ({ onConnectionChange }) => {
  const [drives, setDrives] = useState<ConnectedDrive[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadDrives = () => {
    const list = getConnectedDrives();
    setDrives(list);
    if (onConnectionChange) {
      onConnectionChange(list.length > 0);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  const handleConnectNewDrive = async () => {
    setErrorText('');
    setIsConnecting(true);
    try {
      const result = await googleDriveLogin();
      if (result.accessToken) {
        loadDrives();
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(`Gagal menghubungkan Google Drive: ${err.message || err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveDrive = (emailToRemove: string) => {
    const list = getConnectedDrives();
    const updated = list.filter(d => d.email.toLowerCase() !== emailToRemove.toLowerCase());
    saveConnectedDrives(updated);
    setDrives(updated);
    if (onConnectionChange) {
      onConnectionChange(updated.length > 0);
    }
  };

  const handleRefreshQuotas = async () => {
    setErrorText('');
    setIsRefreshing(true);
    try {
      const updated = await refreshAllDrivesQuota();
      setDrives(updated);
    } catch (err: any) {
      setErrorText('Gagal memuat ulang status kuota.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-xs" id="drive-accounts-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="text-[#917118]" size={18} />
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800">
            Multi-Google Drive Storage (Auto-Chain)
          </h4>
        </div>
        
        {drives.length > 0 && (
          <button
            type="button"
            onClick={handleRefreshQuotas}
            disabled={isRefreshing}
            className="p-1 px-2.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-800 flex items-center gap-1.5 transition text-[10px] font-bold bg-stone-50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
            Muat Ulang Kuota
          </button>
        )}
      </div>

      <p className="text-[11px] text-stone-500 leading-relaxed">
        Solusi cerdas penyimpanan tanpa batas: Hubungkan beberapa akun Google Drive gratis 15GB Anda. 
        Sistem akan **mengisi satu akun terlebih dahulu hingga penuh**, lalu mendeteksi otomatis dan melanjutkan unggahan berkas ke akun cadangan berikutnya secara instan!
      </p>

      {errorText && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {drives.length === 0 ? (
        <div className="p-6 border-2 border-dashed border-stone-250 bg-stone-50/20 rounded-2xl text-center space-y-3.5 flex flex-col items-center">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
            <Cloud size={18} />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-stone-800">Belum Ada Akun Google Drive Terhubung</p>
            <p className="text-[10px] text-stone-400">Hubungkan akun Google Drive utama Anda untuk mengaktifkan unggahan dokumen keuangan.</p>
          </div>
          <button
            type="button"
            onClick={handleConnectNewDrive}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isConnecting ? (
              <RefreshCw size={12} className="animate-spin text-amber-400" />
            ) : (
              <Cloud size={12} className="text-[#D4AF37]" />
            )}
            Hubungkan Akun Google Drive Utama
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="divide-y divide-stone-100 border border-stone-200/80 rounded-xl overflow-hidden bg-stone-50/10">
            {drives.map((drive, idx) => {
              const quotaPercent = drive.quotaLimit > 0 
                ? Math.min(100, Math.round((drive.quotaUsed / drive.quotaLimit) * 100)) 
                : 0;
              const isFull = quotaPercent >= 98;
              const remainsFormatted = formatBytes(Math.max(0, drive.quotaLimit - drive.quotaUsed));

              return (
                <div key={drive.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white hover:bg-stone-50/30 transition">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      {drive.photoURL ? (
                        <img 
                          src={drive.photoURL} 
                          alt="Avatar" 
                          referrerPolicy="no-referrer"
                          className="w-6 h-6 rounded-full border border-stone-200 shrink-0" 
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-[#917118] shrink-0 border border-stone-200">
                          {idx + 1}
                        </div>
                      )}
                      
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-stone-800 truncate block">
                            {drive.displayName}
                          </span>
                          <span className="text-[9px] text-stone-400 font-medium">
                            (Akun {idx === 0 ? 'Utama' : `Cadangan ${idx}`})
                          </span>
                        </div>
                        <span className="text-[10px] text-stone-500 font-mono block truncate">
                          {drive.email}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar & Quota details */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-mono font-medium text-stone-500">
                        <span>Terisi: {formatBytes(drive.quotaUsed)} ({quotaPercent}%)</span>
                        <span>Sisa: {remainsFormatted}</span>
                      </div>
                      <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-stone-200/50">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            drive.isExpired 
                              ? 'bg-rose-400' 
                              : isFull 
                                ? 'bg-amber-500' 
                                : 'bg-[#917118]'
                          }`}
                          style={{ width: `${quotaPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex sm:flex-col items-end sm:justify-center justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-stone-100">
                    <div className="flex items-center gap-1.5">
                      {drive.isExpired ? (
                        <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                          Token Mati
                        </span>
                      ) : isFull ? (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                          Penuh
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono flex items-center gap-0.5">
                          <ShieldCheck size={9} />
                          Aktif
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDrive(drive.email)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer self-end"
                      title="Putus Hubungan Akun Ini"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleConnectNewDrive}
              disabled={isConnecting}
              className="inline-flex items-center gap-1.5 border border-stone-300 hover:border-[#917118] text-[#917118] bg-white hover:bg-stone-50 text-[11px] font-bold px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Plus size={11} />
              )}
              Sertakan Akun Google Drive Cadangan
            </button>
            
            <p className="text-[9px] font-mono text-stone-400 text-right">
              Total Akun: {drives.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
