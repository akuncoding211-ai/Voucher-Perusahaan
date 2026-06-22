import React, { useState, useEffect } from 'react';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  clearFirebaseConfig,
  isFirebaseConfigured,
  loadSubmissionsFromFirestore,
  saveSubmissionToFirestore,
  deleteSubmissionFromFirestore,
  loginToFirebase,
  registerUserToFirebase,
  logoutFromFirebase,
  registerAuthChangeListener
} from '../firebase';
import { Submission } from '../types';
import { Cloud, CloudOff, RefreshCw, Key, Check, Info, Trash2, Database, AlertCircle, LogIn, LogOut, UserCheck } from 'lucide-react';
import { User } from 'firebase/auth';

interface FirebaseSyncConfigProps {
  onSyncData: (cloudSubmissions: Submission[]) => void;
  submissions: Submission[];
  userProfile?: any;
}

export const FirebaseSyncConfig: React.FC<FirebaseSyncConfigProps> = ({ onSyncData, submissions, userProfile }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  
  // Auth states
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPanel, setShowLoginPanel] = useState(false);

  // Register states
  const [showRegisterPanel, setShowRegisterPanel] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerFullName, setRegisterFullName] = useState('');
  const [registerRole, setRegisterRole] = useState('');
  const [registerCompanyId, setRegisterCompanyId] = useState('nmsa');
  const [registerCompanyName, setRegisterCompanyName] = useState('PT Nusantara Mineral Sukses Abadi');
  
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync state and listen for authorization
  useEffect(() => {
    const ready = isFirebaseConfigured();
    setIsConfigured(ready);
    
    // Autofill config fields if stored
    const config = getStoredFirebaseConfig();
    if (config) {
      setApiKey(config.apiKey || '');
      setAuthDomain(config.authDomain || '');
      setProjectId(config.projectId || '');
      setStorageBucket(config.storageBucket || '');
      setMessagingSenderId(config.messagingSenderId || '');
      setAppId(config.appId || '');
    }

    const unsubscribe = registerAuthChangeListener((user) => {
      setAuthUser(user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSaveConfig = () => {
    setStatusMsg(null);
    if (!apiKey.trim() || !projectId.trim() || !appId.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'API Key, Project ID, dan App ID wajib diisi.'
      });
      return;
    }

    const configPayload = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim()
    };

    const success = saveAndInitializeFirebaseConfig(configPayload);
    if (success) {
      setIsConfigured(true);
      setStatusMsg({
        type: 'success',
        text: 'Konfigurasi Firebase berhasil disimpan! Hubungkan akun Anda untuk membaca atau menyimpan data.'
      });
      setShowConfigPanel(false);
      setShowLoginPanel(true);
    } else {
      setIsConfigured(false);
      setStatusMsg({
        type: 'error',
        text: 'Inisialisasi Firebase gagal. Mohon periksa kembali kredensial Anda.'
      });
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('Apakah Anda yakin ingin memutuskan sinkronisasi Firebase Cloud? Aplikasi akan beralih menggunakan Penyimpanan Lokal.')) {
      clearFirebaseConfig();
      setIsConfigured(false);
      setAuthUser(null);
      setStatusMsg({
        type: 'info',
        text: 'Firebase Cloud berhasil diputuskan. Kembali ke modus Penyimpanan Lokal (LocalStorage).'
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Kombinasi Email dan Password wajib diisi.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMsg({ type: 'info', text: 'Melakukan autentikasi secara aman di Firebase...' });
    try {
      const user = await loginToFirebase(loginEmail.trim(), loginPassword.trim());
      setAuthUser(user);
      setStatusMsg({
        type: 'success',
        text: `Autentikasi Berhasil! Selamat datang ${user.email}. Melakukan sinkronisasi data cloud sekarang...`
      });
      setLoginEmail('');
      setLoginPassword('');
      setShowLoginPanel(false);
      
      // Auto fetch live cloud data as soon as authenticated successfully
      await handleFetchLiveCloud();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Autentikasi Gagal: ${err.message || 'Periksa email & password Anda.'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!registerEmail.trim() || !registerPassword.trim() || !registerFullName.trim() || !registerCompanyId.trim() || !registerCompanyName.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Semua kolom pendaftaran termasuk Kode dan Nama Perusahaan wajib diisi.'
      });
      return;
    }

    if (registerPassword.length < 6) {
      setStatusMsg({
        type: 'error',
        text: 'Password minimal terdiri dari 6 karakter.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMsg({ type: 'info', text: 'Mendaftarkan akun baru dan merekam biodata ke database Firebase...' });
    try {
      const activeCompanyId = registerCompanyId.trim().toLowerCase();
      const activeCompanyName = registerCompanyName.trim();

      const user = await registerUserToFirebase(
        registerEmail.trim(), 
        registerPassword.trim(), 
        registerFullName.trim(), 
        registerRole.trim() || 'User',
        activeCompanyId,
        activeCompanyName
      );
      setAuthUser(user);
      setStatusMsg({
        type: 'success',
        text: `Registrasi Berhasil! Anda otomatis masuk sebagai ${user.email} di bawah perusahaan ${activeCompanyName}.`
      });
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterFullName('');
      setRegisterRole('');
      setShowRegisterPanel(false);
      
      // Auto fetch live cloud data as soon as authenticated successfully
      await handleFetchLiveCloud();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Registrasi Gagal: ${err.message || 'Periksa format atau koneksi Anda.'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Keluar dari sesi Firebase secara aman?')) {
      setIsLoading(true);
      try {
        await logoutFromFirebase();
        setAuthUser(null);
        setStatusMsg({
          type: 'info',
          text: 'Anda telah keluar dari sesi Firebase Auth secara aman. Sesi cloud diakhiri.'
        });
      } catch (err: any) {
        setStatusMsg({
          type: 'error',
          text: `Gagal Log Out: ${err.message}`
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleFetchLiveCloud = async () => {
    setIsLoading(true);
    const uCompanyId = userProfile?.companyId;
    setStatusMsg({ 
      type: 'info', 
      text: `Menarik riwayat data terbaru dari Firebase Firestore${uCompanyId ? ` untuk perusahaan [${uCompanyId.toUpperCase()}]` : ''}...` 
    });
    try {
      const data = await loadSubmissionsFromFirestore(uCompanyId);
      onSyncData(data);
      setStatusMsg({
        type: 'success',
        text: `Berhasil tersinkronisasi! Memuat ${data.length} transaksi secara aman dari Firestore${uCompanyId ? ` untuk Perusahaan [${uCompanyId.toUpperCase()}]` : ''}.`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Gagal sinkronisasi data cloud: Permisi ditolak atau periksa koneksi. Pastikan akun Anda sudah terdaftar di Firebase Auth dan memiliki izin baca.`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Push all existing local data to cloud in a single sync operation
  const handlePushToCloud = async () => {
    if (!authUser) {
      setStatusMsg({
        type: 'error',
        text: 'Silakan Login ke Firebase terlebih dahulu sebelum melakukan ekspor masal / migrasi.'
      });
      setShowLoginPanel(true);
      return;
    }

    if (submissions.length === 0) {
      alert('Tidak ada data lokal saat ini untuk dipublikasikan ke cloud.');
      return;
    }

    const activeCompId = userProfile?.companyId || 'nmsa';
    const activeCompName = userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi';

    if (!window.confirm(`FITUR MIGRASI DATA: Sistem akan mengekspor & mengunggah ${submissions.length} transaksi lokal Anda ke database cloud Firebase baru di bawah identitas Perusahaan: [${activeCompId.toUpperCase()}] (${activeCompName}). Lanjutkan?`)) {
      return;
    }

    setIsLoading(true);
    setStatusMsg({ type: 'info', text: `Menjalankan proses migrasi data lokal ke cloud Firebase untuk perusahaan [${activeCompId.toUpperCase()}]...` });
    try {
      let successCount = 0;
      for (const sub of submissions) {
        await saveSubmissionToFirestore(sub, activeCompId, activeCompName);
        successCount++;
      }
      setStatusMsg({
        type: 'success',
        text: `MIGRASI SUKSES! Berhasil memindahkan total ${successCount} riwayat transaksi ke cloud Firebase baru secara otomatis!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: 'Gagal mengunggah dokumen migrasi. Pastikan Anda memiliki hak akses menulis pada aturan firestore.rules.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-3xs space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${isConfigured ? 'bg-amber-50 text-[#D4AF37]' : 'bg-stone-50 text-stone-400'}`}>
            {isConfigured ? <Cloud size={20} className={authUser ? 'animate-none' : 'animate-pulse'} /> : <CloudOff size={20} />}
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              Status Database Cloud (Firebase Firestore)
              {authUser && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-250 px-2 py-0.5 rounded-full font-mono font-semibold">
                  <UserCheck size={10} /> Authenticated
                </span>
              )}
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              {isConfigured 
                ? (
                  <span>
                    Secara aktif tersambung ke project cloud: <strong>{projectId}</strong>. 
                    {authUser 
                      ? ` Aktif sebagai user: ${authUser.email}`
                      : ' Masih memerlukan autentikasi login agar dapat tersambung secara penuh.'
                    }
                  </span>
                )
                : 'Belum tersambung ke database Firebase. Menggunakan penyimpanan peramban lokal (LocalStorage).'
              }
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {isConfigured ? (
            <>
              {authUser ? (
                <>
                  <button
                    onClick={handleFetchLiveCloud}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1"
                  >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    Tarik Cloud (Pull)
                  </button>
                  <button
                    onClick={handlePushToCloud}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-xl transition flex items-center gap-1 shadow-3xs"
                  >
                    <Database size={12} />
                    Ekspor Massal
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-stone-50 hover:bg-stone-150 text-stone-600 rounded-xl transition flex items-center gap-1"
                  >
                    <LogOut size={12} />
                    Logout
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowLoginPanel(!showLoginPanel);
                      setShowRegisterPanel(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1 shadow-3xs ${
                      showLoginPanel ? 'bg-emerald-100 text-emerald-800 border border-emerald-255' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <LogIn size={12} />
                    Login Sesi
                  </button>
                  <button
                    onClick={() => {
                      setShowRegisterPanel(!showRegisterPanel);
                      setShowLoginPanel(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-3xs ${
                      showRegisterPanel ? 'bg-stone-200 text-stone-800 border border-stone-300' : 'bg-stone-900 hover:bg-stone-805 text-white'
                    }`}
                  >
                    <UserCheck size={12} />
                    Daftar Akun Baru
                  </button>
                </div>
              )}
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition flex items-center gap-1"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-1 shadow-3xs"
            >
              <Key size={12} />
              Hubungkan Firebase
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3 border rounded-xl text-xs flex items-start gap-2 font-medium ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' :
          statusMsg.type === 'error' ? 'bg-rose-50 border-rose-250 text-rose-800' :
          'bg-amber-50 border-amber-250 text-amber-800'
        }`}>
          {statusMsg.type === 'success' ? <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{statusMsg.text}</span>
        </div>
      )}

      {/* LOGIN PANEL */}
      {isConfigured && !authUser && showLoginPanel && (
        <form onSubmit={handleLogin} className="p-4 bg-stone-50 border border-emerald-200 rounded-xl space-y-3.5 animate-slide-down">
          <div className="flex gap-2 items-start text-xs text-stone-500 leading-relaxed border-b border-stone-200 pb-2.5">
            <Info size={14} className="text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Firestore Anda dikonfigurasi untuk membatasi akses pada level pengguna (<code>request.auth != null</code>). Masukkan akun pengguna Firebase Auth Anda (misalnya <code>admin@nmsa.com</code>) guna menyinkronkan data.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Email Pengguna
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="email@pemberi_layanan.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1.5">
            <button
              type="button"
              onClick={() => setShowLoginPanel(false)}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 rounded-lg transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-3xs flex items-center gap-1.5"
            >
              <LogIn size={12} />
              {isLoading ? 'Mengautentikasi...' : 'Masuk Sesi Cloud'}
            </button>
          </div>
        </form>
      )}

      {/* REGISTER PANEL */}
      {isConfigured && !authUser && showRegisterPanel && (
        <form onSubmit={handleRegister} className="p-4 bg-stone-50 border border-stone-300 rounded-xl space-y-3.5 animate-slide-down">
          <div className="flex gap-2 items-start text-xs text-stone-500 leading-relaxed border-b border-stone-200 pb-2.5">
            <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p>
              Mendaftarkan pengguna baru di Firebase Auth dan mencatat profil perusahaan unik di Firestore <code>users/</code> untuk memisahkan data transaksi dengan aman.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                KODE PERUSAHAAN (KECIL / UNIK)
              </label>
              <input
                type="text"
                required
                value={registerCompanyId}
                onChange={(e) => setRegisterCompanyId(e.target.value.toLowerCase().trim())}
                placeholder="misal: ipn"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                NAMA RESMI PERUSAHAAN
              </label>
              <input
                type="text"
                required
                value={registerCompanyName}
                onChange={(e) => setRegisterCompanyName(e.target.value)}
                placeholder="misal: CV Indah Pratama"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={registerFullName}
                onChange={(e) => setRegisterFullName(e.target.value)}
                placeholder="misal: Nur Wahyudi"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Jabatan / Peran
              </label>
              <input
                type="text"
                required
                value={registerRole}
                onChange={(e) => setRegisterRole(e.target.value)}
                placeholder="misal: Keuangan / Accounting / Admin"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Alamat Email Pengguna
              </label>
              <input
                type="type"
                required
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Password Baru (Min 6 Karakter)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1.5">
            <button
              type="button"
              onClick={() => setShowRegisterPanel(false)}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 rounded-lg transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-3.5 py-1.5 text-xs font-bold bg-stone-900 hover:bg-stone-850 text-white rounded-lg transition shadow-3xs flex items-center gap-1.5"
            >
              <UserCheck size={12} />
              {isLoading ? 'Mendaftarkan...' : 'Daftarkan & Masuk Sesi'}
            </button>
          </div>
        </form>
      )}

      {/* CONFIGURATION PANEL */}
      {(showConfigPanel || (!isConfigured && statusMsg?.type === 'error')) && (
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-4 animate-slide-down">
          <div className="flex gap-2 items-start text-xs text-stone-500 leading-relaxed border-b border-stone-200 pb-3">
            <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p>
              Masukkan kredensial <strong>Firebase Web App SDK Configuration</strong> Anda. Informasi ini disimpan di browser Anda Anda sendiri, sehingga 100% aman dan tidak terekspos secara publik.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                API Key *
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSyA..."
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Project ID *
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="project-id-123"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Auth Domain
              </label>
              <input
                type="text"
                value={authDomain}
                onChange={(e) => setAuthDomain(e.target.value)}
                placeholder="project-id-123.firebaseapp.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Storage Bucket
              </label>
              <input
                type="text"
                value={storageBucket}
                onChange={(e) => setStorageBucket(e.target.value)}
                placeholder="project-id-123.appspot.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Messaging Sender ID
              </label>
              <input
                type="text"
                value={messagingSenderId}
                onChange={(e) => setMessagingSenderId(e.target.value)}
                placeholder="84739572917"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                App ID *
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1:84739572917:web:2c846d847"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowConfigPanel(false)}
              className="px-3.5 py-1.5 text-xs font-bold bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 rounded-lg transition"
            >
              Batal
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-lg transition shadow-3xs"
            >
              Simpan & Hubungkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

