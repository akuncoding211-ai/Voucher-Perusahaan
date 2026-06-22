import React, { useState, useEffect } from 'react';
import { Submission, SubmissionItem } from './types';
import { INITIAL_SUBMISSIONS } from './data/initialData';
import { SubmissionsList } from './components/SubmissionsList';
import { SubmissionForm } from './components/SubmissionForm';
import { PrintDocument } from './components/PrintDocument';
import { JsonBackup } from './components/JsonBackup';
import { DriveSyncMass } from './components/DriveSyncMass';
import { NusantaraLogo } from './components/NusantaraLogo';
import { CloudControlCenter } from './components/CloudControlCenter';
import { AuthGate } from './components/AuthGate';
import { InputBuktiTransfer } from './components/InputBuktiTransfer';
import { UserProfileModal } from './components/UserProfileModal';
import { 
  isFirebaseConfigured, 
  saveSubmissionToFirestore, 
  deleteSubmissionFromFirestore,
  registerAuthChangeListener,
  getUserProfileFromFirestore,
  loadSubmissionsFromFirestore,
  getCompanyProfileFromFirestore,
  logoutFromFirebase,
  saveActivityLogToFirestore
} from './firebase';
import { Database, FileText, CheckSquare, ShieldCheck, Heart, Cloud, Palette } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'classic' | 'gold-dark' | 'emerald' | 'slate'>(() => {
    try {
      return (localStorage.getItem('NUSANTARA_THEME') as any) || 'classic';
    } catch (e) {
      return 'classic';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('NUSANTARA_THEME', theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    try {
      const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading cached submissions on init:', e);
      return [];
    }
  });
  const [view, setView] = useState<'list' | 'form' | 'print'>('list');
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [printInitialTab, setPrintInitialTab] = useState<'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment'>('both');
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  // Synchronous route popstate and hashchange tracking
  useEffect(() => {
    const handleNavigation = () => {
      setCurrentPath(window.location.pathname);
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    return () => {
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('hashchange', handleNavigation);
    };
  }, []);

  const navigateTo = (path: string) => {
    if (path === '/') {
      window.history.pushState({}, '', '/');
      window.location.hash = '';
      setCurrentPath('/');
      setCurrentHash('');
    } else if (path.startsWith('#')) {
      window.location.hash = path;
      setCurrentHash(path);
    } else {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      setCurrentHash('');
    }
  };

  // Listen to Firebase Auth status and load/clear data accordingly
  useEffect(() => {
    // Elegant shared terminal/device logic:
    // If the browser session is fresh (or reopened tab), prevent auto-login by logging out first.
    // Preserves active logins across simple page reloads (F5) through sessionStorage.
    const hasActiveSession = sessionStorage.getItem('NUSANTARA_SESSION_ACTIVE') === 'true';
    if (!hasActiveSession) {
      logoutFromFirebase();
    }

    const unsubscribe = registerAuthChangeListener(async (user) => {
      setAuthUser(user);
      if (!user) {
        setUserProfile(null);
        // DO NOT implicitly delete localStorage or empty submissions here.
        // This avoids race conditions and data-loss during initial app loading stages or tab reopenings!
      } else {
        // Mark session as active to prevent force-logout during same-tab refreshes
        sessionStorage.setItem('NUSANTARA_SESSION_ACTIVE', 'true');
        // Fetch user profile info from Firestore collection
        let profile = await getUserProfileFromFirestore(user.uid);
        if (!profile) {
          profile = {
            fullName: user.email === 'admin@nmsa.com' ? 'Nur Wahyudi' : user.email.split('@')[0],
            role: user.email === 'admin@nmsa.com' ? 'Accounting' : 'User',
            email: user.email,
            companyId: 'nmsa',
            companyName: 'PT Nusantara Mineral Sukses Abadi'
          };
        }

        const companyId = profile.companyId || 'nmsa';
        let companyDetails = await getCompanyProfileFromFirestore(companyId);
        
        // If not found, fall back to Nusantara Mineral default template
        if (!companyDetails) {
          companyDetails = {
            id: companyId,
            code: companyId.toUpperCase(),
            name: companyId === 'nmsa' ? 'PT Nusantara Mineral Sukses Abadi' : companyId.toUpperCase(),
            fullName: companyId === 'nmsa' ? 'PT. Nusantara Mineral Sukses Abadi' : companyId.toUpperCase(),
            defaultJenis: 'Operasional Kantor',
            defaultKode: `BKK-${companyId.toUpperCase()}/V/2026/10001`,
            defaultLokasi: 'Lt.1',
            displayName: `Invoice-${companyId.toUpperCase()}`,
            icon: '🏢',
            isActive: true,
            no_invoice_prefix: `BKK-${companyId.toUpperCase()}`,
            sigAccounting: 'Sri Ekowati',
            sigDibuat: 'Nur Wahyudi',
            sigDirKeuangan: 'Harijon',
            sigDirektur: 'Andi Nursyam Halid',
            sigDisetujui: 'Harijon',
            sigKeuangan: 'Andi Dhiya Salsabila'
          };
        }

        const combinedProfile = {
          ...profile,
          companyId,
          companyName: companyDetails.name || companyDetails.fullName || 'PT Nusantara Mineral Sukses Abadi',
          companyDetails
        };
        setUserProfile(combinedProfile);

        // Fetch submissions automatically from Firestore
        try {
          const cloudData = await loadSubmissionsFromFirestore(profile?.companyId);
          if (cloudData && cloudData.length > 0) {
            // MERGE behavior instead of blind overwrite!
            // This prevents locally added/edited entries (such as the 101st item) from being wiped out
            // by a slightly stale/delayed cloud set or temporary syncing delay.
            const storedLocal = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            let localList: Submission[] = [];
            try {
              localList = storedLocal ? JSON.parse(storedLocal) : [];
            } catch (jsonErr) {
              console.error('Error parsing stored local submissions:', jsonErr);
            }

            const mergedMap = new Map<string, Submission>();
            // Load current state / local list first holding edits/creations
            localList.forEach(sub => {
              if (sub && sub.id) {
                mergedMap.set(sub.id, sub);
              }
            });
            // Overwrite with incoming cloud items
            cloudData.forEach(sub => {
              if (sub && sub.id) {
                mergedMap.set(sub.id, sub);
              }
            });

            const mergedList = Array.from(mergedMap.values());
            mergedList.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

            saveSubmissionsToStorage(mergedList);
          } else {
            const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            if (stored) {
              setSubmissions(JSON.parse(stored));
            } else {
              setSubmissions([]);
            }
          }
        } catch (e) {
          console.error('Error fetching data from Firestore:', e);
          try {
            const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            if (stored) {
              setSubmissions(JSON.parse(stored));
            } else {
              setSubmissions([]);
            }
          } catch (localStorageErr) {
            console.error('Error loading data from localStorage:', localStorageErr);
            setSubmissions([]);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync state changes with localStorage
  const saveSubmissionsToStorage = (updatedList: Submission[]) => {
    setSubmissions(updatedList);
    try {
      localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(updatedList));
    } catch (e) {
      console.error('Error saving data to localStorage:', e);
    }
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    const targetSub = submissions.find(s => s.id === id);
    const updated = submissions.filter((sub) => sub.id !== id);
    saveSubmissionsToStorage(updated);
    
    if (isFirebaseConfigured()) {
      try {
        await deleteSubmissionFromFirestore(id);
      } catch (err) {
        console.warn('Silent fallback: cloud delete rejected', err);
      }
    }

    if (targetSub) {
      try {
        const totalVal = targetSub.items.reduce((sum, item) => sum + item.total, 0);
        await saveActivityLogToFirestore(
          'delete_submission',
          `Menghapus voucher ${targetSub.kode} milik ${targetSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
          'warning',
          id,
          targetSub.kode,
          userProfile
        );
      } catch (logErr) {
        console.warn('Gagal mencatat log hapus:', logErr);
      }
    }

    if (activeSubmission?.id === id) {
      setActiveSubmission(null);
      setView('list');
    }
  };

  // Duplicate handler
  const handleDuplicate = async (orig: Submission) => {
    // Generate new ID and reset date to today
    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const dy = String(today.getDate()).padStart(2, '0');

    // Deep copy items
    const copiedItems = orig.items.map((item) => ({
      ...item,
      id: Math.random().toString(),
    }));

    const dupe: Submission = {
      ...orig,
      id: `sub-${Date.now()}`,
      tanggal: `${yr}-${mo}-${dy}`,
      dibayarkanKepada: `${orig.dibayarkanKepada} (Salinan)`,
      items: copiedItems,
      createdAt: new Date().toISOString(),
    };

    const updated = [dupe, ...submissions];
    saveSubmissionsToStorage(updated);

    if (isFirebaseConfigured()) {
      try {
        await saveSubmissionToFirestore(dupe, userProfile?.companyId, userProfile?.companyName);
      } catch (err) {
        console.warn('Silent fallback: cloud replicate rejected', err);
      }
    }

    try {
      const totalVal = dupe.items.reduce((sum, item) => sum + item.total, 0);
      await saveActivityLogToFirestore(
        'update_submission',
        `Menduplikasi voucher lama ${orig.kode} menjadi voucher baru ${dupe.kode} untuk ${dupe.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
        'info',
        dupe.id,
        dupe.kode,
        userProfile
      );
    } catch (logErr) {
      console.warn('Gagal mencatat log duplikasi:', logErr);
    }
  };

  // Save/Update from form submission
  const handleSaveSubmission = async (savedSub: Submission) => {
    let updatedList: Submission[] = [];
    const exists = submissions.some((sub) => sub.id === savedSub.id);

    if (exists) {
      updatedList = submissions.map((sub) => (sub.id === savedSub.id ? savedSub : sub));
    } else {
      updatedList = [savedSub, ...submissions];
    }

    saveSubmissionsToStorage(updatedList);

    if (isFirebaseConfigured()) {
      try {
        await saveSubmissionToFirestore(savedSub, userProfile?.companyId, userProfile?.companyName);
      } catch (err: any) {
        console.error('Core cloud write failed:', err);
        // We throw a detailed error so that the form UI handles it and remains open,
        // preventing the silent cloud save failures from tricking the user.
        throw new Error(
          `Pengajuan berhasil disimpan secara LOKAL di browser Anda, tetapi GAGAL disinkronkan ke Cloud Firestore.\n` +
          `Detail Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
          `Saran Tindakan:\n` +
          `1. Pastikan Rule Keamanan (Security Rules) di Firebase Console Anda memperbolehkan akses tulis (write) untuk koleksi 'submissions'.\n` +
          `2. Periksa apakah masa aktif aturan test-mode 30 hari Anda telah kedaluwarsa.`
        );
      }
    }

    try {
      const totalVal = savedSub.items.reduce((sum, item) => sum + item.total, 0);
      await saveActivityLogToFirestore(
        exists ? 'update_submission' : 'create_submission',
        exists 
          ? `Memperbarui rincian voucher ${savedSub.kode} untuk ${savedSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`
          : `Membuat voucher baru dengan kode ${savedSub.kode} untuk ${savedSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
        exists ? 'info' : 'success',
        savedSub.id,
        savedSub.kode,
        userProfile
      );
    } catch (logErr) {
      console.warn('Gagal mencatat log penyimpanan:', logErr);
    }

    setEditingSubmission(null);
    setView('list');
  };

  // Central Logout Handler
  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('NUSANTARA_SESSION_ACTIVE');
      localStorage.removeItem('NUSANTARA_HO_SUBMISSIONS');
      setSubmissions([]);
      setUserProfile(null);
      setAuthUser(null);
      await logoutFromFirebase();
    } catch (e) {
      console.error('Keluar aplikasi gagal:', e);
    }
  };

  // Import handler for JSON backup
  const handleImportJson = (importedList: Submission[]) => {
    // Overwrite database with imported values, or merge them.
    // Overwriting is safer for full restores, let's offer overwrite + deduplicate based on IDs
    const mergedMap = new Map<string, Submission>();
    
    // Add existing ones first
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    // Add imported ones (which might overwrite if match ID, otherwise brand new)
    importedList.forEach(sub => mergedMap.set(sub.id, sub));
    
    const updated = Array.from(mergedMap.values());
    // Sort by latest date
    updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    
    saveSubmissionsToStorage(updated);
  };

  // Sync / Import handler for Google Sheets legacy vouchers
  const handleSheetsImport = (importedList: Submission[], mergeMode: 'merge' | 'overwrite') => {
    if (mergeMode === 'overwrite') {
      saveSubmissionsToStorage(importedList);
    } else {
      // Merge mode based on deduplicating ids or invoice notes
      const mergedMap = new Map<string, Submission>();
      submissions.forEach(sub => mergedMap.set(sub.id, sub));
      importedList.forEach(sub => mergedMap.set(sub.id, sub));
      
      const updated = Array.from(mergedMap.values());
      updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
      saveSubmissionsToStorage(updated);
    }
  };

  // Sync handler for Firebase Cloud Firestore
  const handleFirebaseSync = (cloudList: Submission[]) => {
    const mergedMap = new Map<string, Submission>();
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    cloudList.forEach(sub => mergedMap.set(sub.id, sub));
    
    const updated = Array.from(mergedMap.values());
    updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    saveSubmissionsToStorage(updated);
  };

  // Check Authentication First: enforce AuthGate for ALL pages when unauthenticated
  if (!authUser) {
    return (
      <AuthGate
        onLoginSuccess={(user, initialData) => {
          sessionStorage.setItem('NUSANTARA_SESSION_ACTIVE', 'true');
          setAuthUser(user);
          if (initialData && initialData.length > 0) {
            saveSubmissionsToStorage(initialData);
          } else {
            // Check localstorage content as fallback
            try {
              const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
              if (stored) {
                setSubmissions(JSON.parse(stored));
              }
            } catch (e) {
              console.error('Error loading data from localStorage:', e);
            }
          }
        }}
      />
    );
  }

  const isIndividualUploaderView = 
    currentPath === '/input-bukti-transfer' || 
    currentHash === '#/input-bukti-transfer' || 
    currentHash === '#input-bukti-transfer';

  if (isIndividualUploaderView) {
    return (
      <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
        <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-xs print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between min-h-18 py-2 md:py-0">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('/')}>
                <div className="p-2.5 bg-stone-100 rounded-xl text-stone-850">
                  <Database size={20} className="text-gold-dynamic" />
                </div>
                <div className="space-y-0.5">
                  <span className="font-mono text-xs uppercase tracking-wider text-stone-400 font-bold block">
                    {userProfile?.companyDetails?.displayName || 'Internal HO System'}
                  </span>
                  <h1 className="text-xs sm:text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5 font-sans">
                    {userProfile?.companyName ? `${userProfile.companyName} Portal` : 'Nusantara Mineral Payment Portal'}
                  </h1>
                </div>
              </div>

              {/* Quick Theme Selector Control */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-stone-405 text-stone-400" />
                  <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest hidden sm:inline-block">TEMA:</span>
                  <div className="flex items-center gap-1.5 bg-stone-100 border border-stone-200 px-2 py-1.5 rounded-xl shadow-3xs hover:shadow-2xs transition select-none">
                    <button
                      onClick={() => setTheme('classic')}
                      title="Classic Pearl Light"
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'classic' ? 'ring-2 ring-stone-900 border-white scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                      style={{ background: 'linear-gradient(135deg, #ffffff 50%, #D4AF37 50%)' }}
                    />
                    <button
                      onClick={() => setTheme('gold-dark')}
                      title="Gold in The Dark (Premium)"
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'gold-dark' ? 'ring-2 ring-amber-500 border-stone-950 scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                      style={{ background: 'linear-gradient(135deg, #141416 50%, #D4AF37 50%)' }}
                    />
                    <button
                      onClick={() => setTheme('emerald')}
                      title="Royal Emerald"
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'emerald' ? 'ring-2 ring-emerald-600 border-white scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                      style={{ background: 'linear-gradient(135deg, #f1f6f3 50%, #059669 50%)' }}
                    />
                    <button
                      onClick={() => setTheme('slate')}
                      title="Slate Minimalist"
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'slate' ? 'ring-2 ring-sky-500 border-stone-950 scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                      style={{ background: 'linear-gradient(135deg, #11141a 50%, #0284c7 50%)' }}
                    />
                  </div>
                </div>

                {/* User Info & Logout Button for Finance View */}
                {authUser && (
                  <div className="flex items-center gap-2">
                    <div 
                      onClick={() => setIsProfileOpen(true)}
                      className="flex flex-col items-end py-1 hover:bg-stone-50 border border-transparent hover:border-stone-250 px-3 py-1.5 rounded-2xl transition cursor-pointer select-none"
                      title="Klik untuk membuka menu profil & penyimpanan"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-mono text-stone-600">
                        <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate max-w-[120px] sm:max-w-[200px] font-sans font-black text-stone-900">
                          {userProfile ? userProfile?.fullName : authUser?.email}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {userProfile ? userProfile.role : 'Divisi Keuangan'}
                      </span>
                    </div>
                    
                    <button
                      id="btn-logout-header-finance"
                      onClick={handleLogout}
                      className="text-[9px] font-mono font-bold text-rose-600 hover:text-rose-755 bg-rose-50 hover:bg-rose-100 border border-rose-150 rounded-lg px-2 py-1.5 transition cursor-pointer shadow-3xs flex items-center gap-1"
                      title="Keluar dari sesi saat ini"
                    >
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <InputBuktiTransfer 
            submissions={submissions} 
            userProfile={userProfile}
            onUpdateSubmissions={setSubmissions} 
            onBack={() => navigateTo('/')} 
          />
        </main>

        <footer className="bg-white border-t border-stone-200 py-6 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
            <div>
              {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'} &copy; 2026. Semua hak cipta dilindungi.
            </div>
            <div className="flex items-center gap-1 text-stone-200">
              Dibuat dengan <Heart size={10} className="fill-rose-500 text-rose-500 animate-pulse" /> untuk administrasi HO yang modern
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
      
      {/* GLOBAL HEADER HEADER - Hidden on print */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-18 py-2 md:py-0">
            {/* Logo area */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('list')}>
              <div className="p-2.5 bg-stone-100 rounded-xl text-stone-850">
                <Database size={20} className="text-gold-dynamic" />
              </div>
              <div className="space-y-0.5">
                <span className="font-mono text-xs uppercase tracking-wider text-stone-400 font-bold block">
                  {userProfile?.companyDetails?.displayName || 'Internal HO System'}
                </span>
                <h1 className="text-xs sm:text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5 font-sans">
                  {userProfile?.companyName ? `${userProfile.companyName} Portal` : 'Nusantara Mineral Payment Portal'}
                </h1>
              </div>
            </div>

            {/* Quick Theme Selector Control & Support Info */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Palette size={14} className="text-stone-405 text-stone-400" />
                <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest hidden sm:inline-block">TEMA:</span>
                <div className="flex items-center gap-1.5 bg-stone-100 border border-stone-200 px-2 py-1.5 rounded-xl shadow-3xs hover:shadow-2xs transition select-none">
                  <button
                    onClick={() => setTheme('classic')}
                    title="Classic Pearl Light"
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'classic' ? 'ring-2 ring-stone-900 border-white scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                    style={{ background: 'linear-gradient(135deg, #ffffff 50%, #D4AF37 50%)' }}
                  />
                  <button
                    onClick={() => setTheme('gold-dark')}
                    title="Gold in The Dark (Premium)"
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'gold-dark' ? 'ring-2 ring-amber-500 border-stone-950 scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                    style={{ background: 'linear-gradient(135deg, #141416 50%, #D4AF37 50%)' }}
                  />
                  <button
                    onClick={() => setTheme('emerald')}
                    title="Royal Emerald"
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'emerald' ? 'ring-2 ring-emerald-600 border-white scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                    style={{ background: 'linear-gradient(135deg, #f1f6f3 50%, #059669 50%)' }}
                  />
                  <button
                    onClick={() => setTheme('slate')}
                    title="Slate Minimalist"
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 transform cursor-pointer border ${theme === 'slate' ? 'ring-2 ring-sky-500 border-stone-950 scale-125 shadow-xs' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                    style={{ background: 'linear-gradient(135deg, #11141a 50%, #0284c7 50%)' }}
                  />
                </div>
              </div>

              <div 
                onClick={() => setIsProfileOpen(true)}
                className="flex flex-col items-end py-1 hover:bg-stone-50 border border-transparent hover:border-stone-250 px-3 py-1.5 rounded-2xl transition cursor-pointer select-none"
                title="Klik untuk membuka menu profil & penyimpanan"
              >
                <div className="flex items-center gap-1.5 text-xs font-mono text-stone-600">
                  <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[200px] font-sans font-black text-stone-900">
                    {userProfile ? userProfile.fullName : (authUser ? authUser.email : 'Nur Wahyudi')}
                  </span>
                </div>
                <span className="text-[10px] text-stone-400 font-mono">
                  {userProfile ? userProfile.role : 'Divisi Keuangan'}
                </span>
              </div>
              
              <button
                id="btn-logout-header"
                onClick={handleLogout}
                className="text-[9px] font-mono font-bold text-rose-600 hover:text-rose-750 bg-rose-50 hover:bg-rose-100 border border-[#f3d8d8] rounded-lg px-2 py-1.5 transition cursor-pointer shadow-3xs flex items-center gap-1"
                title="Keluar dari sesi saat ini"
              >
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>



      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* VIEW 1: Submissions Data History & Backup Operations */}
        {view === 'list' && (
          <div className="space-y-6">
            
            {/* Unified Cloud Control & Integration Center */}
            <CloudControlCenter
              submissions={submissions}
              userProfile={userProfile}
              onSyncData={handleFirebaseSync}
              onUpdateSubmissions={saveSubmissionsToStorage}
              onImportSuccess={handleSheetsImport}
            />

            {/* Main Listing components */}
            <SubmissionsList
              submissions={submissions}
              userProfile={userProfile}
              onSelect={(sub, initialTab) => {
                setActiveSubmission(sub);
                setPrintInitialTab(initialTab || 'both');
                setView('print');
              }}
              onEdit={(sub) => {
                setEditingSubmission(sub);
                setView('form');
              }}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onAddNew={() => {
                setEditingSubmission(null);
                setView('form');
              }}
              onOpenBuktiTransfer={() => navigateTo('#/input-bukti-transfer')}
            />

            {/* Backup / Export-Import Section */}
            <div className="pt-4 print:hidden space-y-4">
              <DriveSyncMass submissions={submissions} onUpdateSubmissions={saveSubmissionsToStorage} />
              <JsonBackup submissions={submissions} onImport={handleImportJson} />
            </div>
          </div>
        )}

        {/* VIEW 2: Input / Edit Submission Form */}
        {view === 'form' && (
          <SubmissionForm
            initialSubmission={editingSubmission}
            userProfile={userProfile}
            submissions={submissions}
            onSave={handleSaveSubmission}
            onCancel={() => {
              setEditingSubmission(null);
              setView('list');
            }}
          />
        )}

        {/* VIEW 3: Print document presentation with precision styles */}
        {view === 'print' && activeSubmission && (
          <PrintDocument
            submission={activeSubmission}
            userProfile={userProfile}
            initialTab={printInitialTab}
            onBack={() => {
              setActiveSubmission(null);
              setView('list');
            }}
          />
        )}

      </main>

      {/* COMPACT FOOTER - Hidden on print */}
      <footer className="bg-white border-t border-stone-200 py-6 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
          <div>
            {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'} &copy; 2026. Semua hak cipta dilindungi.
          </div>
          <div className="flex items-center gap-1 text-stone-300">
            Dibuat dengan <Heart size={10} className="fill-rose-500 text-rose-500 animate-pulse" /> untuk administrasi HO yang lebih modern & efisien
          </div>
        </div>
      </footer>

      {/* User Profile Details & Storage Manager Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userProfile={userProfile}
        authUser={authUser}
      />

    </div>
  );
}
