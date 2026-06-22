import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { Submission, ActivityLog } from '../types';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  mapSubmissionToFirestore, 
  cleanUndefined 
} from '../firebase';
import { 
  Database, 
  ArrowRight, 
  CheckCircle2, 
  Cloud, 
  Key, 
  RefreshCw, 
  AlertCircle, 
  ShieldCheck, 
  UserPlus, 
  LogIn, 
  Check, 
  Info, 
  ServerCrash,
  Sparkles
} from 'lucide-react';

interface FirebaseMigrationProps {
  submissions: Submission[];
  userProfile?: any;
  onMigrationComplete: () => void;
}

export const FirebaseMigration: React.FC<FirebaseMigrationProps> = ({ 
  submissions, 
  userProfile,
  onMigrationComplete 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form New Project Credentials
  const [targetApiKey, setTargetApiKey] = useState('');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetAuthDomain, setTargetAuthDomain] = useState('');
  const [targetStorageBucket, setTargetStorageBucket] = useState('');
  const [targetMessagingSenderId, setTargetMessagingSenderId] = useState('');
  const [targetAppId, setTargetAppId] = useState('');

  // Paste / Auto-parse SDK code
  const [rawSdkCode, setRawSdkCode] = useState('');

  const parseFirebaseConfigFromCode = (code: string) => {
    setRawSdkCode(code);
    if (!code.trim()) return;

    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const extracted: { [key: string]: string } = {};

    keys.forEach(key => {
      const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"\`]([^'"\`\\s,;]+)['"\`]`, 'i');
      const match = code.match(regex);
      if (match && match[1]) {
        extracted[key] = match[1].trim();
      }
    });

    if (Object.keys(extracted).length > 0) {
      if (extracted.apiKey) setTargetApiKey(extracted.apiKey);
      if (extracted.projectId) setTargetProjectId(extracted.projectId);
      if (extracted.authDomain) setTargetAuthDomain(extracted.authDomain);
      if (extracted.storageBucket) setTargetStorageBucket(extracted.storageBucket);
      if (extracted.messagingSenderId) setTargetMessagingSenderId(extracted.messagingSenderId);
      if (extracted.appId) setTargetAppId(extracted.appId);
      
      setSuccessMsg('KODE SDK TERDETEKSI! 6 Parameter Firebase berhasil di-parse secara otomatis.');
      setErrorMsg(null);
    } else {
      if (code.includes('apiKey') || code.includes('{')) {
        setErrorMsg('Peringatan: Gagal membaca parameter dari salinan kode. Silakan isi form di bawah secara manual.');
      }
    }
  };

  // Form Target User Credentials
  const [targetEmail, setTargetEmail] = useState(userProfile?.email || '');
  const [targetPassword, setTargetPassword] = useState('');
  const [targetFullName, setTargetFullName] = useState(userProfile?.fullName || '');
  const [targetRole, setTargetRole] = useState(userProfile?.role || 'Keuangan');
  const [targetCompanyId, setTargetCompanyId] = useState(userProfile?.companyId || 'nmsa');
  const [targetCompanyName, setTargetCompanyName] = useState(userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi');

  // Secondary dynamic Firebase reference
  const [targetAppInstance, setTargetAppInstance] = useState<any | null>(null);
  const [targetAuthInstance, setTargetAuthInstance] = useState<any | null>(null);
  const [targetDbInstance, setTargetDbInstance] = useState<any | null>(null);
  const [targetUser, setTargetUser] = useState<FirebaseUser | null>(null);

  // Migration progress states
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);

  // Clear previous dynamic firebase apps to avoid memory leaks
  useEffect(() => {
    return () => {
      cleanupMigrationApp();
    };
  }, [targetAppInstance]);

  const cleanupMigrationApp = () => {
    if (targetAppInstance) {
      try {
        deleteApp(targetAppInstance)
          .then(() => console.log('🗑️ Dynamic migration firebase instance disposed.'))
          .catch(e => console.warn('Disposing dynamic app error:', e));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Step 2: Establish connection to the empty target Firebase project
  const handleTestTargetConnection = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetApiKey.trim() || !targetProjectId.trim() || !targetAppId.trim()) {
      setErrorMsg('Kredensial API Key, Project ID, dan App ID wajib diisi!');
      return;
    }

    setIsLoading(true);
    setMigrationLogs(['Menghubungkan ke project Firebase baru...', `Project ID: ${targetProjectId.trim()}`]);

    try {
      // Clean previous app if any
      cleanupMigrationApp();

      const uniqueAppName = 'target-migration-app-' + Date.now();
      const targetConfig = {
        apiKey: targetApiKey.trim(),
        projectId: targetProjectId.trim(),
        authDomain: targetAuthDomain.trim() || `${targetProjectId.trim()}.firebaseapp.com`,
        storageBucket: targetStorageBucket.trim() || `${targetProjectId.trim()}.appspot.com`,
        messagingSenderId: targetMessagingSenderId.trim(),
        appId: targetAppId.trim()
      };

      const appInstance = initializeApp(targetConfig, uniqueAppName);
      const authInstance = getAuth(appInstance);
      const dbInstance = getFirestore(appInstance);

      setTargetAppInstance(appInstance);
      setTargetAuthInstance(authInstance);
      setTargetDbInstance(dbInstance);

      setSuccessMsg('Koneksi ke Project Firebase baru berhasil dibentuk! Silakan siapkan autentikasi akun baru Anda.');
      setMigrationLogs(prev => [...prev, '✓ Koneksi berhasil!', 'Lanjutkan ke Tahap 3 untuk membuat akun di project target.']);
      setCurrentStep(3);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Inisialisasi Gagal: ${err.message || 'Mohon periksa kembali API Key dan format input kredensial Anda.'}`);
      setMigrationLogs(prev => [...prev, '❌ Koneksi gagal: ' + (err.message || 'Error tidak dikenal')]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Register or Login Account in Target Firebase Project
  const handleTargetAuthentication = async (type: 'signup' | 'signin') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetAuthInstance || !targetDbInstance) {
      setErrorMsg('Koneksi Firebase target belum siap. Silakan kembali ke Tahap 2.');
      return;
    }

    if (!targetEmail.trim() || !targetPassword.trim()) {
      setErrorMsg('Email dan Password wajib diisi untuk autentikasi target.');
      return;
    }

    if (type === 'signup') {
      if (!targetFullName.trim() || !targetCompanyId.trim() || !targetCompanyName.trim()) {
        setErrorMsg('Data Registrasi Lengkap (Nama, Kode Perusahaan & Nama Perusahaan) wajib diisi untuk pendaftaran project baru.');
        return;
      }
      if (targetPassword.length < 6) {
        setErrorMsg('Password akun target minimal harus 6 karakter.');
        return;
      }
    }

    setIsLoading(true);
    setMigrationLogs(prev => [...prev, `${type === 'signup' ? 'Mendaftarkan akun baru' : 'Masuk ke akun lama'} di project Firebase Baru...`, `User: ${targetEmail.trim()}`]);

    try {
      let credentials;
      if (type === 'signup') {
        credentials = await createUserWithEmailAndPassword(targetAuthInstance, targetEmail.trim(), targetPassword);
      } else {
        credentials = await signInWithEmailAndPassword(targetAuthInstance, targetEmail.trim(), targetPassword);
      }

      const activeUser = credentials.user;
      setTargetUser(activeUser);

      setSuccessMsg(`Autentikasi Akun Baru Sukses! Terbaca sebagai ${activeUser.email}. Siap untuk ekspor data.`);
      setMigrationLogs(prev => [
        ...prev, 
        `✓ Akun berhasil terotentikasi di project target! (UID: ${activeUser.uid})`,
        'Semua persyaratan otentikasi terpenuhi. Lanjutkan ke Tahap 4 untuk memulai migrasi data.'
      ]);
      setCurrentStep(4);
    } catch (err: any) {
      console.error(err);
      let customError = `Otentikasi Gagal: ${err.message || 'Terjadi kendala saat menghubungi Firebase Auth.'}`;
      if (err.code === 'auth/configuration-not-found' || err.message?.includes('configuration-not-found')) {
        customError = `Otentikasi Gagal: Firebase: Error (auth/configuration-not-found). Hal ini karena fitur Email/Password Sign-In Method belum diaktifkan di Firebase Console target Anda. Anda bisa mengaktifkannya terlebih dahulu di Console Firebase, ATAU klik "Lewati Otentikasi" di bawah untuk lanjut memindahkan data langsung ke Firestore (Test Mode)!`;
      }
      setErrorMsg(customError);
      setMigrationLogs(prev => [...prev, `❌ Gagal otentikasi: ${err.message || 'Kredensial atau Aturan Keamanan Ditolak.'}`]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper inside step 3 to bypass auth if rules are in test mode / open
  const handleBypassAuthentication = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const randomId = Math.random().toString(36).substring(2, 9);
    const mockUser = {
      uid: `guest_migrated_user_${randomId}`,
      email: targetEmail.trim() || 'guest@nmsa.com',
    } as any;

    setTargetUser(mockUser);
    setSuccessMsg('Otentikasi Dilewati dengan Sukses! Anda memilih mengunggah data secara langsung (Open Test Mode) tanpa memerlukan pendaftaran registrasi Firebase Auth.');
    setMigrationLogs(prev => [
      ...prev,
      '⚠️ User mengaktifkan Bypass Otentikasi (Mode Terbuka).',
      `✓ Menggunakan profil bayangan: ${mockUser.email}`,
      'Semua data akan diunggah langsung ke Firestore target Anda. Lanjutkan ke Tahap 4!'
    ]);
    setCurrentStep(4);
  };

  // Step 4: Run Mass Export / Safe Copying of All Data to Target Firestore Database
  const handleRunMassMigration = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetDbInstance || !targetUser) {
      setErrorMsg('Target Database atau otentikasi belum siap. Silakan selesaikan tahap sebelumnya.');
      return;
    }

    if (submissions.length === 0) {
      setErrorMsg('Tidak ada data transaksi lokal/aktif untuk dikirim ke project baru.');
      return;
    }

    setIsLoading(true);
    setMigrationProgress(0);
    setMigrationLogs(prev => [...prev, '======= MEMULAI MIGRASI MASSAL DATA =======', `Jumlah Transaksi yang akan dipindahkan: ${submissions.length}`]);

    try {
      const activeCompId = targetCompanyId.trim().toLowerCase();
      const activeCompName = targetCompanyName.trim();
      const targetUid = targetUser.uid;
      const targetUserEmail = targetUser.email || targetEmail.trim();

      // 1. Tulis profil pengguna ke users/
      setMigrationLogs(prev => [...prev, '📝 Menulis profil pengguna baru ke Firestore target...']);
      await setDoc(doc(targetDbInstance, 'users', targetUid), {
        uid: targetUid,
        email: targetUserEmail,
        fullName: targetFullName.trim(),
        role: targetRole.trim() || 'Accounting',
        companyId: activeCompId,
        companyName: activeCompName,
        createdAt: new Date().toISOString()
      });
      setMigrationLogs(prev => [...prev, '✓ Profil pengguna berhasil direkam.']);

      // 2. Tulis profil perusahaan ke companies/
      setMigrationLogs(prev => [...prev, '🏬 Menulis profil perusahaan baru ke Firestore target...']);
      const activeCompanyDetails = userProfile?.companyDetails || {
        id: activeCompId,
        code: activeCompId.toUpperCase(),
        name: activeCompName,
        fullName: activeCompName,
        defaultJenis: 'Operasional Kantor',
        defaultKode: `BKK-${activeCompId.toUpperCase()}/V/2026/10001`,
        defaultLokasi: 'Lt.1',
        displayName: `Invoice-${activeCompId.toUpperCase()}`,
        icon: '🏢',
        isActive: true,
        no_invoice_prefix: `BKK-${activeCompId.toUpperCase()}`,
        sigAccounting: 'Sri Ekowati',
        sigDibuat: targetFullName.trim() || 'Nur Wahyudi',
        sigDirKeuangan: 'Harijon',
        sigDirektur: 'Andi Nursyam Halid',
        sigDisetujui: 'Harijon',
        sigKeuangan: 'Andi Dhiya Salsabila'
      };

      await setDoc(doc(targetDbInstance, 'companies', activeCompId), {
        ...activeCompanyDetails,
        id: activeCompId,
        code: activeCompId.toUpperCase(),
        name: activeCompName,
        fullName: activeCompName,
        updatedAt: new Date().toISOString()
      });
      setMigrationLogs(prev => [...prev, '✓ Profil perusahaan berhasil direkam.']);

      // 3. Loop dan tulis seluruh submissions ke submissions/
      setMigrationLogs(prev => [...prev, '🚚 Mulai mengirim dokumen transaksi...']);
      let count = 0;
      
      for (const sub of submissions) {
        // Map payload ke skema Firestore standard
        const fPayload = mapSubmissionToFirestore(
          sub,
          targetUserEmail,
          targetUid,
          activeCompId,
          activeCompName
        );
        const cleaned = cleanUndefined(fPayload);
        
        await setDoc(doc(targetDbInstance, 'submissions', sub.id), cleaned);
        
        count++;
        const percent = Math.round((count / submissions.length) * 100);
        setMigrationProgress(percent);
        
        if (count % 5 === 0 || count === submissions.length) {
          setMigrationLogs(prev => [...prev, `-> Memindahkan data [${count}/${submissions.length}] (${percent}%) - ${sub.kode}`]);
        }
      }

      // 4. Buat log histori awal di project target
      const logId = `log-m-${Date.now()}`;
      await setDoc(doc(targetDbInstance, 'activity_logs', logId), {
        id: logId,
        timestamp: new Date().toISOString(),
        userId: targetUid,
        userEmail: targetUserEmail,
        userName: targetFullName.trim(),
        action: 'migration_data',
        details: `Berhasil memigrasikan total ${count} transaksi HO Nusantara secara aman ke Firebase Project ID: ${targetProjectId.trim()}`,
        category: 'success'
      });

      setSuccessMsg(`Migrasi Berhasil! Berhasil memindahkan 1 Profil Pengguna, 1 Metadata Perusahaan, dan ${count} dokumen transaksi ke project baru.`);
      setMigrationLogs(prev => [
        ...prev,
        '✨ Proses upload data selesai!',
        `✓ Migrasi database cloud diproses 100% SUKSES.`,
        'Silakan klik tombol di bawah untuk mengaktifkan project baru di aplikasi.'
      ]);
      setCurrentStep(5);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Migrasi Gagal di tengah jalan: ${err.message || 'Error saat menulis data ke Firestore.'}`);
      setMigrationLogs(prev => [...prev, `❌ Gagal tulis transaksi: ${err.message || 'Aturan Firestore ditolak. Harap deploy firestore.rules terlebih dahulu pada Project baru Anda.'}`]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 5: Save target config as the main default and refresh the page to login
  const handlePromoteAndFinalize = () => {
    if (!targetApiKey || !targetProjectId || !targetAppId) {
      alert('Kredensial baru tidak lengkap.');
      return;
    }

    const payload = {
      apiKey: targetApiKey.trim(),
      authDomain: targetAuthDomain.trim() || `${targetProjectId.trim()}.firebaseapp.com`,
      projectId: targetProjectId.trim(),
      storageBucket: targetStorageBucket.trim() || `${targetProjectId.trim()}.appspot.com`,
      messagingSenderId: targetMessagingSenderId.trim(),
      appId: targetAppId.trim()
    };

    // Promote new project as default
    saveAndInitializeFirebaseConfig(payload);
    
    // Clear user session cache so user is forced to log in on the new project
    sessionStorage.removeItem('NUSANTARA_SESSION_ACTIVE');
    
    alert('SELAMAT! Aplikasi Anda telah dialihkan ke project Firebase yang baru secara permanen. Klik OK untuk menyegarkan aplikasi dan masuk menggunakan akun baru Anda.');
    
    // Dispose dynamic app and complete
    cleanupMigrationApp();
    onMigrationComplete();
    
    // Force page reload to ensure all singleton static states are cleanly loaded with the new config
    window.location.reload();
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 print:hidden space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-[#D4AF37]" />
          <h4 className="text-xs font-bold text-stone-850 uppercase tracking-wider font-display">
            Asisten Migrasi Project Firebase
          </h4>
        </div>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setCurrentStep(1);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
            isOpen 
              ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' 
              : 'bg-[#D4AF37] text-stone-955 hover:bg-[#Bca031] font-semibold'
          }`}
        >
          {isOpen ? 'Batal Migrasi' : 'Pindah Kebun / Akun Firebase'}
        </button>
      </div>

      {!isOpen && (
        <p className="text-xs text-stone-500 leading-relaxed">
          Ingin mematangkan infrastruktur atau berpindah ke <strong>Firebase Project yang baru / kosong</strong> milik Anda sendiri? Gunakan asisten ini untuk menyalin data transaksi, data perusahaan, dan hak akses secara otomatis tanpa resiko kehilangan data.
        </p>
      )}

      {isOpen && (
        <div className="border border-stone-200 bg-white rounded-xl p-4 space-y-5 animate-fade-in">
          {/* STEPPER METADATA */}
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {([1, 2, 3, 4, 5] as const).map((step) => (
              <div key={step} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep >= step ? 'bg-[#D4AF37]' : 'bg-stone-200'
                }`} />
                <span className={`block text-[9px] font-bold tracking-tight ${
                  currentStep === step ? 'text-stone-900 font-mono font-extrabold' : 'text-stone-400'
                }`}>
                  T-0{step}
                </span>
              </div>
            ))}
          </div>

          <div className="text-stone-800 text-xs border-b border-stone-150 pb-2 flex items-center justify-between">
            <span className="font-bold">
              {currentStep === 1 && 'Tahap 1: Verifikasi Sumber Data'}
              {currentStep === 2 && 'Tahap 2: Input & Verifikasi Kredensial Target'}
              {currentStep === 3 && 'Tahap 3: Pendaftaran Akun di Project Baru'}
              {currentStep === 4 && 'Tahap 4: Ekspor & Pengunggahan Database Masal'}
              {currentStep === 5 && 'Tahap 5: Promosi & Penyelesaian Migrasi'}
            </span>
            <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              Selesai {Math.round(((currentStep - 1) / 5) * 100)}%
            </span>
          </div>

          {errorMsg && (
            <div className="space-y-3">
              <div className="p-3 bg-rose-50 border border-rose-250 rounded-xl text-xs text-rose-850 flex gap-2 items-start">
                <ServerCrash size={14} className="shrink-0 mt-0.5 text-rose-650" />
                <p className="leading-relaxed font-semibold">{errorMsg}</p>
              </div>

              {/* DETEKSI ERROR PERMISSION FIRESTORE (TARGET CONSOLE BELUM DISETTING / DIKUNCI) */}
              {(errorMsg.toLowerCase().includes('permissions') || errorMsg.toLowerCase().includes('insufficient')) && (
                <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-xl space-y-3 text-xs text-stone-800">
                  <div className="flex gap-2 items-start">
                    <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h6 className="font-bold text-amber-950 uppercase tracking-wide">
                        💡 Solusi Cepat: Aturan Keamanan Database Target Anda Masih Terkunci!
                      </h6>
                      <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                        Firebase baru memblokir semua proses penyimpanan data secara default. Silakan ubah pengaturan Firestore Rules di Project Baru Anda sementara agar data migrasi bisa masuk dengan bebas:
                      </p>
                    </div>
                  </div>

                  {/* CARA SETTING STEP-BY-STEP */}
                  <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-2 text-[11px]">
                    <ol className="list-decimal list-inside space-y-1 text-stone-605">
                      <li>Buka <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="font-bold text-amber-800 underline hover:text-amber-950">Firebase Console</a> di tab browser baru Anda.</li>
                      <li>Pilih Project Firebase Baru Anda (<strong>data-voucher-nmsa</strong>).</li>
                      <li>Di menu kiri, buka <strong>Firestore Database</strong> lalu klik tab <strong>Rules</strong> di bagian atas.</li>
                      <li>Salin kode "Test Mode" di bawah dan klik <strong>Publish</strong>.</li>
                    </ol>

                    <button
                      type="button"
                      onClick={() => {
                        const testRules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`;
                        navigator.clipboard.writeText(testRules);
                        alert('✓ Aturan Keamanan "Test Mode" berhasil disalin! Silakan tempelkan ke tab Rules di Firebase Console baru Anda.');
                      }}
                      className="mt-1 w-full py-2 bg-stone-900 hover:bg-stone-800 text-white font-mono font-bold text-[10px] rounded flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <span>📋 Salin Aturan Keamanan "Test Mode"</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-stone-400 font-mono">
                    * Setelah menempel aturan di atas di Firebase Console Anda, silakan klik ulang tombol <strong>"Mulai Jalankan Migrasi Sekarang"</strong> di bawah!
                  </p>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex gap-2 items-start">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
              <p className="leading-relaxed">{successMsg}</p>
            </div>
          )}

          {/* STEP 1 CODES */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2.5 items-start bg-amber-50 p-3 border border-amber-200 rounded-xl text-xs text-amber-900">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-stone-700">
                  <p className="font-bold text-amber-900">MOHON DIPERHATIKAN SEBELUM MIGRASI:</p>
                  <p>Asisten akan memigrasikan seluruh data aktif Anda ke database Firebase kosong yang baru.</p>
                  <p>Pastikan Anda telah mendayagunakan fitur <strong className="text-amber-905">"Tarik Cloud"</strong> terlebih dahulu agar data lokal Anda saat ini 100% sinkron dan lengkap dengan data di awan sebelum diekspor kembali.</p>
                </div>
              </div>

              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <p className="text-xs text-stone-500 font-medium">RINGKASAN DATA SUMBER (SOURCE DATA):</p>
                <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed">
                  <div>
                    <span className="text-stone-400 block block">Total Transaksi Sedia:</span>
                    <strong className="text-stone-900">{submissions.length} transaksi</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Akun Sumber Utama:</span>
                    <strong className="font-mono text-stone-900">{userProfile?.email || 'OFFLINE/LOKAL'}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Perusahaan Pengguna:</span>
                    <strong className="text-stone-900">{userProfile?.companyName || 'Tanpa Nama'}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Identitas Kode:</span>
                    <strong className="text-stone-900 font-mono">[{userProfile?.companyId?.toUpperCase() || 'NMSA'}]</strong>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer"
                >
                  Saya Mengerti, Mulai Migrasi
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 CODES */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex gap-2 items-start text-stone-500 text-xs bg-stone-50 p-3 rounded-lg border border-stone-150">
                <ShieldCheck size={14} className="text-[#D4AF37] shrink-0 mt-0.5" />
                <p>
                  Masukkan konfigurasi SDK Web App dari <strong>Project Firebase Baru</strong> Anda yang masih kosong. Anda bisa **menempelkan (paste) langsung seluruh kode SDK** di kotak instan untuk pengisian otomatis, atau mengisi form parameter di bawah secara manual.
                </p>
              </div>

              {/* AUTOMATED SDK PASTE PORTAL */}
              <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-mono font-bold text-amber-800 uppercase tracking-wider">
                    📋 Tempel Kode SDK Firebase (Otomatis & Cepat)
                  </label>
                  <span className="text-[9px] text-stone-500 italic bg-white px-1.5 py-0.5 rounded border border-stone-200">
                    Mendukung format JS, JSON & Web Script
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={rawSdkCode}
                  onChange={(e) => parseFirebaseConfigFromCode(e.target.value)}
                  placeholder={`// Silakan tempelkan (paste) code SDK Firebase di sini, contoh:
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "...",
  projectId: "...",
  ...
};`}
                  className="w-full p-2.5 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-850 scroll-smooth"
                />
                <p className="text-[10px] text-stone-500 leading-relaxed">
                  * Sistem akan memindai isi kode secara live dan mempopulasikan bidang-bidang parameter di bawah secara instan & akurat.
                </p>
              </div>

              <div className="text-stone-400 text-[10px] font-mono uppercase tracking-widest border-b border-stone-150 pb-1 flex items-center justify-between">
                <span>VERIFIKASI MANUAL PARAMETER</span>
                <span className="text-stone-500 hover:text-stone-800 cursor-pointer text-[9px] underline font-sans font-bold" onClick={() => {
                  setTargetApiKey('');
                  setTargetProjectId('');
                  setTargetAuthDomain('');
                  setTargetStorageBucket('');
                  setTargetMessagingSenderId('');
                  setTargetAppId('');
                  setRawSdkCode('');
                }}>Bersihkan Form</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    API KEY BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetApiKey}
                    onChange={(e) => setTargetApiKey(e.target.value)}
                    placeholder="AIzaSyA..."
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    PROJECT ID BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    placeholder="nmsa-baru-123"
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    AUTH DOMAIN
                  </label>
                  <input
                    type="text"
                    value={targetAuthDomain}
                    onChange={(e) => setTargetAuthDomain(e.target.value)}
                    placeholder="nmsa-baru-123.firebaseapp.com"
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    STORAGE BUCKET
                  </label>
                  <input
                    type="text"
                    value={targetStorageBucket}
                    onChange={(e) => setTargetStorageBucket(e.target.value)}
                    placeholder="nmsa-baru-123.appspot.com"
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    MESSAGING SENDER ID
                  </label>
                  <input
                    type="text"
                    value={targetMessagingSenderId}
                    onChange={(e) => setTargetMessagingSenderId(e.target.value)}
                    placeholder="84739572917"
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    APP ID BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetAppId}
                    onChange={(e) => setTargetAppId(e.target.value)}
                    placeholder="1:847395..."
                    className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-3.5 py-1.5 text-xs font-bold text-stone-605 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
                >
                  Kembali
                </button>
                <button
                  onClick={handleTestTargetConnection}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-bold bg-stone-900 hover:bg-stone-805 text-white rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  {isLoading ? 'Menghubungkan...' : 'Hubungkan Project & Lanjut'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 CODES */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* CLEAR INSTRUCTIONS FOR EMPTY FIREBASE PROJECT */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex gap-2.5 items-start">
                  <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-stone-700">
                    <p className="font-extrabold text-amber-950 uppercase tracking-wide">
                      Mengapa Otentikasi Bisa Gagal Pada Firebase Baru?
                    </p>
                    <p className="leading-relaxed">
                      Secara default, Firebase kosong yang baru dibuat **belum mengaktifkan fitur login**. Anda memiliki dua opsi di bawah untuk mengatasinya:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-amber-200 mt-2 text-[11px]">
                  {/* OPTION A */}
                  <div className="space-y-1 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="font-bold text-amber-900 block">🟢 CARA AUTOMATIS / INSTAN (Rekomendasi):</span>
                    <p className="text-stone-600">Terima data tanpa pendaftaran akun dahulu. Tekan tombol **"Lewati Otentikasi & Langsung Kirim"** di bagian bawah, data Anda akan langsung ditransfer!</p>
                  </div>

                  {/* OPTION B */}
                  <div className="space-y-1 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="font-bold text-amber-900 block">🔒 CARA SECURE / AKTIFKAN DI CONSOLE:</span>
                    <p className="text-stone-600">Buka <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="underline text-amber-800 font-bold">Firebase Console</a>, pilih **Authentication**, klik tab **Sign-In Method**, aktifkan penyedia **Email/Password** lalu klik simpan.</p>
                  </div>
                </div>
              </div>

              {/* USER DETAILS FOR REGISTER/BYPASS */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <p className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest">
                  Konfigurasikan Profil Kerja yang Didata ke Firebase Target:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Email Akun Target *
                    </label>
                    <input
                      type="email"
                      required
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="admin@perusahaandrive.com"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Password Baru *
                    </label>
                    <input
                      type="password"
                      required
                      value={targetPassword}
                      onChange={(e) => setTargetPassword(e.target.value)}
                      placeholder="Min 6 Karakter"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Nama Di Profil Target
                    </label>
                    <input
                      type="text"
                      required
                      value={targetFullName}
                      onChange={(e) => setTargetFullName(e.target.value)}
                      placeholder="Nama Lengkap Koordinator"
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
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="Keuangan / Accounting"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Kode Perusahaan *
                    </label>
                    <input
                      type="text"
                      required
                      value={targetCompanyId}
                      onChange={(e) => setTargetCompanyId(e.target.value.toLowerCase().trim())}
                      placeholder="misal: cvips"
                      className="w-full p-2 bg-white border border-[#cadcd2] rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#059669] text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Nama Resmi Perusahaan *
                    </label>
                    <input
                      type="text"
                      required
                      value={targetCompanyName}
                      onChange={(e) => setTargetCompanyName(e.target.value)}
                      placeholder="PT / CV Nama Resmi"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                    />
                  </div>
                </div>
              </div>

              {/* BYPASS SHORTCUT CONTAINER */}
              {errorMsg && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 animate-pulse">
                  <p className="text-[11px] font-bold text-amber-900">
                    💡 SOLUSI CEPAT: Klik tombol di bawah jika Anda tidak ingin mengatur Autentikasi sekarang!
                  </p>
                  <button
                    type="button"
                    onClick={handleBypassAuthentication}
                    className="w-full py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>⚡ Lewati Otentikasi & Langsung Transfer Data Sekarang</span>
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-between items-center pt-2 gap-3 border-t border-stone-150">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
                >
                  Kembali
                </button>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleBypassAuthentication}
                    className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition"
                    title="Transfer data langsung ke Firestore tanpa register Auth"
                  >
                    Bypass Otentikasi
                  </button>
                  <button
                    onClick={() => handleTargetAuthentication('signin')}
                    disabled={isLoading}
                    className="px-3 py-2 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <LogIn size={13} />
                    Gunakan Akun Eksis (Login)
                  </button>
                  <button
                    onClick={() => handleTargetAuthentication('signup')}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer"
                  >
                    <UserPlus size={14} />
                    Buat Akun Baru (Daftar)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 CODES */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3.5">
                <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wide">
                  KONFIRMASI AKHIR SEBELUM TRANSFER DATA:
                </h5>
                <ul className="text-xs text-stone-650 space-y-2 list-disc list-inside">
                  <li>System akan membuat profil Anda di project baru: <strong className="text-stone-900 font-mono">{targetUser?.email}</strong>.</li>
                  <li>System akan mendaftarkan workspace profil perusahaan: <strong className="text-[#D4AF37] font-semibold">{targetCompanyName} ({targetCompanyId.toUpperCase()})</strong>.</li>
                  <li>Migrasi massal akan menyalin aman <strong className="text-stone-900 font-bold">{submissions.length} transaksi</strong> beserta strukturnya.</li>
                  <li>Pengunggahan menggunakan proses sinkron untuk menjamin integritas.</li>
                </ul>

                {isLoading && (
                  <div className="space-y-2 pt-2 animate-pulse">
                    <div className="flex justify-between text-xs font-semibold text-stone-700">
                      <span>Proses Mentransfer Data ke Cloud Baru...</span>
                      <span>{migrationProgress}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-gold-dynamic h-full transition-all duration-300"
                        style={{ width: `${migrationProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* LIVE CONSOLE LOGS */}
              {migrationLogs.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-lg p-3 text-[10px] font-mono text-emerald-400 h-32 overflow-y-auto space-y-1 scrollbar-thin">
                  {migrationLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
                >
                  Kembali
                </button>
                <button
                  onClick={handleRunMassMigration}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-955 rounded-xl transition flex items-center gap-2 shadow-3xs cursor-pointer font-semibold animate-bounce-subtle"
                >
                  <Database size={15} />
                  {isLoading ? 'Mentransfer Data...' : 'Mulai Jalankan Migrasi Sekarang'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5 CODES */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-fade-in text-left">
              <div className="text-center p-5 space-y-3 bg-emerald-50 border border-emerald-250 rounded-2xl">
                <div className="inline-flex p-3 bg-emerald-100 text-emerald-700 rounded-full animate-bounce-subtle">
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-1">
                  <h5 className="text-sm font-bold text-emerald-900 font-display">
                    SELURUH DATA TELAH SUKSES SINKRON & AMAN!
                  </h5>
                  <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
                    Seluruh basis data transaksi, identitas instansi perusahaan, dan data penandatangan telah sukses diunggah ke database kosong Firebase baru Anda.
                  </p>
                </div>
              </div>

              {/* FIRESTORE RULES SYNCRONIZATION INFO BOX */}
              <div className="bg-amber-50/75 border border-amber-250 rounded-2xl p-4 space-y-3.5">
                <div className="flex gap-2 items-start">
                  <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h6 className="text-xs font-bold text-amber-950 uppercase tracking-wider font-display">
                      Aturan Keamanan (Firestore Rules) Permanen Tanpa Kedaluwarsa
                    </h6>
                    <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                      Untuk memastikan database Anda **aktif selamanya tanpa ada masa kedaluwarsa 30 hari (rules expired)**, Anda wajib menyalin salah satu opsi aturan keamanan di bawah, lalu menempelkannya ke menu **Rules** di Firestore Console Anda!
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-3 shadow-3xs">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-stone-400 border-b border-stone-100 pb-2">
                    <span>OPSI ATURAN KEAMANAN (FIRESTORE)</span>
                    <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-sans font-bold">Recommended</span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-stone-700">
                      <strong>PILIHAN A: Mode Aman Produktif (Wajib Login & Keamanan Maksimal)</strong>
                      <br />
                      Hanya user terdaftar yang bisa membaca dan menulis data transaksi. Sangat aman dan tidak akan pernah kedaluwarsa.
                    </p>
                    <button
                      onClick={() => {
                        const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 1. Global Safety Net (Default Deny)
    match /{document=**} {
      allow read, write: if false;
    }

    // --- Global Helper Functions ---
    function isSignedIn() {
      return request.auth != null;
    }

    function isBootstrappedAdmin() {
      return request.auth.token.email == "yudi02012001@gmail.com";
    }

    // Role-based lookup from users collection
    function isAdmin() {
      return isSignedIn() && (
        isBootstrappedAdmin() ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin")
      );
    }

    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    function isVerifiedUser() {
      return isSignedIn() && (request.auth.token.email_verified == true || request.auth.token.email == 'yudi02012001@gmail.com');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }

    // --- Entity Validations ---
    function isValidUser(data) {
      return data.uid is string && data.uid.size() <= 128 &&
             data.email is string && data.email.size() <= 256 &&
             (data.fullName is string || data.name is string) &&
             (data.role == "admin" || data.role == "employee" || data.role == "Accounting");
    }

    function isValidAttendance(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.employeeId is string && data.employeeId.size() <= 128 &&
             data.employeeName is string && data.employeeName.size() <= 256 &&
             data.employeeEmail is string && data.employeeEmail.size() <= 256 &&
             data.date is string && data.date.size() == 10 &&
             data.clockIn is string && data.clockIn.size() <= 100 &&
             data.status in ["Present", "Late", "Absent", "Incomplete"] &&
             data.isVerified is bool;
    }

    // --- Collection Routes & Action Gates ---

    // 2. Users Collection (Merged for both apps)
    match /users/{uid} {
      allow get: if isSignedIn() && (isOwner(uid) || isAdmin());
      allow list: if isAdmin();
      allow create: if isSignedIn() && isOwner(uid) && isValidId(uid) && isValidUser(incoming());
      allow update: if isSignedIn() && isOwner(uid) && isValidId(uid) && isValidUser(incoming()) && (
        isAdmin() || (incoming().role == existing().role)
      );
      allow delete: if isAdmin();
    }

    // 3. Attendance Logs
    match /attendance/{attendanceId} {
      allow get: if isSignedIn() && (isAdmin() || resource.data.employeeId == request.auth.uid);
      allow list: if isSignedIn() && (isAdmin() || resource.data.employeeId == request.auth.uid);
      allow create: if isVerifiedUser() && isValidId(attendanceId) && isValidAttendance(incoming()) && (
        incoming().employeeId == request.auth.uid
      );
      allow update: if isSignedIn() && isValidId(attendanceId) && isValidAttendance(incoming()) && (
        isAdmin() || (
          isVerifiedUser() &&
          incoming().employeeId == request.auth.uid &&
          existing().employeeId == request.auth.uid &&
          existing().clockOut == null &&
          incoming().diff(existing()).affectedKeys().hasOnly(['clockOut', 'clockOutLocation', 'clockOutNotes', 'status'])
        )
      );
      allow delete: if isAdmin();
    }

    // 4. Office Configurations
    match /office_config/{configId} {
      allow get, list: if isSignedIn();
      allow write: if isAdmin() && isValidId(configId);
    }

    // 5. Submissions (Voucher / Invoice App Transactions)
    match /submissions/{submissionId} {
      allow get, list, create, update, delete: if isSignedIn();
    }

    // 6. Companies (Voucher / Invoice App Company Config)
    match /companies/{companyId} {
      allow get, list, create, update, delete: if isSignedIn();
    }

    // 7. Activity Logs (Voucher / Invoice App Logs)
    match /activity_logs/{logId} {
      allow get, list, create, update, delete: if isSignedIn();
    }
  }
}`;
                        navigator.clipboard.writeText(rules);
                        alert('✓ Aturan Keamanan Gabungan "Mode Aman Produktif" sukses disalin! Tempelkan (paste) di tab "Rules" Cloud Firestore Anda.');
                      }}
                      className="px-3.5 py-2 bg-stone-900 border hover:bg-stone-800 text-white rounded-lg text-[10px] font-mono font-bold w-full transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📋 Salin Aturan "Mode Aman Produktif"</span>
                    </button>
                  </div>

                  <hr className="border-stone-100" />

                  <div className="space-y-2">
                    <p className="text-[11px] text-stone-700">
                      <strong>PILIHAN B: Mode Terbuka (Tanpa Proteksi Auth - Bebas Expired)</strong>
                      <br />
                      Database aktif selamanya tanpa login. Sangat cocok jika Anda melakukan bypass autentikasi di Tahap 3. Tetap aman dari korupsi data karena struktur file diverifikasi.
                    </p>
                    <button
                      onClick={() => {
                        const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if false;\n    }\n    function isSignedIn() {\n      return true; // Akses umum diizinkan\n    }\n    function isValidId(id) {\n      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');\n    }\n    function incoming() {\n      return request.resource.data;\n    }\n    function existing() {\n      return resource.data;\n    }\n    function isValidSubmission(data) {\n      return data.keys().hasAll(['id', 'lokasi', 'tanggal', 'dibayarkanKepada', 'items'])\n             && data.id is string\n             && data.lokasi is string\n             && data.tanggal is string\n             && data.dibayarkanKepada is string\n             && data.items is list;\n    }\n    match /submissions/{submissionId} {\n      allow get, list: if isSignedIn();\n      allow create: if isSignedIn() && isValidId(submissionId) && isValidSubmission(incoming()) && incoming().id == submissionId;\n      allow update: if isSignedIn() && isValidId(submissionId) && isValidSubmission(incoming()) && incoming().id == existing().id;\n      allow delete: if isSignedIn() && isValidId(submissionId);\n    }\n  }\n}`;
                        navigator.clipboard.writeText(rules);
                        alert('✓ Aturan Keamanan "Mode Terbuka" sukses disalin! Tempelkan (paste) di tab "Rules" Cloud Firestore Anda.');
                      }}
                      className="px-3.5 py-2 bg-stone-100 border border-stone-250 hover:bg-stone-200 text-stone-800 rounded-lg text-[10px] font-mono font-bold w-full transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📋 Salin Aturan "Mode Terbuka"</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-2 text-stone-700 leading-relaxed">
                <p className="font-bold text-stone-900">LANGKAH PENUTUP / FINALISASI:</p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Tombol di bawah akan menyimpan credentials Firebase baru ini sebagai default aktif di browser Anda.</li>
                  <li>Aplikasi otomatis disegarkan dan dialihkan ke project baru Anda secara instan.</li>
                  <li>Anda hanya perlu <strong>Login</strong> menggunakan email <strong className="font-mono text-stone-900">{targetUser?.email}</strong> di project baru Anda untuk melanjutkan pekerjaan dengan data yang sama persis!</li>
                </ol>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handlePromoteAndFinalize}
                  className="px-6 py-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition flex items-center gap-2 shadow-sm font-semibold cursor-pointer animate-pulse-subtle"
                >
                  <Check size={16} />
                  Selesaikan & Segarkan Aplikasi Ke Project Baru
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
