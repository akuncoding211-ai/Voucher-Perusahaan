import React, { useState, useMemo, useEffect } from 'react';
import { Submission, ActivityLog } from '../types';
import { formatRupiah, formatDateIndonesian } from '../utils';
import { Search, Eye, Edit2, Trash2, Calendar, MapPin, DollarSign, Plus, Copy, RefreshCw, Cloud, FileText, Database, History, FileSpreadsheet, CheckCircle, AlertCircle, Printer, Check, ExternalLink, Coins, User } from 'lucide-react';
import { loadActivityLogsFromFirestore } from '../firebase';

interface SubmissionsListProps {
  submissions: Submission[];
  onSelect: (submission: Submission, initialTab?: 'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment') => void;
  onEdit: (submission: Submission) => void;
  onDelete: (id: string) => void;
  onDuplicate: (submission: Submission) => void;
  onAddNew: () => void;
  onOpenBuktiTransfer?: () => void;
  userProfile?: any;
}

export const SubmissionsList: React.FC<SubmissionsListProps> = ({
  submissions,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onAddNew,
  onOpenBuktiTransfer,
  userProfile,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [jenisFilter, setJenisFilter] = useState<string>('');
  
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('');

  const MONTHS_LIST = [
    { value: 'All', label: 'Semua Bulan' },
    { value: '01', label: 'Januari' },
    { value: '02', label: 'Februari' },
    { value: '03', label: 'Maret' },
    { value: '04', label: 'April' },
    { value: '05', label: 'Mei' },
    { value: '06', label: 'Juni' },
    { value: '07', label: 'Juli' },
    { value: '08', label: 'Agustus' },
    { value: '09', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
  ];
  
  const [layoutMode, setLayoutMode] = useState<'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap'>('standard');
  const [activeSheetTab, setActiveSheetTab] = useState<string>('Data Sinkron');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // States for Petty Cash Recap view
  const [pettyCashSearchQuery, setPettyCashSearchQuery] = useState<string>('');
  const [pettyCashCustodianFilter, setPettyCashCustodianFilter] = useState<string>('All');
  const [pettyCashMonthFilter, setPettyCashMonthFilter] = useState<string>('All');

  // States for Unpaid/Outstanding view
  const [unpaidSearchTerm, setUnpaidSearchTerm] = useState<string>('');
  const [unpaidLocationFilter, setUnpaidLocationFilter] = useState<string>('All');

  // States for Invoice Recap view
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<string>('All');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');

  // Fetch activity logs when audit logs tab is open
  const reloadLogs = () => {
    setIsLoadingLogs(true);
    loadActivityLogsFromFirestore()
      .then(data => {
        setLogs(data);
      })
      .catch(err => {
        console.error("Gagal mematikan/mengambil log riwayat:", err);
      })
      .finally(() => {
        setIsLoadingLogs(false);
      });
  };

  useEffect(() => {
    if (layoutMode === 'audit_logs') {
      reloadLogs();
    }
  }, [layoutMode]);

  // Helper to extract item texts as a concatenated string (Isi Invoice)
  const getIsiInvoice = (sub: Submission) => {
    if (!sub.items || sub.items.length === 0) {
      return sub.notes || 'Tidak ada detil items';
    }
    return sub.items.map(item => item.item).filter(Boolean).join(', ');
  };

  // Extract dynamic monthly sheets represented in submissions
  const availableSheets = useMemo(() => {
    const sheets = ['Data Sinkron'];
    const months = new Set<string>();
    submissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`); // e.g., "2026-06"
        }
      }
    });
    // Sort months descending (latest first)
    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));
    sortedMonths.forEach(m => {
      sheets.push(`PT Nusantara Mineral Sukses Abadi-${m}`);
    });
    return sheets;
  }, [submissions]);

  // Dynamic list of years from submissions
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    submissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 1 && parts[0]) {
          years.add(parts[0]);
        }
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [submissions]);

  // Filter logic
  const filteredSubmissions = useMemo(() => {
    const list = submissions.filter((sub) => {
      const matchSearch =
        sub.dibayarkanKepada.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.jenisPengajuan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.lokasi.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.kode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.items.some((item) => item.item.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchMethod = methodFilter === 'All' || sub.dibayarkanDengan === methodFilter;
      const subStatus = sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');
      const matchStatus = statusFilter === 'All' || subStatus === statusFilter;
      const matchJenis = !jenisFilter.trim() || 
        sub.jenisPengajuan.toLowerCase().includes(jenisFilter.trim().toLowerCase());

      // Filter by Date, Month, Year
      let matchDate = true;
      if (sub.tanggal) {
        const [y, m] = sub.tanggal.split('-'); // Format "YYYY-MM-DD"
        
        const matchYear = yearFilter === 'All' || y === yearFilter;
        const matchMonth = monthFilter === 'All' || m === monthFilter;
        const matchDay = !dateFilter || sub.tanggal === dateFilter;
        
        matchDate = matchYear && matchMonth && matchDay;
      } else {
        matchDate = yearFilter === 'All' && monthFilter === 'All' && !dateFilter;
      }

      return matchSearch && matchMethod && matchStatus && matchJenis && matchDate;
    });

    // Sort descending by tanggal (latest date first), with logical tie-breakers
    return list.sort((a, b) => {
      // 1. Compare Date (tanggal)
      const dateA = a.tanggal || '';
      const dateB = b.tanggal || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      // 2. Compare BKK serial number suffix if matching pattern e.g. "BKK-NMSA/VI/26/1020"
      const suffixA = a.kode ? parseInt(a.kode.split('/').pop() || '0', 10) : 0;
      const suffixB = b.kode ? parseInt(b.kode.split('/').pop() || '0', 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB) && suffixA !== suffixB) {
        return suffixB - suffixA; // Higher serial number first
      }

      // 3. Fallback to createdAt
      const timeC = a.createdAt || '';
      const timeD = b.createdAt || '';
      if (timeC !== timeD) {
        return timeD.localeCompare(timeC);
      }

      // 4. Fallback to ID
      return b.id.localeCompare(a.id);
    });
  }, [submissions, searchTerm, methodFilter, statusFilter, jenisFilter, yearFilter, monthFilter, dateFilter]);

  const spreadsheetFilteredSubmissions = useMemo(() => {
    if (activeSheetTab === 'Data Sinkron') {
      return filteredSubmissions;
    }
    const prefix = 'PT Nusantara Mineral Sukses Abadi-';
    if (activeSheetTab.startsWith(prefix)) {
      const yearMonth = activeSheetTab.substring(prefix.length);
      return filteredSubmissions.filter(sub => sub.tanggal && sub.tanggal.startsWith(yearMonth));
    }
    return filteredSubmissions;
  }, [filteredSubmissions, activeSheetTab]);

  const spreadsheetSum = useMemo(() => {
    return spreadsheetFilteredSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);
  }, [spreadsheetFilteredSubmissions]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = filteredSubmissions.length;
    const totalAmount = filteredSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);

    const locationsCount = new Set(filteredSubmissions.map((s) => s.lokasi)).size;

    return {
      totalCount,
      totalAmount,
      locationsCount,
    };
  }, [filteredSubmissions]);

  // Filter on activity logs
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const text = (log.details || '').toLowerCase() + ' ' + 
                   (log.userName || '').toLowerCase() + ' ' + 
                   (log.userEmail || '').toLowerCase() + ' ' +
                   (log.submissionCode || '').toLowerCase();
      return text.includes(logsSearchTerm.toLowerCase());
    });
  }, [logs, logsSearchTerm]);

  // Grouped amounts for quick charts/budget
  const methodStats = useMemo(() => {
    let tunai = 0;
    let transfer = 0;
    filteredSubmissions.forEach(sub => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      if (sub.dibayarkanDengan === 'Tunai') tunai += subSum;
      else transfer += subSum;
    });
    return { tunai, transfer };
  }, [filteredSubmissions]);

  // Invoice calculations and groupings
  const invoiceSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      // If the user explicitly set isInvoice (either true or false), we must respect it.
      if (typeof sub.isInvoice === 'boolean') {
        return sub.isInvoice;
      }

      // Heuristic fallback for older documents that don't have isInvoice field
      const hasInvoiceTag = !!sub.isInvoice;
      const hasInvoiceFile = !!sub.googleDriveFiles?.some(
        f => f.docType === 'invoice_vendor' || 
             (f.name || '').toLowerCase().includes('invoice') || 
             (f.name || '').toLowerCase().includes('tagihan')
      );
      const isInvoiceNote = (sub.notes || '').toLowerCase().includes('invoice') || 
                            (sub.notes || '').toLowerCase().includes('tagihan') || 
                            (sub.notes || '').toLowerCase().includes('inv/');
      const isInvoiceItem = sub.items?.some(i => 
        (i.item || '').toLowerCase().includes('invoice') || 
        (i.keterangan || '').toLowerCase().includes('invoice')
      );
      
      const heuristicMatch = hasInvoiceTag || hasInvoiceFile || isInvoiceNote || isInvoiceItem;

      // Exclude tax-related (pajak / djp / direktorat) from heuristic auto-detect unless they are explicitly tagged
      if (heuristicMatch) {
        const isTaxRelated = 
          (sub.jenisPengajuan || '').toLowerCase().includes('pajak') ||
          (sub.dibayarkanKepada || '').toLowerCase().includes('pajak') ||
          (sub.dibayarkanKepada || '').toLowerCase().includes('djp') ||
          (sub.notes || '').toLowerCase().includes('pajak') ||
          (sub.notes || '').toLowerCase().includes('djp') ||
          (sub.items || []).some(i => 
            (i.item || '').toLowerCase().includes('pajak') || 
            (i.keterangan || '').toLowerCase().includes('pajak')
          );

        if (isTaxRelated) {
          return false;
        }
      }

      return heuristicMatch;
    });
  }, [submissions]);

  // Petty Cash calculations and groupings
  const pettyCashSubmissions = useMemo(() => {
    return submissions.filter(sub => !!sub.isPettyCash);
  }, [submissions]);

  const availablePettyCashCustodians = useMemo(() => {
    const custodians = new Set<string>();
    pettyCashSubmissions.forEach(sub => {
      if (sub.pettyCashCustodian) {
        custodians.add(sub.pettyCashCustodian.trim());
      }
    });
    return Array.from(custodians).sort();
  }, [pettyCashSubmissions]);

  const availablePettyCashMonths = useMemo(() => {
    const months = new Set<string>();
    pettyCashSubmissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`);
        }
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [pettyCashSubmissions]);

  const filteredPettyCashSubmissions = useMemo(() => {
    return pettyCashSubmissions.filter(sub => {
      // 1. Custodian Filter
      if (pettyCashCustodianFilter !== 'All') {
        if (sub.pettyCashCustodian?.trim() !== pettyCashCustodianFilter.trim()) {
          return false;
        }
      }

      // 2. Month Filter
      if (pettyCashMonthFilter !== 'All') {
        const parts = sub.tanggal.split('-');
        const subMonth = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : '';
        if (subMonth !== pettyCashMonthFilter) return false;
      }

      // 3. Search Query
      if (pettyCashSearchQuery.trim()) {
        const query = pettyCashSearchQuery.toLowerCase();
        const textToSearch = [
          sub.kode || '',
          sub.pettyCashCustodian || '',
          sub.jenisPengajuan || '',
          sub.notes || '',
          sub.dibayarkanKepada || ''
        ].join(' ').toLowerCase();
        if (!textToSearch.includes(query)) return false;
      }

      return true;
    });
  }, [pettyCashSubmissions, pettyCashCustodianFilter, pettyCashMonthFilter, pettyCashSearchQuery]);

  // Dynamic invoice month list
  const availableInvoiceMonths = useMemo(() => {
    const months = new Set<string>();
    invoiceSubmissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`); // formats "YYYY-MM"
        }
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // Latest first
  }, [invoiceSubmissions]);

  // Invoice list after active filters applied
  const filteredInvoiceSubmissions = useMemo(() => {
    return invoiceSubmissions.filter(sub => {
      // 1. Month Filter
      if (invoiceMonthFilter !== 'All') {
        const parts = sub.tanggal.split('-');
        const subMonth = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : '';
        if (subMonth !== invoiceMonthFilter) return false;
      }

      // 2. Status Filter
      if (invoiceStatusFilter !== 'All') {
        const subSum = sub.items.reduce((s, i) => s + (i.total || 0), 0);
        const subStatus = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran) ? 'Lunas' : 'Belum Lunas';
        if (subStatus !== invoiceStatusFilter) return false;
      }

      // 3. Search Query
      if (invoiceSearchQuery.trim()) {
        const q = invoiceSearchQuery.toLowerCase();
        const matchesKode = (sub.kode || '').toLowerCase().includes(q);
        const matchesPenerima = (sub.dibayarkanKepada || '').toLowerCase().includes(q);
        const matchesNoInv = (sub.invoiceNumber || '').toLowerCase().includes(q) || 
                             (sub.notes || '').toLowerCase().includes(q) ||
                             sub.items?.some(i => (i.item || '').toLowerCase().includes(q) || (i.keterangan || '').toLowerCase().includes(q));
        const matchesJenis = (sub.jenisPengajuan || '').toLowerCase().includes(q);
        
        if (!matchesKode && !matchesPenerima && !matchesNoInv && !matchesJenis) return false;
      }

      return true;
    });
  }, [invoiceSubmissions, invoiceMonthFilter, invoiceStatusFilter, invoiceSearchQuery]);

  // Combined stats for chosen month/filters
  const invoiceRecapStats = useMemo(() => {
    let totalNominal = 0;
    let totalLunas = 0;
    let totalBelumLunas = 0;

    filteredInvoiceSubmissions.forEach(sub => {
      const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
      
      const invoiceAmt = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
      totalNominal += invoiceAmt;

      if (isLunas) {
        totalLunas++;
      } else {
        totalBelumLunas++;
      }
    });

    return {
      count: filteredInvoiceSubmissions.length,
      totalNominal,
      totalLunas,
      totalBelumLunas
    };
  }, [filteredInvoiceSubmissions]);

  // Month-by-month grid matrix
  const invoiceMonthlyGrid = useMemo(() => {
    const monthsMap: { [key: string]: { count: number; total: number; lunas: number; belumLunas: number } } = {};
    
    invoiceSubmissions.forEach(sub => {
      if (!sub.tanggal) return;
      const parts = sub.tanggal.split('-');
      if (parts.length < 2) return;
      const mKey = `${parts[0]}-${parts[1]}`;

      const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
      const invoiceAmt = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = { count: 0, total: 0, lunas: 0, belumLunas: 0 };
      }

      monthsMap[mKey].count += 1;
      monthsMap[mKey].total += invoiceAmt;
      if (isLunas) {
        monthsMap[mKey].lunas += 1;
      } else {
        monthsMap[mKey].belumLunas += 1;
      }
    });

    return Object.entries(monthsMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month)); // Sort descending
  }, [invoiceSubmissions]);

  // Unpaid invoices of all time
  const unpaidInvoicesAllTime = useMemo(() => {
    return invoiceSubmissions.filter(sub => {
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
      return !isLunas;
    });
  }, [invoiceSubmissions]);

  // ALL unpaid submissions of all time across the entire application
  const allUnpaidSubmissionsAllTime = useMemo(() => {
    return submissions.filter(sub => {
      const subStatus = sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');
      return subStatus === 'Belum Lunas';
    });
  }, [submissions]);

  // Filtered unpaid submissions for the "Kewajiban Belum Bayar" center
  const filteredUnpaidSubmissions = useMemo(() => {
    return allUnpaidSubmissionsAllTime.filter(sub => {
      const matchSearch =
        sub.dibayarkanKepada.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.jenisPengajuan.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.lokasi.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.kode.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.items.some(item => (item.item || '').toLowerCase().includes(unpaidSearchTerm.toLowerCase()));

      const matchLocation = unpaidLocationFilter === 'All' || sub.lokasi === unpaidLocationFilter;
      return matchSearch && matchLocation;
    });
  }, [allUnpaidSubmissionsAllTime, unpaidSearchTerm, unpaidLocationFilter]);

  // Aggregate stats for outstanding payments
  const unpaidOutstandingStats = useMemo(() => {
    const totalAmount = filteredUnpaidSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);

    return {
      count: filteredUnpaidSubmissions.length,
      totalAmount,
    };
  }, [filteredUnpaidSubmissions]);

  // Dynamic set of locations showing up in unpaid items
  const unpaidLocations = useMemo(() => {
    const locSet = new Set<string>();
    allUnpaidSubmissionsAllTime.forEach(s => {
      if (s.lokasi) locSet.add(s.lokasi);
    });
    return Array.from(locSet);
  }, [allUnpaidSubmissionsAllTime]);

  const handleDownloadCSV = () => {
    if (filteredSubmissions.length === 0) {
      alert("Tidak ada data untuk diunduh!");
      return;
    }

    // Headers matching professional ledger style
    const headers = [
      "No",
      "Tanggal",
      "No Voucher / Kode",
      "Lokasi",
      "Jenis Pengajuan",
      "Penerima",
      "Metode Pembayaran",
      "Status",
      "Items Pengeluaran",
      "Keterangan Items",
      "Nominal (IDR)"
    ];

    const rows: string[][] = [];

    filteredSubmissions.forEach((sub, idx) => {
      const subTotal = sub.items.reduce((sum, item) => sum + item.total, 0);
      const itemsStr = sub.items.map(item => item.item).join(" | ");
      const specStr = sub.items.map(item => item.keterangan || "").filter(Boolean).join(" | ");
      const statusStr = sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');

      rows.push([
        String(idx + 1),
        sub.tanggal || "",
        sub.kode || "",
        `"${(sub.lokasi || "").replace(/"/g, '""')}"`,
        `"${(sub.jenisPengajuan || "").replace(/"/g, '""')}"`,
        `"${(sub.dibayarkanKepada || "").replace(/"/g, '""')}"`,
        sub.dibayarkanDengan || "",
        statusStr,
        `"${itemsStr.replace(/"/g, '""')}"`,
        `"${specStr.replace(/"/g, '""')}"`,
        String(subTotal)
      ]);
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    let monthLabel = monthFilter === 'All' ? 'Semua-Bulan' : MONTHS_LIST.find(m => m.value === monthFilter)?.label || monthFilter;
    let yearLabel = yearFilter === 'All' ? 'Semua-Tahun' : yearFilter;
    let fileDateLabel = dateFilter ? `-${dateFilter}` : `-${monthLabel}-${yearLabel}`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Transaksi_PT_NMSA${fileDateLabel}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Dynamic View Layout Switcher Bar */}
      <div className="bg-white border border-stone-200 rounded-2xl p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs print:hidden">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-50 rounded-xl border border-stone-100">
          <button
            onClick={() => setLayoutMode('standard')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'standard'
                ? 'bg-stone-900 text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-stone-850 hover:bg-stone-150/40'
            }`}
          >
            <Database size={13} className={layoutMode === 'standard' ? 'text-gold-dynamic' : ''} />
            <span>Tampilan Standar</span>
          </button>
          
          <button
            onClick={() => {
              setLayoutMode('spreadsheet');
              setActiveSheetTab('Data Sinkron');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'spreadsheet'
                ? 'bg-emerald-800 text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-emerald-700 hover:bg-emerald-50/40'
            }`}
          >
            <FileText size={13} className={layoutMode === 'spreadsheet' ? 'text-white' : ''} />
            <span>Tampilan Spreadsheet</span>
          </button>

          <button
            onClick={() => setLayoutMode('audit_logs')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'audit_logs'
                ? 'bg-[#917118] text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-[#917118] hover:bg-stone-150/40'
            }`}
          >
            <History size={13} className={layoutMode === 'audit_logs' ? 'text-white' : ''} />
            <span>Riwayat Audit</span>
          </button>

          <button
            onClick={() => setLayoutMode('invoice_recap')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'invoice_recap'
                ? 'bg-amber-600 text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-amber-700 hover:bg-stone-150/40'
            }`}
          >
            <FileSpreadsheet size={13} className={layoutMode === 'invoice_recap' ? 'text-white' : ''} />
            <span>Rekap & Bukti Invoice</span>
          </button>

          <button
            onClick={() => setLayoutMode('unpaid_outstanding')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'unpaid_outstanding'
                ? 'bg-rose-700 text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-rose-700 hover:bg-stone-150/40'
            }`}
          >
            <AlertCircle size={13} className={layoutMode === 'unpaid_outstanding' ? 'text-white' : 'text-rose-500 animate-pulse'} />
            <span className="flex items-center gap-1">Kewajiban Belum Bayar</span>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-black ${
              layoutMode === 'unpaid_outstanding' ? 'bg-white text-rose-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {allUnpaidSubmissionsAllTime.length}
            </span>
          </button>

          <button
            onClick={() => setLayoutMode('petty_cash_recap')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
              layoutMode === 'petty_cash_recap'
                ? 'bg-violet-700 text-white shadow-sm font-extrabold font-display'
                : 'bg-transparent text-stone-500 hover:text-violet-700 hover:bg-stone-150/40'
            }`}
          >
            <Coins size={13} className={layoutMode === 'petty_cash_recap' ? 'text-white' : 'text-violet-500'} />
            <span className="flex items-center gap-1">Petty Cash Lapangan</span>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-black ${
              layoutMode === 'petty_cash_recap' ? 'bg-white text-violet-800' : 'bg-violet-100 text-violet-800'
            }`}>
              {pettyCashSubmissions.length}
            </span>
          </button>
        </div>
        
        <div className="flex items-center gap-2 text-right pr-2 select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
            Internal Ledger Database: <span className="text-emerald-600 font-sans font-black">Online / Sinkron</span>
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      {layoutMode === 'standard' && unpaidInvoicesAllTime.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in shadow-3xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-700 rounded-xl shrink-0 mt-0.5">
              <AlertCircle size={16} className="text-amber-600 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900 leading-tight">Ada Tagihan/Invoice Outstanding Belum Dibayar</h4>
              <p className="text-stone-600 text-xs mt-0.5">Sistem mendeteksi ada <strong className="text-amber-800 underline font-mono">{unpaidInvoicesAllTime.length} tagihan invoice vendor</strong> yang belum lunas/belum memiliki bukti bayar sejak awal pencatatan transaksi.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setLayoutMode('invoice_recap');
              setInvoiceMonthFilter('All');
              setInvoiceStatusFilter('Belum Lunas');
            }}
            className="px-4 py-2 bg-[#917118] hover:bg-[#7e6113] text-white font-extrabold text-xs rounded-xl transition shadow-3xs cursor-pointer select-none whitespace-nowrap self-stretch sm:self-auto text-center"
          >
            Lihat Semua Tagihan Belum Lunas →
          </button>
        </div>
      )}

      {layoutMode === 'standard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 - Midnight Gold Accent */}
          <div className="relative overflow-hidden bg-stone-900 text-white p-6 rounded-2xl shadow-xs border border-stone-850 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 rounded-full blur-2xl transition-all group-hover:scale-125 opacity-25" style={{ backgroundColor: 'var(--brand-gold)' }}></div>
            <div className="space-y-1 relative z-10 font-display">
              <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Pengajuan</span>
              <div className="text-3xl font-black tracking-tight text-white">
                {stats.totalCount} <span className="text-xs font-medium text-stone-400 font-sans uppercase">Voucher</span>
              </div>
            </div>
            <div className="p-3 bg-stone-800 rounded-xl text-gold-dynamic border border-stone-750 relative z-10">
              <Calendar size={22} />
            </div>
          </div>

          {/* Card 2 - Premium Pearl White */}
          <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-xs border border-stone-200 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl transition-all group-hover:scale-125"></div>
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-stone-500 font-mono tracking-widest uppercase block">Total Nilai Kas Keluar</span>
              <div className="text-2xl font-black text-stone-900 font-mono tracking-tight">
                Rp {formatRupiah(stats.totalAmount)}
              </div>
            </div>
            <div className="p-3 bg-stone-50 rounded-xl text-stone-700 border border-stone-150 relative z-10">
              <DollarSign size={22} className="text-[#917118]" />
            </div>
          </div>

          {/* Card 3 - Corporate Summary */}
          <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-xs border border-stone-205 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl transition-all group-hover:scale-125"></div>
            <div className="space-y-1 relative z-10 w-full">
              <span className="text-[10px] text-stone-500 font-mono tracking-widest uppercase block">Klasifikasi Pembayaran</span>
              <div className="text-xs space-y-1.5 font-mono pt-1">
                <div className="flex justify-between gap-4">
                  <span className="text-stone-450">Tunai:</span>
                  <span className="font-bold text-stone-800">Rp {formatRupiah(methodStats.tunai)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-stone-450">Cek / Transfer:</span>
                  <span className="font-bold text-stone-800">Rp {formatRupiah(methodStats.transfer)}</span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-stone-50 rounded-xl text-stone-700 border border-stone-150 shrink-0 relative z-10">
              <MapPin size={22} className="text-stone-500" />
            </div>
          </div>
        </div>
      )}

      {/* Control Panel: Search & Filters */}
      {layoutMode === 'standard' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs divide-y divide-stone-150 print:hidden animate-fade-in">
          {/* Row 1: General search & core criteria */}
          <div className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row items-stretch gap-3">
              {/* Text Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="Cari penerima, items, lokasi, atau kode..."
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 transition text-stone-900"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Jenis Filter Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="Filter jenis pengajuan (e.g. Petty Cash, Gaji)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 transition text-stone-900"
                  value={jenisFilter}
                  onChange={(e) => setJenisFilter(e.target.value)}
                />
              </div>

              {/* Method Filter */}
              <select
                className="px-4 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:ring-2 focus:ring-stone-400 focus:outline-none md:w-48 text-stone-700"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="All">Semua Metode</option>
                <option value="Tunai">Tunai</option>
                <option value="Cek/Transfer">Cek/Transfer</option>
              </select>

              {/* Status Filter */}
              <select
                className="px-4 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:ring-2 focus:ring-stone-400 focus:outline-none md:w-48 text-stone-700"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Semua Status</option>
                <option value="Lunas">Lunas</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </div>

            {/* Action Button Container */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <button
                onClick={onOpenBuktiTransfer}
                id="btn-upload-bukti-transfer"
                className="flex items-center justify-center gap-1 px-4 py-2.5 border border-stone-250 bg-white hover:bg-stone-50 hover:border-stone-400 text-stone-700 font-bold rounded-xl transition shadow-3xs cursor-pointer text-xs"
              >
                <RefreshCw size={14} className="text-amber-500 mr-1" />
                <span>Upload Bukti Bayar</span>
              </button>

              <button
                onClick={onAddNew}
                id="btn-add-new-submission"
                className="flex items-center justify-center gap-2 bg-gold-dynamic hover:bg-gold-dynamic-hover text-stone-900 font-extrabold px-5 py-2.5 rounded-xl transition shadow-xs focus:ring-2 focus:ring-amber-300 cursor-pointer text-xs font-display tracking-wide"
              >
                <Plus size={16} />
                <span>Input Pengajuan Baru</span>
              </button>
            </div>
          </div>

          {/* Row 2: Monthly, Yearly, and Date Filters & Download reports */}
          <div className="p-5 bg-stone-50/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-wrap items-center gap-4">
              {/* Year Filter Option */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Tahun Transaksi</span>
                <select
                  className="px-3.5 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 min-w-[130px] font-medium"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="All">Semua Tahun</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              {/* Month Filter Option */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Bulan Transaksi</span>
                <select
                  className="px-3.5 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 min-w-[150px] font-medium"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                >
                  {MONTHS_LIST.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Specific Date Picker Input */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Tanggal Spesifik</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="px-3.5 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 font-mono"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                  {dateFilter && (
                    <button
                      onClick={() => setDateFilter('')}
                      className="px-2.5 py-2 hover:bg-stone-200/60 text-stone-550 hover:text-stone-800 text-[11px] font-mono font-bold rounded-lg transition"
                      title="Bersihkan Tanggal"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Active Filter Indicators */}
              {(yearFilter !== 'All' || monthFilter !== 'All' || dateFilter) && (
                <div className="self-end pb-1 pl-1">
                  <button
                    onClick={() => {
                      setYearFilter('All');
                      setMonthFilter('All');
                      setDateFilter('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-850 border border-amber-200 text-[10px] font-bold font-mono rounded-lg transition"
                  >
                    Reset Filter Periode ×
                  </button>
                </div>
              )}
            </div>

            {/* Print and Export Buttons */}
            <div className="flex items-center gap-2 self-stretch lg:self-end">
              <button
                onClick={handleDownloadCSV}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-emerald-800 hover:bg-emerald-900 border border-emerald-950 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Download Laporan Format CSV/Excel"
              >
                <FileSpreadsheet size={13} className="text-white" />
                <span>Unduh Laporan (CSV)</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-955 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Bulanan / Filter Terpilih"
              >
                <Printer size={13} className="text-amber-500 animate-pulse" />
                <span>Cetak List (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Layout Block: Standard List vs Google Sheets Simulator */}
      {layoutMode === 'standard' ? (
        /* Standard Table View */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-display text-[10px] uppercase tracking-widest font-extrabold">
                  <th className="py-4.5 px-6">Tanggal</th>
                  <th className="py-4.5 px-6">Lokasi & Kode</th>
                  <th className="py-4.5 px-6">Jenis Pengajuan</th>
                  <th className="py-4.5 px-6">Penerima Kas</th>
                  <th className="py-4.5 px-6 text-right">Total Nilai</th>
                  <th className="py-4.5 px-6 text-center">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800 text-sm">
                {filteredSubmissions.length > 0 ? (
                  filteredSubmissions.map((sub) => {
                    const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                    return (
                      <tr key={sub.id} className="hover:bg-stone-50/50 transition">
                        <td className="py-4.5 px-6 whitespace-nowrap">
                          <div className="font-extrabold text-stone-900">
                            {formatDateIndonesian(sub.tanggal)}
                          </div>
                          <div className="text-xs text-stone-400 font-mono mt-0.5">{sub.tanggal}</div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-800 flex items-center gap-1">
                            <MapPin size={13} className="text-stone-400" />
                            {sub.lokasi}
                          </div>
                          <span className="inline-block mt-1 font-mono text-[10px] font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-sm border border-stone-200">
                            Kode: {sub.kode}
                          </span>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-900">{sub.jenisPengajuan}</div>
                          <div className="text-xs text-stone-500 mt-0.5 font-mono">
                            {sub.items.length} Item pengeluaran
                          </div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-900">{sub.dibayarkanKepada}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold ${
                              sub.dibayarkanDengan === 'Tunai'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-150'
                            }`}>
                              {sub.dibayarkanDengan}
                            </span>
                            
                            <span className={`inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold ${
                              (sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas')) === 'Lunas'
                                ? 'bg-teal-50 text-teal-700 border border-teal-150'
                                : 'bg-rose-50 text-rose-700 border border-rose-150'
                            }`}>
                              {sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas')}
                            </span>

                            {sub.isInvoice && (
                              <span className="inline-block text-[9px] font-mono bg-amber-500 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider">
                                Invoice
                              </span>
                            )}

                            {sub.isPettyCash && (
                              <span className="inline-block text-[9px] font-mono bg-violet-600 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider" title={`Custodian: ${sub.pettyCashCustodian}`}>
                                Petty Cash
                              </span>
                            )}

                            {sub.googleDriveFileUrl && (
                              <a
                                href={sub.googleDriveFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={`Lampiran: ${sub.googleDriveFileName || 'Buka di Drive'}`}
                                className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-850 border border-amber-200 px-2.5 py-0.5 rounded-full hover:bg-amber-100 transition font-mono font-bold"
                              >
                                <Cloud size={10} className="text-amber-600" />
                                Drive
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-4.5 px-6 text-right font-mono font-extrabold text-stone-900">
                          Rp {formatRupiah(subTotal)}
                        </td>
                        <td className="py-4.5 px-6 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              title="Tampilkan / Cetak PDF"
                              onClick={() => onSelect(sub)}
                              id={`btn-view-${sub.id}`}
                              className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-[#D4AF37] hover:text-[#Bca031] rounded-xl transition cursor-pointer shadow-3xs"
                            >
                              <Eye size={17} />
                            </button>
                            
                            <button
                              title="Duplikat Data"
                              onClick={() => onDuplicate(sub)}
                              id={`btn-dup-${sub.id}`}
                              className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-stone-500 hover:text-stone-850 rounded-xl transition cursor-pointer shadow-3xs"
                            >
                              <Copy size={16} />
                            </button>

                            <button
                              title="Edit Data"
                              onClick={() => onEdit(sub)}
                              id={`btn-edit-${sub.id}`}
                              className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sky-500 hover:text-sky-750 rounded-xl transition cursor-pointer shadow-3xs"
                            >
                              <Edit2 size={16} />
                            </button>

                            <button
                              title="Hapus Data"
                              onClick={() => {
                                if (window.confirm(`Yakin ingin menghapus data pengajuan untuk "${sub.dibayarkanKepada}" senilai Rp ${formatRupiah(subTotal)}?`)) {
                                  onDelete(sub.id);
                                }
                              }}
                              id={`btn-delete-${sub.id}`}
                              className="p-2 hover:bg-rose-50 border border-transparent hover:border-rose-150 text-rose-500 hover:text-rose-700 rounded-xl transition cursor-pointer shadow-3xs"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-stone-400">
                      Tidak ditemukan data pengajuan yang cocok dengan pencarian Anda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : layoutMode === 'spreadsheet' ? (
        /* Google Sheets Table Simulator View with tabs & sum status */
        <div className="bg-[#f9fbfd] rounded-2xl border border-stone-300 shadow-sm overflow-hidden flex flex-col font-sans select-none animate-fade-in">
          {/* Google Sheets Header & Topbar */}
          <div className="bg-emerald-800 text-white p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-emerald-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white text-emerald-800 rounded-lg shadow-sm">
                <FileText size={18} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-white">Pembuatan Voucher NMSA</span>
                  <span className="text-[10px] bg-emerald-700/80 text-emerald-100 px-1.5 py-0.2 rounded font-mono">Disinkronisasi</span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-[10.5px] text-emerald-200 mt-0.5">
                  <span className="hover:text-white cursor-pointer transition">File</span>
                  <span className="hover:text-white cursor-pointer transition">Edit</span>
                  <span className="hover:text-white cursor-pointer transition">Tampilan</span>
                  <span className="hover:text-white cursor-pointer transition">Format</span>
                  <span className="hover:text-white cursor-pointer transition">Data</span>
                  <span className="hover:text-white cursor-pointer transition">Alat</span>
                  <span className="hover:text-white cursor-pointer transition">Bantuan</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Quick action with selected row */}
              {selectedRowId && (() => {
                const selectedSub = submissions.find(s => s.id === selectedRowId);
                if (!selectedSub) return null;
                const subTotal = selectedSub.items.reduce((sum, i) => sum + i.total, 0);
                return (
                  <div className="bg-emerald-900/80 border border-emerald-600 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs">
                    <span className="text-emerald-300">Baris Terpilih: <strong className="text-white font-mono">{selectedSub.kode || 'Voucher'}</strong></span>
                    <div className="h-4 w-[1px] bg-emerald-700"></div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelect(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-amber-400 hover:text-amber-300 rounded cursor-pointer transition"
                        title="Lihat / Cetak Voucher"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => onEdit(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-sky-400 hover:text-sky-300 rounded cursor-pointer transition"
                        title="Edit Voucher"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => onDuplicate(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-stone-300 hover:text-white rounded cursor-pointer transition"
                        title="Duplikat Voucher"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Yakin ingin menghapus voucher "${selectedSub.dibayarkanKepada}" senilai Rp ${formatRupiah(subTotal)}?`)) {
                            onDelete(selectedSub.id);
                            setSelectedRowId(null);
                          }
                        }}
                        className="p-1 hover:bg-emerald-850 text-rose-400 hover:text-rose-300 rounded cursor-pointer transition"
                        title="Hapus Voucher"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })()}
              
              <button
                onClick={onAddNew}
                className="bg-white hover:bg-stone-100 text-emerald-850 font-black text-xs px-4 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Tambah Baris</span>
              </button>
            </div>
          </div>

          {/* Google Sheets Decorative Menu Formatter Bar */}
          <div className="bg-stone-50 border-b border-stone-200 p-1.5 flex flex-wrap items-center gap-1 text-xs text-stone-600">
            <div className="px-2 py-1 bg-white border border-stone-200 rounded text-[11px] font-medium text-stone-700 min-w-[70px] text-center">
              Arial
            </div>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <div className="px-2 py-1 bg-white border border-stone-200 rounded text-[11px] font-medium text-stone-700 text-center">
              100%
            </div>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <button className="p-1 hover:bg-stone-200 rounded font-bold font-mono">Rp</button>
            <button className="p-1 hover:bg-stone-200 rounded font-bold font-mono">%</button>
            <button className="p-1 hover:bg-stone-200 rounded font-mono">.0</button>
            <button className="p-1 hover:bg-stone-200 rounded font-mono">.00</button>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <button className="p-1 bg-stone-200/50 text-stone-800 rounded">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
            </button>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <div className="flex-1 text-right text-[10.5px] font-mono text-stone-400 pr-2">
              Double klik baris untuk cetak bukti PDF
            </div>
          </div>

          {/* Dense Table wrapper */}
          <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
            <table className="w-full text-left border-collapse table-fixed select-text">
              <thead>
                {/* Spreadsheet Column Label Coordinates (A, B, C...) */}
                <tr className="bg-stone-100 text-stone-500 font-mono text-[10px] uppercase text-center border-b border-stone-250">
                  <th className="w-10 bg-stone-200/60 border-r border-stone-250 py-1"></th>
                  <th className="w-12 border-r border-stone-250 py-1">A</th>
                  <th className="w-48 border-r border-stone-250 py-1">B</th>
                  <th className="w-28 border-r border-stone-250 py-1">C</th>
                  <th className="w-48 border-r border-stone-250 py-1">D</th>
                  <th className="w-36 border-r border-stone-250 py-1">E</th>
                  <th className="w-64 border-r border-stone-250 py-1">F</th>
                  <th className="w-32 border-r border-stone-250 py-1">G</th>
                  <th className="w-24 border-r border-stone-250 py-1">H</th>
                  <th className="w-44 border-r border-stone-250 py-1">I</th>
                  <th className="w-20 border-r border-stone-250 py-1">J</th>
                  <th className="w-36 border-r border-stone-250 py-1">K</th>
                  <th className="w-24 bg-stone-105 border-stone-250 py-1">Aksi</th>
                </tr>
                {/* Actual Labels Row (No, Company, Tanggal...) */}
                <tr className="bg-stone-50 border-b border-stone-300 text-stone-600 font-bold text-[11px] tracking-tight">
                  <th className="bg-stone-100 border-r border-stone-300 text-center py-2 text-stone-400 font-mono text-[10px]">#</th>
                  <th className="border-r border-stone-300 px-2 py-2">No</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Company</th>
                  <th className="border-r border-stone-300 px-2 py-2">Tanggal</th>
                  <th className="border-r border-stone-300 px-2 py-2">No Invoice</th>
                  <th className="border-r border-stone-300 px-2 py-2">Jenis</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Isi Invoice</th>
                  <th className="border-r border-stone-300 px-2.5 py-2 text-right">Nominal</th>
                  <th className="border-r border-stone-300 px-2 py-2 text-center">Status</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Dibayarkan</th>
                  <th className="border-r border-stone-300 px-2 py-2 text-center">Link File</th>
                  <th className="border-r border-stone-300 px-2 py-2">Nama File</th>
                  <th className="px-2 py-2 text-center bg-stone-100/50">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-stone-800 text-[11px] font-sans">
                {spreadsheetFilteredSubmissions.length > 0 ? (
                  spreadsheetFilteredSubmissions.map((sub, idx) => {
                    const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                    const isSelected = selectedRowId === sub.id;
                    const itemDescription = getIsiInvoice(sub);
                    
                    return (
                      <tr 
                        key={sub.id} 
                        onClick={() => setSelectedRowId(sub.id)}
                        onDoubleClick={() => onSelect(sub)}
                        className={`hover:bg-amber-50/20 active:bg-amber-100/35 transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50/60 font-medium border-l-2 border-emerald-600' : 'bg-white'
                        }`}
                      >
                        {/* Left vertical numbers list indicator */}
                        <td className={`font-mono text-[10px] text-center select-none border-r border-stone-300 font-bold ${
                          isSelected ? 'bg-emerald-700 text-white' : 'bg-stone-50 text-stone-400'
                        }`}>
                          {idx + 1}
                        </td>
                        
                        {/* Column A: No */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 font-mono text-center">
                          {idx + 1}
                        </td>
                        
                        {/* Column B: Company */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 truncate max-w-full" title="PT Nusantara Mineral Sukses Abadi">
                          PT Nusantara Mineral Sukses Abadi
                        </td>
                        
                        {/* Column C: Tanggal */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 whitespace-nowrap text-stone-700">
                          {formatDateIndonesian(sub.tanggal)}
                        </td>
                        
                        {/* Column D: No Invoice */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 font-mono font-bold text-stone-900 truncate">
                          {sub.kode || 'BKK-VOUCHER'}
                        </td>
                        
                        {/* Column E: Jenis */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 truncate" title={sub.jenisPengajuan}>
                          {sub.jenisPengajuan}
                        </td>
                        
                        {/* Column F: Isi Invoice */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 text-stone-600 max-w-xs truncate" title={itemDescription}>
                          {itemDescription}
                        </td>
                        
                        {/* Column G: Nominal */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 text-right font-mono font-bold text-emerald-800">
                          Rp {formatRupiah(subTotal)}
                        </td>
                        
                        {/* Column H: Status */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 text-center">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            (sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas')) === 'Lunas'
                              ? 'bg-emerald-100 text-emerald-850 font-extrabold uppercase border border-emerald-350'
                              : 'bg-rose-100 text-rose-850 font-extrabold uppercase border border-rose-350 animate-pulse'
                          }`}>
                            {sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas')}
                          </span>
                        </td>
                        
                        {/* Column I: Dibayarkan */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 font-medium truncate" title={sub.dibayarkanKepada}>
                          {sub.dibayarkanKepada}
                        </td>
                        
                        {/* Column J: Link File (Google Drive) */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 text-center">
                          {sub.googleDriveFileUrl ? (
                            <a
                              href={sub.googleDriveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 hover:bg-amber-200 text-[#a58421] border border-amber-300 px-1.5 py-0.5 rounded font-mono font-black shadow-3xs"
                              title={sub.googleDriveFileName || "Buka Lampiran Drive"}
                            >
                              <Cloud size={10} className="text-amber-500" />
                              Drive
                            </a>
                          ) : (
                            <span className="text-stone-300 font-mono">-</span>
                          )}
                        </td>
                        
                        {/* Column K: Nama File */}
                        <td className="border-r border-stone-200/80 px-2 py-1 flex items-center h-full max-w-xs overflow-x-auto scrollbar-none" title={sub.googleDriveFileName || 'Tidak ada file lampiran'}>
                          {sub.googleDriveFiles && sub.googleDriveFiles.some(f => f.docType) ? (
                            <div className="flex flex-wrap gap-1 items-center py-0.5">
                              {sub.googleDriveFiles.filter(f => f.docType).map((f) => {
                                const docAbbrev = f.docType === 'po' ? 'PO'
                                                : f.docType === 'lhv' ? 'LHV'
                                                : f.docType === 'draft_survei' ? 'Survei'
                                                : f.docType === 'bill_of_lading' ? 'B/L'
                                                : f.docType === 'cargo_manifest' ? 'Cargo'
                                                : f.docType === 'cow_coa_ds_bongkar' ? 'COW/COA'
                                                : f.docType === 'bukti_pembayaran_batubara' ? 'P.Bara'
                                                : f.docType === 'bukti_shipment_tongkang_founder' ? 'S.Tongkang'
                                                : f.docType === 'bukti_pajak_trader_founder' ? 'Pajak'
                                                : f.docType === 'merged_all' ? 'Gabungan'
                                                : f.docType?.toUpperCase();
                                return (
                                  <a
                                    key={f.docType}
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`border text-[8.5px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0 transition ${
                                      f.docType === 'merged_all'
                                        ? 'bg-amber-50 hover:bg-amber-100 text-[#917118] border-amber-250'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-250'
                                    }`}
                                    title={`Buka ${f.name}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {docAbbrev}
                                  </a>
                                );
                              })}
                              {sub.googleDriveFiles.some(f => !f.docType && !f.isF1 && !f.isF2 && !f.isBuktiPembayaran) && (
                                <span className="bg-stone-50 text-stone-600 border border-stone-250 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                                  +{sub.googleDriveFiles.filter(f => !f.docType && !f.isF1 && !f.isF2 && !f.isBuktiPembayaran).length}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="truncate block py-0.5" title={sub.googleDriveFileName || ''}>
                              {sub.googleDriveFileName || '-'}
                            </span>
                          )}
                        </td>
                        
                        {/* Action buttons inside rows */}
                        <td className="px-2 py-1.5 text-center bg-stone-50/50">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="Tampilkan / Cetak PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(sub);
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-[#D4AF37] rounded transition"
                            >
                              <Eye size={12} />
                            </button>
                            
                            <button
                              title="Edit Data"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(sub);
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-sky-500 rounded transition"
                            >
                              <Edit2 size={12} />
                            </button>
                            
                            <button
                              title="Hapus Data"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Yakin ingin menghapus data pengajuan untuk "${sub.dibayarkanKepada}" senilai Rp ${formatRupiah(subTotal)}?`)) {
                                  onDelete(sub.id);
                                }
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-rose-500 rounded transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-stone-400 font-mono text-xs">
                      Tidak ditemukan data transaksi yang terdaftar di halaman filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BOTTOM GOOGLE SHEETS TABS */}
          <div className="bg-stone-100 border-t border-stone-300 flex flex-col sm:flex-row sm:items-center justify-between text-xs px-2 select-none h-auto sm:h-11">
            {/* Tabs flow container */}
            <div className="flex flex-wrap items-end h-full gap-0.5 overflow-x-auto scroller-hidden">
              {/* Quick left controls (like spreadsheet) */}
              <div className="flex items-center gap-1 px-2 text-stone-500 border-r border-stone-300 h-9 shrink-0">
                <button 
                  onClick={() => onAddNew()}
                  className="p-1 hover:bg-stone-200 rounded text-stone-700 cursor-pointer text-xs font-black"
                  title="Input Voucher Baru"
                >
                  +
                </button>
                <div className="h-4 w-[1px] bg-stone-300 mx-0.5"></div>
                <span className="text-[10px] font-mono select-none">Halaman {spreadsheetFilteredSubmissions.length} baris</span>
              </div>
              
              {/* Direct tabs */}
              {availableSheets.map((sheet) => {
                const isActive = activeSheetTab === sheet;
                // Clean description label
                let label = sheet;
                if (sheet === 'Data Sinkron') {
                  label = '📊 Data Sinkron';
                } else {
                  // Shorten tab label to match Google Sheet: "NMSA-2026-06"
                  label = sheet.replace('PT Nusantara Mineral Sukses Abadi-', '📁 NMSA-');
                }
                
                return (
                  <button
                    key={sheet}
                    onClick={() => setActiveSheetTab(sheet)}
                    className={`px-4 py-2 font-bold text-[11px] rounded-t-lg border-t-3 transition duration-150 cursor-pointer h-9 flex items-center justify-center shrink-0 border-x border-stone-300 ${
                      isActive 
                        ? 'bg-white text-emerald-800 border-t-emerald-700 font-extrabold shadow-3xs' 
                        : 'bg-stone-50 hover:bg-stone-150 text-stone-600 border-t-transparent'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              
              {/* Decorative dashboard redirection tab */}
              <button
                onClick={() => setLayoutMode('standard')}
                className="px-4 py-2 font-bold text-[11px] rounded-t-lg border-t-3 border-t-transparent bg-stone-50 hover:bg-stone-150 text-[#D4AF37] cursor-pointer h-9 flex items-center justify-center shrink-0 border-x border-stone-300"
              >
                🏠 KEMBALI KE METRIK DASHBOARD
              </button>
            </div>

            {/* Sum details at bottom right */}
            <div className="p-2 sm:p-0 font-mono text-[11.5px] font-bold text-stone-600 shrink-0 flex items-center gap-4 bg-stone-200/50 rounded-lg sm:bg-transparent sm:rounded-none">
              <div className="flex items-center gap-1 bg-stone-200 px-2.5 py-1 rounded">
                <span className="text-stone-400">JUMLAH BARIS:</span>
                <span className="text-stone-800">{spreadsheetFilteredSubmissions.length} Data</span>
              </div>
              <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-3 py-1 rounded border border-emerald-250">
                <span className="text-emerald-600 font-extrabold">SUM TOTAL:</span>
                <span className="font-extrabold">Rp {formatRupiah(spreadsheetSum)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : layoutMode === 'invoice_recap' ? (
        /* Rekapitulasi & Pembayaran Invoice Bulanan View */
        <div className="space-y-6">
          
          {/* Header Dashboard section */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-amber-50 rounded-xl text-amber-700">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase">Pusat Rekapitulasi Pembayaran Invoice</h2>
                  <p className="text-xs text-stone-500">Menganalisis, menghitung volume, and mencetak rekapitulasi invoice vendor beserta bukti pembayarannya per bulan.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="inline-flex items-center gap-2 px-4.5 py-2 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Rekap Bulanan yang Aktif"
              >
                <Printer size={14} className="text-[#a58421]" />
                <span>Cetak Rekap Laporan</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Invoice Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT - ONLY OUTDOES ON PAPER PRINTING */}
          <div className="hidden print:block font-sans text-black p-4 space-y-6">
            <div className="border-b-2 border-stone-900 pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-xs text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-sm font-semibold text-stone-850 mt-1">Laporan Rekapitulasi Transaksi Pembayaran Invoice</h2>
              </div>
              <div className="text-right font-mono text-[10px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Filter Bulan: {invoiceMonthFilter === 'All' ? 'Semua Bulan' : formatDateIndonesian(`${invoiceMonthFilter}-01`).replace('1 ', '')}</p>
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-3 gap-4 border border-stone-300 p-3 rounded-lg font-mono text-xs">
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Total Transaksi</span>
                <strong>{invoiceRecapStats.count} Invoice</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Total Nilai Tagihan</span>
                <strong>Rp {invoiceRecapStats.totalNominal.toLocaleString('id-ID')}</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Status Kelayakan</span>
                <strong>Lunas: {invoiceRecapStats.totalLunas} | Belum Lunas: {invoiceRecapStats.totalBelumLunas}</strong>
              </div>
            </div>
          </div>

          {/* Quick Metrics Columns (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs hover:shadow-2xs transition flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Transaksi Invoice</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {invoiceRecapStats.count} <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Transaksi</span>
                </div>
                <span className="text-[10px] text-stone-400 block block font-mono">Bulan Filter: {invoiceMonthFilter === 'All' ? 'Semua Bulan' : invoiceMonthFilter}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                <FileText size={20} />
              </div>
            </div>

            <div className="bg-stone-900 text-white p-5 rounded-2xl border border-stone-850 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Volume Nilai Tagihan</span>
                <div className="text-2xl font-black text-white font-display">
                  Rp {invoiceRecapStats.totalNominal.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-stone-400 block block font-mono">Total tagihan terakumulasi</span>
              </div>
              <div className="p-3 bg-stone-800 rounded-xl text-amber-500 border border-stone-750">
                <DollarSign size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs hover:shadow-2xs transition flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Pemberesan & Status</span>
                <div className="text-base font-black text-stone-800 font-display flex items-center gap-1.5">
                  <span className="text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-150 font-sans">{invoiceRecapStats.totalLunas} Lunas</span>
                  <span className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-150 font-sans">{invoiceRecapStats.totalBelumLunas} Outstanding</span>
                </div>
                <p className="text-[10px] text-stone-400 mt-1 block font-mono">Diupdate secara real-time berdasarkan bukti transfer</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle size={20} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:block">
            
            {/* LEFT COLUMN: MONTH-BY-MONTH STRUCTURED MATRIX CONTAINER */}
            <div className="lg:col-span-1 space-y-4 print:hidden">
              <div className="bg-white rounded-2xl border border-stone-200 p-4.5 space-y-3 shadow-3xs">
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-wider text-stone-500">Mencatat Rekap Per Bulan</h3>
                  <p className="text-[10.5px] text-stone-400 mt-0.5">Klik pada bulan di bawah untuk memfilter daftar invoice secara instan.</p>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-stone-150/60">
                  {/* Dedicated Halaman Belum Bayar button */}
                  <button
                    onClick={() => {
                      setInvoiceMonthFilter('All');
                      setInvoiceStatusFilter('Belum Lunas');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-black rounded-xl transition border cursor-pointer select-none ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? 'bg-amber-500 border-amber-600 text-stone-950 font-black shadow-sm'
                        : 'bg-amber-50/70 hover:bg-amber-100 text-amber-900 border-amber-200/50'
                    }`}
                    title="Klik untuk memfilter semua transaksi tagihan/invoice yang belum dibayar sejak awal."
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <AlertCircle size={13} className={invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas' ? 'text-stone-950' : 'text-amber-600'} />
                      Halaman Belum Bayar
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold font-mono ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? 'bg-stone-950/20 text-stone-950'
                        : 'bg-amber-600/15 text-amber-800 font-extrabold'
                    }`}>
                      {unpaidInvoicesAllTime.length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setInvoiceMonthFilter('All');
                      setInvoiceStatusFilter('All');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer select-none border ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'All'
                        ? 'bg-[#917118] border-[#917118] text-white font-extrabold shadow-3xs'
                        : 'bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-stone-900 border-stone-150'
                    }`}
                  >
                    <span>📅 Semua Transaksi (All)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'All'
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-200/50 text-stone-800'
                    }`}>
                      {invoiceSubmissions.length}
                    </span>
                  </button>

                  {invoiceMonthlyGrid.length > 0 ? (
                    invoiceMonthlyGrid.map((row) => {
                      // Format month label "2026-06" to Indonesian e.g. "Juni 2026"
                      const displayMonth = formatDateIndonesian(`${row.month}-01`).replace('1 ', '');
                      
                      return (
                        <button
                          key={row.month}
                          onClick={() => setInvoiceMonthFilter(row.month)}
                          className={`w-full flex flex-col px-3 py-2 text-xs rounded-xl transition text-left border ${
                            invoiceMonthFilter === row.month
                              ? 'bg-stone-900 border-stone-950 text-white shadow-3xs'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{displayMonth}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${invoiceMonthFilter === row.month ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700'}`}>
                              {row.count} Inv
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-stone-400 mt-1 font-mono">
                            <span>Tagihan:</span>
                            <span className={invoiceMonthFilter === row.month ? 'text-amber-400 font-bold' : 'text-stone-800 font-bold'}>
                              Rp {row.total.toLocaleString('id-ID')}
                            </span>
                          </div>
                          
                          <div className="flex gap-1.5 mt-1">
                            <span className="text-[9px] text-emerald-600 font-sans font-semibold">● {row.lunas} Lunas</span>
                            <span className="text-[9px] text-amber-700 font-sans font-semibold">● {row.belumLunas} Berjalan</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-[11px] text-stone-400">
                      Belum terdeteksi data transaksi invoice.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MAIN INVOICE DETAIL SHEET */}
            <div className="lg:col-span-3 space-y-4 print:w-full print:block">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden animate-fade-in print:border-none print:shadow-none">
                
                {/* Search & Filter section header */}
                <div className="px-6 py-4.5 bg-stone-50 border-b border-stone-150 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase font-mono tracking-widest text-[#a58421] font-bold">
                      {invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? '📂 Ringkasan Tagihan Outstanding'
                        : 'Tabel Transaksi Utama'}
                    </span>
                    <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                      {invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas' ? (
                        <>
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Tagihan Belum Dibayar (Semuawaktu)</span>
                        </>
                      ) : (
                        <span>Daftar Transaksi Invoice Aktif</span>
                      )}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Field */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                      <input
                        type="text"
                        placeholder="Cari vendor, no invoice, koin..."
                        className="pl-8 pr-4 py-1.5 w-full sm:w-56 bg-white border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-700"
                        value={invoiceSearchQuery}
                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                      />
                    </div>

                    {/* Status filter dropdown */}
                    <select
                      className="bg-white border border-stone-250 rounded-xl text-xs py-1.5 px-3 focus:outline-none text-stone-700 font-medium"
                      value={invoiceStatusFilter}
                      onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                    >
                      <option value="All">Semua Status</option>
                      <option value="Lunas">Lunas</option>
                      <option value="Belum Lunas">Belum Lunas</option>
                    </select>

                    {/* Clear filter if active */}
                    {(invoiceMonthFilter !== 'All' || invoiceStatusFilter !== 'All' || invoiceSearchQuery.trim()) && (
                      <button
                        onClick={() => {
                          setInvoiceMonthFilter('All');
                          setInvoiceStatusFilter('All');
                          setInvoiceSearchQuery('');
                        }}
                        className="text-[11px] text-rose-600 hover:text-rose-800 transition font-bold"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </div>

                {/* Table details container */}
                <div className="overflow-x-auto">
                  {filteredInvoiceSubmissions.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-100/85 border-b border-stone-200 text-stone-600 text-[10.5px] uppercase font-mono tracking-wider select-none">
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Tanggal & Kode</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Nomor Invoice</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Vendor / Penerima</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-right">Nominal</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-center">Bukti Lampiran</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-center">Status</th>
                          <th className="py-3 px-4 font-bold text-center print:hidden">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200/80 font-sans text-xs">
                        {filteredInvoiceSubmissions.map((sub) => {
                          const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
                          const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                          const invoiceAmtComputed = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;

                          // Extract specific invoice file if uploaded
                          const invoiceFileObj = sub.googleDriveFiles?.find(
                            f => f.docType === 'invoice_vendor' || 
                                 (f.name || '').toLowerCase().includes('invoice') || 
                                 (f.name || '').toLowerCase().includes('tagihan')
                          ) || sub.googleDriveFiles?.find(
                            f => !f.isBuktiPembayaran && !f.isF1 && !f.isF2 && f.docType !== 'merged_all'
                          );

                          // Extract payment proof file
                          const paymentProofObj = sub.buktiPembayaran || sub.googleDriveFiles?.find(f => f.isBuktiPembayaran);

                          return (
                            <tr
                              key={sub.id}
                              onClick={() => onSelect(sub)}
                              className="hover:bg-stone-50/50 hover:text-stone-900 transition-colors cursor-pointer"
                            >
                              {/* Tanggal & Voucher Code */}
                              <td className="py-3 px-4 border-r border-stone-200/85">
                                <div className="font-mono text-[11px] font-black text-stone-900">{sub.kode || 'HO'}</div>
                                <div className="text-[10px] text-stone-500 font-mono mt-0.5">{formatDateIndonesian(sub.tanggal)}</div>
                              </td>

                              {/* Invoice Number */}
                              <td className="py-3 px-4 border-r border-stone-200/85 font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-stone-850 break-all">{sub.invoiceNumber || sub.kode || 'Tanpa Kode'}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(sub.invoiceNumber || sub.kode || '');
                                      setCopiedId(sub.id);
                                      setTimeout(() => setCopiedId(null), 1500);
                                    }}
                                    className="p-1 hover:bg-stone-150 rounded transition text-stone-400 hover:text-stone-700 print:hidden shrink-0"
                                    title="Salin Nomor Identifikasi"
                                  >
                                    {copiedId === sub.id ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} />
                                    )}
                                  </button>
                                </div>
                                <span className="text-[10px] text-stone-400 block font-sans block truncate mt-0.5" title={sub.jenisPengajuan}>
                                  Kategori: {sub.jenisPengajuan}
                                </span>
                              </td>

                              {/* Vendor / Recipient */}
                              <td className="py-3 px-4 border-r border-stone-200/85 font-semibold text-stone-850">
                                <div className="truncate max-w-[170px]" title={sub.dibayarkanKepada}>
                                  {sub.dibayarkanKepada}
                                </div>
                                <span className="text-[9.5px] text-stone-400 font-mono block font-medium mt-0.5">Loc: {sub.lokasi || 'Lt. 1'}</span>
                              </td>

                              {/* Nominal */}
                              <td className="py-3 px-4 border-r border-stone-200/85 text-right font-mono font-bold text-stone-900">
                                Rp {formatRupiah(invoiceAmtComputed)}
                              </td>

                              {/* File Bukti: Invoice & Bukti Pembayaran */}
                              <td className="py-3 px-4 border-r border-stone-200/85" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-col gap-1 items-center justify-center">
                                  {/* Render Invoice File Badge */}
                                  {invoiceFileObj ? (
                                    <a
                                      href={invoiceFileObj.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2 py-1 w-full bg-amber-50 hover:bg-amber-100 text-[#917118] border border-amber-200 rounded-lg text-[9.5px] font-black transition tracking-tight shadow-3xs"
                                      title={`Nama Berkas: ${invoiceFileObj.name}`}
                                    >
                                      <FileText size={11} className="shrink-0" />
                                      <span className="truncate max-w-[90px]">{invoiceFileObj.name || 'Dokumen Invoice'}</span>
                                      <ExternalLink size={10} className="shrink-0 ml-auto" />
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-stone-350 italic block border border-dashed border-stone-200 px-2 py-0.5 rounded-lg w-full text-center">
                                      File Invoice (-)
                                    </span>
                                  )}

                                  {/* Render Payment Proof Badge */}
                                  {paymentProofObj ? (
                                    <a
                                      href={paymentProofObj.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2 py-1 w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[9.5px] font-black transition tracking-tight shadow-3xs"
                                      title={`Nama Berkas: ${paymentProofObj.name}`}
                                    >
                                      <Cloud size={11} className="shrink-0" />
                                      <span className="truncate max-w-[90px]">{paymentProofObj.name || 'Bukti Transfer'}</span>
                                      <ExternalLink size={10} className="shrink-0 ml-auto" />
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-stone-350 italic block border border-dashed border-stone-200 px-2 py-0.5 rounded-lg w-full text-center">
                                      Bukti Bayar (-)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Status Badging */}
                              <td className="py-3 px-4 border-r border-stone-200/85 text-center select-none">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase tracking-wider ${
                                  isLunas
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-250'
                                    : 'bg-amber-50 text-amber-700 border border-amber-250'
                                }`}>
                                  {isLunas ? 'Lunas' : 'Belum Lunas'}
                                </span>
                              </td>

                              {/* Action Buttons Link */}
                              <td className="py-3 px-4 whitespace-nowrap text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => onSelect(sub)}
                                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition shadow-3xs"
                                    title="Lihat Voucher Transaksi"
                                  >
                                    <Eye size={12} />
                                  </button>
                                  <button
                                    onClick={() => onEdit(sub)}
                                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition shadow-3xs"
                                    title="Edit Informasi"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Focus select and print it directly
                                      onSelect(sub, 'only_invoice_payment');
                                      setTimeout(() => {
                                        window.print();
                                      }, 500);
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg transition border border-amber-250 shadow-3xs"
                                    title="Cetak Hanya Berkas Invoice & Bukti Bayar"
                                  >
                                    <Printer size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-24 text-center space-y-2">
                      <AlertCircle className="mx-auto text-stone-400" size={32} />
                      <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kosong</div>
                      <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Tidak ditemukan transaksi invoice yang sesuai dengan keyword pencarian, status, atau filter bulan Anda.</p>
                      <button
                        onClick={() => {
                          setInvoiceMonthFilter('All');
                          setInvoiceStatusFilter('All');
                          setInvoiceSearchQuery('');
                        }}
                        className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition"
                      >
                        Hapus Semua Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* Print only detailed list table */}
                <div className="hidden print:block font-sans text-xs pt-4">
                  <span className="block font-mono text-[9px] font-bold uppercase text-stone-500 mb-2">Lampiran Rekapitulasi Detail Transaksi Invoice</span>
                  <table className="w-full text-left border-collapse border border-stone-200 table-fixed">
                    <thead>
                      <tr className="bg-stone-50 text-stone-800 text-[8px] uppercase font-mono border-b border-stone-250">
                        <th className="p-2 border border-stone-150 w-[11%]">Tanggal</th>
                        <th className="p-2 border border-stone-150 w-[18%]">Voucher & Inv#</th>
                        <th className="p-2 border border-stone-150 w-[18%]">Vendor / Penerima</th>
                        <th className="p-2 border border-stone-150 w-[22%]">Kategori</th>
                        <th className="p-2 border border-stone-150 w-[13%] text-right font-bold">Nominal</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Status</th>
                        <th className="p-2 border border-stone-150 w-[10%]">Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoiceSubmissions.map((sub, idx) => {
                        const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
                        const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                        const invoiceAmtComputed = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
                        return (
                          <tr key={sub.id} className="border-b border-stone-200 font-sans text-[8.5px] text-stone-850">
                            <td className="p-2 border border-stone-150 font-mono whitespace-nowrap">{sub.tanggal}</td>
                            <td className="p-2 border border-stone-150 font-bold font-mono break-all whitespace-normal leading-tight">
                              {sub.invoiceNumber || sub.kode}
                            </td>
                            <td className="p-2 border border-stone-150 font-sans leading-snug break-words whitespace-normal">{sub.dibayarkanKepada}</td>
                            <td className="p-2 border border-stone-150 leading-relaxed break-words whitespace-normal">{sub.jenisPengajuan}</td>
                            <td className="p-2 border border-stone-150 text-right font-bold font-mono whitespace-nowrap">Rp {invoiceAmtComputed.toLocaleString('id-ID')}</td>
                            <td className="p-2 border border-stone-150 text-center font-mono font-bold text-[7.5px] leading-tight">
                              {isLunas ? 'LUNAS' : 'PENDING'}
                            </td>
                            <td className="p-2 border border-stone-150 text-[8px] text-stone-500 italic break-words whitespace-normal leading-tight">{sub.notes || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Formal signatures block for print reports */}
                  <div className="grid grid-cols-2 gap-8 mt-12 text-center text-xs font-sans">
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">YANG MELAPORKAN (FINANCE)</p>
                      <strong>{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                      <p className="text-[10px] text-stone-400">Divisi Keuangan & Verifikasi</p>
                    </div>
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DISETUJUI OLEH (DIREKTUR UTAMA)</p>
                      <strong>{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                      <p className="text-[10px] text-stone-400">Direktur Utama</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      ) : layoutMode === 'unpaid_outstanding' ? (
        /* Dedicated KPI & Outstanding Payments Center View */
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5 animate-slide-in">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-rose-50 rounded-xl text-rose-700">
                  <AlertCircle size={22} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase font-mono">Pusat Kewajiban Pembayaran</h2>
                  <p className="text-xs text-stone-500">Memonitoring, menyaring, dan mengekspor seluruh transaksi voucher pengeluaran yang berstatus belum lunas.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Kewajiban Pembayaran ke PDF"
              >
                <Printer size={14} className="text-rose-600" />
                <span>Cetak Laporan Pembayaran (PDF)</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Transaksi Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT - ONLY OUTDOES ON PAPER PRINTING */}
          <div className="hidden print:block font-sans text-black p-2 space-y-4">
            <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-lg font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-[10px] text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-xs font-semibold text-stone-850 mt-0.5">Laporan Kewajiban Pembayaran (Outstanding Ledger)</h2>
              </div>
              <div className="text-right font-mono text-[9px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Status: BELUM LUNAS (OUTSTANDING)</p>
                {unpaidLocationFilter !== 'All' && <p>Sektor Lokasi: {unpaidLocationFilter}</p>}
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-2 gap-4 border border-stone-300 p-2.5 rounded-lg font-mono text-[11px]">
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Kewajiban</span>
                <strong>{unpaidOutstandingStats.count} Item Tagihan / Voucher</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Nominal Harus Dibayar (Outstanding)</span>
                <strong>Rp {unpaidOutstandingStats.totalAmount.toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          {/* Quick Metrics Columns (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Voucher Outstanding</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {unpaidOutstandingStats.count} <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Transaksi</span>
                </div>
                <span className="text-[10px] text-rose-500 font-bold font-mono">Belum Lunas & Memerlukan Pembayaran</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                <AlertCircle size={20} />
              </div>
            </div>

            <div className="bg-stone-900 text-white p-5 rounded-2xl border border-stone-850 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block font-bold text-[#D4AF37]">Total Dana Outstanding</span>
                <div className="text-2xl font-black text-rose-400 font-display font-mono">
                  Rp {unpaidOutstandingStats.totalAmount.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-stone-400 block font-mono">Sisa tagihan yang harus segera ditransfer/tunai</span>
              </div>
              <div className="p-3 bg-stone-800 rounded-xl text-amber-500 border border-stone-750">
                <DollarSign size={20} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:block">
            {/* LEFT COLUMN: LOCATION TABS SIDEBAR (print:hidden) */}
            <div className="lg:col-span-1 space-y-4 print:hidden">
              <div className="bg-white rounded-2xl border border-stone-200 p-4.5 space-y-3 shadow-3xs">
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-wider text-stone-500">Filter Sektor Lokasi</h3>
                  <p className="text-[10.5px] text-stone-400 mt-0.5">Saring tagihan berdasarkan lokasi penambangan atau administratif.</p>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-stone-150/60">
                  <button
                    onClick={() => setUnpaidLocationFilter('All')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                      unpaidLocationFilter === 'All'
                        ? 'bg-rose-750 border-rose-800 text-white font-extrabold'
                        : 'bg-stone-50 text-stone-700 hover:bg-stone-150 border-stone-150'
                    }`}
                  >
                    <span>🌐 Semua Lokasi</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                      unpaidLocationFilter === 'All' ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                    }`}>
                      {allUnpaidSubmissionsAllTime.length}
                    </span>
                  </button>

                  {unpaidLocations.map((loc) => {
                    const countLoc = allUnpaidSubmissionsAllTime.filter(s => s.lokasi === loc).length;
                    return (
                      <button
                        key={loc}
                        onClick={() => setUnpaidLocationFilter(loc)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer border ${
                          unpaidLocationFilter === loc
                            ? 'bg-rose-750 border-rose-800 text-white font-extrabold'
                            : 'bg-stone-50 text-stone-700 hover:bg-stone-150 border-stone-150'
                        }`}
                      >
                        <span className="truncate pr-1">📍 {loc}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                          unpaidLocationFilter === loc ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                        }`}>
                          {countLoc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Informative Help Card */}
              <div className="p-4 bg-amber-50/70 border border-amber-200/50 rounded-2xl text-xs text-amber-900 space-y-1 shadow-3xs">
                <span className="font-extrabold block text-amber-950 uppercase tracking-wide text-[10px]">💡 Petunjuk Untuk Finance</span>
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  Laporan ini menunjukkan semua pengeluaran yang disetujui direksi namun belum ditransfer/dibayarkan. Gunakan tombol <strong className="text-stone-850">Cetak Laporan Pembayaran (PDF)</strong> untuk mencetak rekap fisik terverifikasi bagi pimpinan/petugas kas.
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: MAIN TABLE VIEW AND TRANSACTIONS */}
            <div className="lg:col-span-3 space-y-4 print:w-full print:block">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden select-none">
                {/* Search & Filter table header */}
                <div className="px-6 py-4.5 bg-stone-50 border-b border-stone-150 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase font-mono tracking-widest text-rose-600 font-extrabold">
                      Outstanding Liabilities
                    </span>
                    <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>Daftar Transaksi Belum Selesai Lunas</span>
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Term Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
                      <input
                        type="text"
                        placeholder="Cari kode, penerima, item..."
                        className="pl-8.5 pr-3 py-1.5 w-48 sm:w-56 bg-white border border-stone-250 rounded-xl text-xs font-bold text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
                        value={unpaidSearchTerm}
                        onChange={(e) => setUnpaidSearchTerm(e.target.value)}
                      />
                    </div>

                    {unpaidSearchTerm && (
                      <button
                        onClick={() => setUnpaidSearchTerm('')}
                        className="text-[10px] px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-600 font-extrabold transition font-mono"
                      >
                        RESET
                      </button>
                    )}
                  </div>
                </div>

                {/* Table Data */}
                <div className="overflow-x-auto print:hidden">
                  {filteredUnpaidSubmissions.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/40 border-b border-stone-150 text-stone-500 font-mono text-[9px] uppercase tracking-wider font-extrabold">
                          <th className="py-3 px-5">Voucher</th>
                          <th className="py-3 px-5">Tanggal</th>
                          <th className="py-3 px-5">Sektor / Lokasi</th>
                          <th className="py-3 px-5">Jenis Pengajuan & Item</th>
                          <th className="py-3 px-5">Diberikan Kepada</th>
                          <th className="py-3 px-5 text-right">Nilai Outstanding</th>
                          <th className="py-3 px-5 text-center">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-800 text-xs">
                        {filteredUnpaidSubmissions.map((sub) => {
                          const subSumTotal = sub.items.reduce((s, i) => s + i.total, 0);
                          return (
                            <tr key={sub.id} className="hover:bg-stone-50/50 transition">
                              <td className="py-3 px-5 whitespace-nowrap font-bold font-mono text-stone-900">
                                {sub.kode}
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap font-bold text-stone-600">
                                {sub.tanggal}
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-sm border border-stone-200 font-mono text-[10px] font-bold">
                                  {sub.lokasi}
                                </span>
                              </td>
                              <td className="py-3 px-5">
                                <div className="font-extrabold text-stone-900 truncate max-w-[170px]" title={sub.jenisPengajuan}>
                                  {sub.jenisPengajuan}
                                </div>
                                <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-[170px]" title={getIsiInvoice(sub)}>
                                  {getIsiInvoice(sub)}
                                </div>
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap font-medium text-stone-900">
                                {sub.dibayarkanKepada}
                                <div className="text-[9px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1 py-0.2 mt-0.5 inline-block ml-1">
                                  {sub.dibayarkanDengan}
                                </div>
                              </td>
                              <td className="py-3 px-5 text-right font-bold text-rose-700 font-mono whitespace-nowrap">
                                Rp {formatRupiah(subSumTotal)}
                              </td>
                              <td className="py-3 px-5">
                                <div className="flex items-center justify-center gap-1">
                                  {/* View / Print submission detail voucher */}
                                  <button
                                    onClick={() => onSelect(sub)}
                                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg transition"
                                    title="Tinjau & Cetak Voucher F1/F2"
                                  >
                                    <Eye size={12} />
                                  </button>

                                  {/* Trigger upload transfer proof to PAY */}
                                  {onOpenBuktiTransfer && (
                                    <button
                                      onClick={onOpenBuktiTransfer}
                                      className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-250 rounded-lg transition font-extrabold flex items-center justify-center gap-0.5"
                                      title="Unggah Bukti Bayar untuk Melunasi Tagihan ini"
                                    >
                                      <RefreshCw size={11} className="text-emerald-600" />
                                      <span className="text-[9px]">Bayar</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-24 text-center space-y-2">
                      <AlertCircle className="mx-auto text-stone-400 animate-pulse" size={32} />
                      <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kewajiban Kosong</div>
                      <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Selamat! Tidak ada transaksi outstanding/belum dibayar untuk saringan filter pencarian ini.</p>
                      <button
                        onClick={() => {
                          setUnpaidLocationFilter('All');
                          setUnpaidSearchTerm('');
                        }}
                        className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition"
                      >
                        Bersihkan Saringan
                      </button>
                    </div>
                  )}
                </div>

                {/* Print only detailed list table */}
                <div className="hidden print:block font-sans text-xs pt-2">
                  <span className="block font-mono text-[8px] font-bold uppercase text-stone-500 mb-2">Lampiran Detail Kewajiban Pembayaran (All Outstanding Liabilities)</span>
                  <table className="w-full text-left border-collapse border border-stone-200 table-fixed">
                    <thead>
                      <tr className="bg-stone-50 text-stone-800 text-[8px] uppercase font-mono border-b border-stone-250">
                        <th className="p-2 border border-stone-150 w-[14%] whitespace-nowrap">No. Voucher</th>
                        <th className="p-2 border border-stone-150 w-[11%]">Tanggal</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Sektor</th>
                        <th className="p-2 border border-stone-150 w-[30%]">Uraian / Pekerjaan / Item</th>
                        <th className="p-2 border border-stone-150 w-[15%]">Vendor / Penerima Kas</th>
                        <th className="p-2 border border-stone-150 w-[14%] text-right font-black">Outstanding (Rp)</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Cara Bayar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnpaidSubmissions.map((sub, idx) => {
                        const sumTotal = sub.items.reduce((s, i) => s + i.total, 0);
                        return (
                          <tr key={sub.id} className="border-b border-stone-200 font-mono text-[8.5px] text-stone-800">
                            <td className="p-2 border border-stone-150 font-bold whitespace-nowrap break-all font-mono">{sub.kode}</td>
                            <td className="p-2 border border-stone-150 whitespace-nowrap">{sub.tanggal}</td>
                            <td className="p-2 border border-stone-150 text-center uppercase font-mono">{sub.lokasi}</td>
                            <td className="p-2 border border-stone-150 font-sans leading-relaxed break-words whitespace-normal">{sub.jenisPengajuan} - {getIsiInvoice(sub)}</td>
                            <td className="p-2 border border-stone-150 font-sans leading-snug break-words whitespace-normal">{sub.dibayarkanKepada}</td>
                            <td className="p-2 border border-stone-150 text-right font-bold text-stone-900 font-mono whitespace-nowrap">Rp {sumTotal.toLocaleString('id-ID')}</td>
                            <td className="p-2 border border-stone-150 text-center font-sans text-[8px] leading-tight break-words whitespace-normal">{sub.dibayarkanDengan}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Formal signatures block for print reports */}
                  <div className="grid grid-cols-2 gap-8 mt-12 text-center text-xs font-sans">
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DIBUAT OLEH (DIVISI FINANCE)</p>
                      <strong className="border-b border-stone-800 pb-0.5">{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                      <p className="text-[10px] text-stone-400 mt-0.5">Finance Department</p>
                    </div>
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DISETUJUI & DIVERIFIKASI OLEH</p>
                      <strong className="border-b border-stone-800 pb-0.5">{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                      <p className="text-[10px] text-stone-400 mt-0.5">Direktur Utama</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      ) : layoutMode === 'petty_cash_recap' ? (
        /* Dedicated Petty Cash Reconciliation and Report View */
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-violet-50 rounded-xl text-violet-700">
                  <Coins size={22} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase font-mono">Rekonsiliasi Petty Cash Lapangan</h2>
                  <p className="text-xs text-stone-500">Menganalisis, menyaring, and mengelola berkas laporan pertanggungjawaban petty cash lapangan per pemegang kas (custodian).</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Petty Cash Lapangan ke PDF"
              >
                <Printer size={14} className="text-violet-600" />
                <span>Cetak Rekap Pertanggungjawaban (PDF)</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Transaksi Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT */}
          <div className="hidden print:block font-sans text-black p-2 space-y-4">
            <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-lg font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-[10px] text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-xs font-semibold text-stone-850 mt-0.5">Laporan Rekonsiliasi & Pertanggungjawaban Petty Cash Lapangan</h2>
              </div>
              <div className="text-right font-mono text-[9px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Status: VERIFIKASI SELESAI</p>
                {pettyCashCustodianFilter !== 'All' && <p>Pemegang Kas: {pettyCashCustodianFilter}</p>}
                {pettyCashMonthFilter !== 'All' && <p>Periode Laporan: {pettyCashMonthFilter}</p>}
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-3 gap-4 border border-stone-300 p-2.5 rounded-lg font-mono text-[11px]">
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Pencatatan</span>
                <strong>{filteredPettyCashSubmissions.length} Transaksi Pengisian</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Yg Mengajukan LPJ</span>
                <strong>{pettyCashCustodianFilter === 'All' ? 'Semua Custodian' : pettyCashCustodianFilter}</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Nominal Rekap</span>
                <strong>Rp {filteredPettyCashSubmissions.reduce((sum, sub) => sum + sub.items.reduce((s, i) => s + (i.total || 0), 0), 0).toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          {/* KPI Cards (Metrics) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Total Transaksi Petty Cash</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {filteredPettyCashSubmissions.length} <span className="text-xs font-medium text-stone-400">Unit Voucher</span>
                </div>
              </div>
              <div className="p-3 bg-violet-50 text-violet-700 rounded-2xl">
                <Coins size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Total Dana Direkon</span>
                <div className="text-2xl font-black text-stone-900 font-mono">
                  Rp {formatRupiah(filteredPettyCashSubmissions.reduce((sum, sub) => sum + sub.items.reduce((s, i) => s + (i.total || 0), 0), 0))}
                </div>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                <FileSpreadsheet size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Custodian Aktif</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {availablePettyCashCustodians.length} <span className="text-xs font-medium text-stone-400">Personil</span>
                </div>
              </div>
              <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl">
                <User size={20} />
              </div>
            </div>
          </div>

          {/* Saringan & Sorter Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-3xs print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              
              {/* Search input field */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Pencarian Cepat</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-transparent text-stone-800 placeholder-stone-400"
                    placeholder="Cari pemegang, kode pengisian, jenis, dll..."
                    value={pettyCashSearchQuery}
                    onChange={(e) => setPettyCashSearchQuery(e.target.value)}
                  />
                  {pettyCashSearchQuery && (
                    <button
                      onClick={() => setPettyCashSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-bold font-mono"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>

              {/* Custodian Select Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Pemegang Petty Cash</label>
                <select
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-850 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  value={pettyCashCustodianFilter}
                  onChange={(e) => setPettyCashCustodianFilter(e.target.value)}
                >
                  <option value="All">Semua Custodian ({availablePettyCashCustodians.length})</option>
                  {availablePettyCashCustodians.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Month Select Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Periode Bulan</label>
                <select
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-850 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  value={pettyCashMonthFilter}
                  onChange={(e) => setPettyCashMonthFilter(e.target.value)}
                >
                  <option value="All">Semua Periode ({availablePettyCashMonths.length})</option>
                  {availablePettyCashMonths.map(m => {
                    const [y, mNum] = m.split('-');
                    const indMonths = [
                      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                    ];
                    const label = `${indMonths[parseInt(mNum, 10) - 1]} ${y}`;
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
              </div>

            </div>
          </div>

          {/* Table Ledger view */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden print:shadow-none print:border-none">
            <div className="p-5 border-b border-stone-200/80 flex items-center justify-between print:hidden">
              <span className="text-xs font-black uppercase font-mono tracking-wider text-stone-600">Daftar Laporan Pertanggungjawaban Petty Cash Terdaftar</span>
              <span className="text-[10px] bg-violet-100 text-violet-850 font-mono font-extrabold px-2 py-0.5 rounded-lg border border-violet-150 shadow-3xs uppercase">
                {filteredPettyCashSubmissions.length} Transaksi Ditemukan
              </span>
            </div>

            <div className="overflow-x-auto">
              {filteredPettyCashSubmissions.length > 0 ? (
                <table className="w-full text-left border-collapse print:table">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-display text-[10px] uppercase tracking-widest font-extrabold">
                      <th className="py-4 px-6 print:py-2 print:px-3">Tanggal & Voucher</th>
                      <th className="py-4 px-6 print:py-2 print:px-3">Pemegang Petty Cash</th>
                      <th className="py-4 px-6 print:py-2 print:px-3">Uraian / Sektor Lokasi</th>
                      <th className="py-4 px-6 text-right print:py-2 print:px-3">Jumlah Pengisian</th>
                      <th className="py-4 px-6 text-center print:py-2 print:px-3 font-extrabold">Berkas LPJ</th>
                      <th className="py-4 px-6 text-center print:hidden">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-850 text-xs">
                    {filteredPettyCashSubmissions.map((sub) => {
                      const totalNominal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                      return (
                        <tr key={sub.id} className="hover:bg-stone-50/50 transition">
                          {/* Tanggal & Voucher Code */}
                          <td className="py-4.5 px-6 whitespace-nowrap print:py-1.5 print:px-3 font-mono">
                            <div className="font-extrabold text-stone-900">{formatDateIndonesian(sub.tanggal)}</div>
                            <div className="text-[10px] font-mono text-stone-400 mt-0.5">{sub.kode}</div>
                          </td>

                          {/* Pemegang Petty Cash Custodian */}
                          <td className="py-4.5 px-6 print:py-1.5 print:px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center font-bold text-[10px] uppercase font-sans shrink-0">
                                {sub.pettyCashCustodian ? sub.pettyCashCustodian.charAt(0) : 'C'}
                              </div>
                              <div>
                                <span className="font-black text-stone-900 block leading-tight">{sub.pettyCashCustodian || '-'}</span>
                                <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">Custodian Lapangan</span>
                              </div>
                            </div>
                          </td>

                          {/* Uraian dan Lokasi */}
                          <td className="py-4.5 px-6 print:py-1.5 print:px-3">
                            <div className="font-bold text-stone-850">{sub.jenisPengajuan}</div>
                            <div className="text-[10.5px] text-stone-550 mt-0.5 font-sans leading-relaxed">
                              Sektor Lokasi: <strong className="text-stone-700">{sub.lokasi}</strong>
                              {sub.notes && <span className="block mt-0.5 text-stone-400 italic">"{sub.notes}"</span>}
                            </div>
                          </td>

                          {/* Jumlah Pengisian */}
                          <td className="py-4.5 px-6 text-right font-mono font-extrabold text-stone-900 print:py-1.5 print:px-3 text-xs leading-none">
                            Rp {formatRupiah(totalNominal)}
                          </td>

                          {/* Berkas LPJ Link */}
                          <td className="py-4.5 px-6 text-center print:py-1.5 print:px-3 whitespace-nowrap">
                            {sub.pettyCashFile?.url ? (
                              <a
                                href={sub.pettyCashFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-xl transition font-mono text-[10px] font-bold shadow-3xs hover:shadow-2xs select-none"
                                title={`Buka berkas LPJ: ${sub.pettyCashFile.name}`}
                              >
                                📂 Drive Report
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <div className="text-[10px] text-stone-400 font-mono">- Belum Diunggah -</div>
                            )}
                          </td>

                          {/* Action button */}
                          <td className="py-4.5 px-6 text-center print:hidden whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                title="Buka Detail / Cetak PDF"
                                onClick={() => onSelect(sub)}
                                className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-[#D4AF37] hover:text-[#Bca031] rounded-xl transition cursor-pointer shadow-3xs bg-white"
                              >
                                <Eye size={15} />
                              </button>
                              
                              <button
                                title="Edit Transaksi ini"
                                onClick={() => onEdit(sub)}
                                className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sky-500 hover:text-sky-750 rounded-xl transition cursor-pointer shadow-3xs bg-white"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-24 text-center space-y-2 print:py-12">
                  <Coins className="mx-auto text-stone-400" size={32} />
                  <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kosong</div>
                  <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Tidak ditemukan transaksi pengisian petty cash lapangan terdaftar yang sesuai dengan saringan Anda.</p>
                  <button
                    onClick={() => {
                      setPettyCashCustodianFilter('All');
                      setPettyCashMonthFilter('All');
                      setPettyCashSearchQuery('');
                    }}
                    className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition cursor-pointer"
                  >
                    Hapus Semua Saringan
                  </button>
                </div>
              )}
            </div>

            {/* PRINT OPTION SIGNATURE SECTION */}
            <div className="hidden print:block font-sans text-xs pt-12 pb-6">
              <div className="grid grid-cols-2 gap-8 text-center">
                <div>
                  <p className="text-stone-550 uppercase text-[9px] mb-14 font-mono">YANG MELAPORKAN (FINANCE)</p>
                  <strong className="text-stone-850 block">{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                  <span className="text-[9.5px] text-stone-400">Divisi Keuangan & Verifikasi</span>
                </div>
                <div>
                  <p className="text-stone-550 uppercase text-[9px] mb-14 font-mono">DISETUJUI OLEH OLEH (DIREKTUR UTAMA)</p>
                  <strong className="text-stone-850 block">{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                  <span className="text-[9.5px] text-stone-400 font-sans">Direktur Utama</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* Log Riwayat Audit Detail View */
        <div className="bg-white rounded-2xl border border-stone-250 shadow-sm overflow-hidden animate-fade-in">
          {/* Header Activity Log panel */}
          <div className="px-6 py-5 bg-stone-50 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-stone-900">Riwayat Audit & Aktivitas Aplikasi</span>
                <span className="text-[10px] bg-[#917118] text-white font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {filteredLogs.length} Entri Terdaftar
                </span>
              </div>
              <p className="text-xs text-stone-500">Log sinkronisasi transaksi, persetujuan admin, and pengunggahan bukti pembayaran Google Drive secara real-time.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stone sm:items-center gap-2">
              {/* Search Log */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                <input
                  type="text"
                  placeholder="Cari kata kunci log..."
                  className="pl-8 pr-4 py-1.5 w-full sm:w-56 bg-white border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#917118] focus:border-transparent text-stone-700 font-mono"
                  value={logsSearchTerm}
                  onChange={(e) => setLogsSearchTerm(e.target.value)}
                />
              </div>

              {/* Refresh Button */}
              <button
                onClick={reloadLogs}
                disabled={isLoadingLogs}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-stone-250 hover:bg-stone-50 text-stone-700 bg-white font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer"
              >
                <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {isLoadingLogs ? (
              <div className="py-20 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw size={32} className="animate-spin text-[#917118]" />
                <span className="text-xs font-bold text-stone-500">Memuat log riwayat aktivitas terbaru...</span>
              </div>
            ) : filteredLogs.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/60 border-b border-stone-200 text-stone-500 font-mono text-[10px] uppercase tracking-wider">
                    <th className="py-3.5 px-6">Waktu Kejadian (WIB)</th>
                    <th className="py-3.5 px-6">Pelaku Aktivitas</th>
                    <th className="py-3.5 px-6">Nama Modul</th>
                    <th className="py-3.5 px-6">Detail Log Aktivitas</th>
                    <th className="py-3.5 px-6 text-center">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800 text-xs font-mono">
                  {filteredLogs.map((log) => {
                    // Look up submission object to allow clicking "View" directly
                    const affiliateSub = submissions.find(s => s.id === log.submissionId || (s.kode && log.submissionCode && s.kode === log.submissionCode));
                    
                    const logDate = new Date(log.timestamp);
                    const isToday = new Date().toDateString() === logDate.toDateString();
                    
                    let timeStr = logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    let fullDateStr = isToday 
                      ? `Hari ini, ${timeStr}`
                      : `${formatDateIndonesian(log.timestamp.split('T')[0])} ${timeStr}`;

                    // Category colors
                    let catStyle = "bg-stone-100 text-stone-700 border-stone-200";
                    if (log.category === 'success') {
                      catStyle = "bg-emerald-50 text-emerald-800 border-emerald-150";
                    } else if (log.category === 'warning') {
                      catStyle = "bg-rose-50 text-rose-800 border-rose-150";
                    } else if (log.category === 'info') {
                      catStyle = "bg-sky-50 text-sky-800 border-sky-150";
                    }

                    return (
                      <tr key={log.id} className="hover:bg-stone-50/40 transition">
                        {/* Event Time */}
                        <td className="py-3.5 px-6 whitespace-nowrap">
                          <span className="text-[11px] text-stone-500 font-mono">{fullDateStr}</span>
                        </td>

                        {/* User identity */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-[10px] uppercase select-none font-sans shrink-0">
                              {log.userName ? log.userName.charAt(0) : 'S'}
                            </div>
                            <div className="font-sans">
                              <div className="font-bold text-stone-800 text-xs">{log.userName || 'Sistem'}</div>
                              <div className="text-[10px] text-stone-400 font-mono leading-none">{log.userEmail || 'system_ledger'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="py-3.5 px-6 whitespace-nowrap">
                          <span className={`px-2 py-0.5 border text-[10px] font-mono font-black rounded-lg ${catStyle}`}>
                            {log.action.toUpperCase()}
                          </span>
                        </td>

                        {/* Audit Assertion details */}
                        <td className="py-3.5 px-6">
                          <p className="max-w-md break-all sm:break-normal text-stone-700 leading-normal font-sans text-xs">{log.details}</p>
                        </td>

                        {/* Actions link to submission */}
                        <td className="py-3.5 px-6 whitespace-nowrap text-center font-sans">
                          {affiliateSub ? (
                            <button
                              onClick={() => {
                                onSelect(affiliateSub);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900 border border-stone-800 text-white hover:bg-stone-800 font-extrabold rounded-lg transition duration-150 text-[10px] cursor-pointer shadow-3xs"
                              title="Buka / Cetak voucher transaksi yang sah"
                            >
                              <Eye size={11} className="text-[#D4AF37]" />
                              <span>Lihat Voucher</span>
                            </button>
                          ) : log.submissionCode ? (
                            <span className="text-[10px] text-stone-400 font-mono">ID: {log.submissionCode}</span>
                          ) : (
                            <span className="text-[10px] text-stone-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-20 text-center text-stone-400 text-xs">
                Belum terdaftar riwayat ataupun asersi kejadian dalam sistem log riwayat aktivitas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 
        FORMAL PRINT REPORT ACCENT: 
        Only visible on physical print paper or PDF export (hidden on screen)
      */}
      {layoutMode === 'standard' && (
        <div className="hidden print:block font-sans text-black p-4 space-y-6">
          <div className="border-b-2 border-stone-900 pb-4 flex justify-between items-end">
            <div>
              <h1 className="text-xl font-bold font-display uppercase tracking-wider text-stone-900">PT NUSANTARA MINERAL SUKSES ABADI</h1>
              <p className="text-[10px] text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
              <h2 className="text-sm font-semibold text-stone-850 mt-1">Laporan List Transaksi Pengeluaran Kas / Bank</h2>
            </div>
            <div className="text-right font-mono text-[10px] text-stone-500">
              <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <p>Filter: {monthFilter === 'All' ? 'Semua Bulan' : MONTHS_LIST.find(m => m.value === monthFilter)?.label} {yearFilter === 'All' ? 'Semua Tahun' : yearFilter}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="bg-stone-100 border-y-2 border-stone-900 font-bold text-stone-850">
                <th className="py-2 px-2 border border-stone-300 text-center w-10">No</th>
                <th className="py-2 px-2 border border-stone-300 w-22">Tanggal</th>
                <th className="py-2 px-2 border border-stone-300 w-28">No Voucher/Kode</th>
                <th className="py-2 px-2 border border-stone-300 w-24">Lokasi</th>
                <th className="py-2 px-2 border border-stone-300 w-32">Jenis Pengajuan</th>
                <th className="py-2 px-2 border border-stone-300 w-40">Penerima Kas</th>
                <th className="py-2 px-2 border border-stone-300 w-20 text-center">Metode</th>
                <th className="py-2 px-2 border border-stone-300 w-20 text-center">Status</th>
                <th className="py-2 px-2 border border-stone-300 w-28 text-right">Total Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((sub, idx) => {
                  const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                  const displayStatus = sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');
                  return (
                    <tr key={sub.id} className="align-top">
                      <td className="py-2 px-2 border border-stone-200 text-center font-mono">{idx + 1}</td>
                      <td className="py-2 px-2 border border-stone-200 whitespace-nowrap">{formatDateIndonesian(sub.tanggal)}</td>
                      <td className="py-2 px-2 border border-stone-200 font-mono font-bold">{sub.kode}</td>
                      <td className="py-2 px-2 border border-stone-200 font-bold">{sub.lokasi}</td>
                      <td className="py-2 px-2 border border-stone-200">{sub.jenisPengajuan}</td>
                      <td className="py-2 px-2 border border-stone-200 font-bold">{sub.dibayarkanKepada}</td>
                      <td className="py-2 px-2 border border-stone-200 text-center font-mono">{sub.dibayarkanDengan}</td>
                      <td className="py-2 px-2 border border-stone-200 text-center font-mono font-bold text-[9px]">{displayStatus}</td>
                      <td className="py-2 px-2 border border-stone-200 text-right font-mono font-bold font-black text-stone-900 whitespace-nowrap">
                        Rp {formatRupiah(subTotal)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400">Tidak ada data transaksi yang cocok dengan kriteria filter.</td>
                </tr>
              )}
              {/* Total Row */}
              <tr className="bg-stone-50 font-bold text-stone-955 border-t-2 border-stone-900">
                <td colSpan={8} className="py-2.5 px-2 text-right text-stone-850">SUM/TOTAL NILAI KELUAR:</td>
                <td className="py-2.5 px-2 text-right font-mono text-xs font-black text-stone-955 whitespace-nowrap">
                  Rp {formatRupiah(filteredSubmissions.reduce((sum, s) => sum + s.items.reduce((acc, i) => acc + i.total, 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Autograph / Tanda Tangan */}
          <div className="pt-12 grid grid-cols-3 gap-6 text-center text-[11px] leading-normal pb-8">
            <div className="space-y-12">
              <p className="font-semibold text-stone-600">Dibuat Oleh,</p>
              <div className="space-y-0.5">
                <p className="font-bold underline text-stone-900 uppercase">{userProfile?.name || 'Staff Finance'}</p>
                <p className="text-stone-400 text-[9px] font-mono">Keuangan / Kasir</p>
              </div>
            </div>
            <div className="space-y-12">
              <p className="font-semibold text-stone-600">Diperiksa Oleh,</p>
              <div className="space-y-0.5">
                <p className="font-bold underline text-stone-900 uppercase">ANDI DHIYA SALSABILA</p>
                <p className="text-stone-400 text-[9px] font-mono">Direktur Keuangan</p>
              </div>
            </div>
            <div className="space-y-12">
              <p className="font-semibold text-stone-600">Disahkan Oleh,</p>
              <div className="space-y-0.5">
                <p className="font-bold underline text-stone-900 uppercase">ANDI NURSYAM HALID</p>
                <p className="text-stone-400 text-[9px] font-mono">Direktur Utama</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
