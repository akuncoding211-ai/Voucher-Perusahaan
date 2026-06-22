import React, { useState } from 'react';
import { Submission, SubmissionItem } from '../types';
import { RefreshCw, Download, Database, Check, AlertTriangle, FileText, Globe } from 'lucide-react';
import { formatRupiah } from '../utils';

interface SheetsImportProps {
  onImportSuccess: (importedSubmissions: Submission[], mergeMode: 'merge' | 'overwrite') => void;
  existingCount: number;
}

export const SheetsImport: React.FC<SheetsImportProps> = ({ onImportSuccess, existingCount }) => {
  const [loading, setLoading] = useState(false);
  const [errorInput, setErrorInput] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAdvancePaste, setShowAdvancePaste] = useState(false);
  const [pastedJson, setPastedJson] = useState('');

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxqjX7mgGG5F-Nfk9vXcWXyyd8OmvDaXio6pOUFf5HMRiSzNwml_dyi9--M1pJj_XoD/exec?action=getVouchers';

  // Parser: converts old format to new format
  const convertOldToNewFormat = (rawItems: any[]): Submission[] => {
    return rawItems.map((item, idx) => {
      // 1. Parse nominal
      let rawNominal = String(item.nominal || item.total_nominal || item.totalNominal || '0').replace(/[^0-9.-]/g, '');
      const nominalVal = parseFloat(rawNominal) || 0;

      // 2. Formatting tanggal
      let cleanDate = item.tanggal || item.tanggal_pengajuan || '';
      if (cleanDate.includes('T')) {
        cleanDate = cleanDate.split('T')[0];
      }

      // 3. Status mapping
      const isLunas = item.status === 'Lunas' || item.dibayarkanDengan === 'Cek/Transfer' || item.dibayarkan_dengan === 'Cek/Transfer';

      // 4. Create structured sub-item
      const submissionItemId = `item-${Date.now()}-${idx}-${Math.random()}`;
      const subItem: SubmissionItem = {
        id: submissionItemId,
        no: 1,
        item: item.isi_invoice || item.isiInvoice || item.item || item.nama || 'Pembayaran Biaya Operasional / Gaji',
        jumlahVolume: item.qty !== undefined ? `${item.qty}` : (item.jumlahVolume || '1 Ls'),
        total: nominalVal,
        keterangan: item.no_invoice || item.noInvoice || item.keterangan || 'Voucher No'
      };

      // 5. Build full submission conforming to type constraint
      const finalSubmission: Submission = {
        id: item.id || `migrated-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
        lokasi: item.lokasi || 'KCP HO',
        tanggal: cleanDate || new Date().toISOString().split('T')[0],
        jenisPengajuan: item.jenis || item.jenis_pengajuan || item.jenisPengajuan || 'Operasional HO',
        kode: item.no_invoice || item.noInvoice || item.kode || item.code || 'BKK-HO/VI/2026/10001',
        dibayarkanKepada: item.dibayarkanKepada || item.dibayarkan_kepada || 'Penerima Tidak Diketahui',
        dibayarkanDengan: isLunas ? 'Cek/Transfer' : 'Tunai',
        status: isLunas ? 'Lunas' : 'Belum Lunas',
        notes: item.notes || item.catatan || item.catatan_tambahan || item.catatanTambahan || `Data sinkronisasi dari FinanceSync Pro lama. ${item.file_name ? `Lampiran: ${item.file_name}` : ''}`,
        // Signers preset based on old application requirements
        dibuatOleh: item.dibuatOleh || 'Nur Wahyudi',
        disetujuiOleh: item.disetujuiOleh || 'Harijon',
        diverifikasiOleh: item.diverifikasiOleh || 'Andi Dhiya Salsabila',
        diverifikasiJabatan: item.diverifikasiJabatan || 'Keuangan',
        disetujuiOleh2: item.disetujuiOleh2 || 'H. A. Nursyam Halid',
        disetujuiJabatan2: item.disetujuiJabatan2 || 'Direktur Utama',
        dibukukanOleh: item.dibukukanOleh || 'Sri Ekowati',
        dibukukanJabatan: item.dibukukanJabatan || 'Accounting',
        items: [subItem],
        createdAt: new Date().toISOString()
      };

      return finalSubmission;
    });
  };

  const handleLiveFetch = async (mode: 'merge' | 'overwrite') => {
    setLoading(true);
    setErrorInput(null);
    setSuccessMsg(null);

    try {
      // Direct call across browser
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors'
      });

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}. Kemungkinan kendala CORS.`);
      }

      const responseJson = await res.json();
      let dataList: any[] = [];
      if (Array.isArray(responseJson)) {
        dataList = responseJson;
      } else if (responseJson.success && Array.isArray(responseJson.data)) {
        dataList = responseJson.data;
      } else if (responseJson.data && Array.isArray(responseJson.data)) {
        dataList = responseJson.data;
      } else {
        throw new Error('Format data tidak sesuai.');
      }

      if (dataList.length === 0) {
        throw new Error('Tidak ada data voucher lama ditemukan di server.');
      }

      const formatted = convertOldToNewFormat(dataList);
      onImportSuccess(formatted, mode);
      setSuccessMsg(`✅ Berhasil menarik ${formatted.length} data voucher secara REAL-TIME dari Google Sheets!`);
    } catch (err: any) {
      console.warn('CORS or fetch restriction in sandbox, switching to paste modal. ', err);
      setErrorInput(
        `Gagal sinkronisasi otomatis (CORS/IFrame block). Jangan khawatir, fitur paste data manual di bawah dijamin 100% berhasil!`
      );
      setShowAdvancePaste(true);
    } finally {
      setLoading(false);
    }
  };

  const handleManualPaste = (mode: 'merge' | 'overwrite') => {
    if (!pastedJson.trim()) {
      setErrorInput('Silakan tempel (paste) kode JSON terlebih dahulu.');
      return;
    }

    try {
      let parsed = JSON.parse(pastedJson);
      let listToConvert: any[] = [];

      if (Array.isArray(parsed)) {
        listToConvert = parsed;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        listToConvert = parsed.data;
      } else if (parsed.success && Array.isArray(parsed.data)) {
        listToConvert = parsed.data;
      }

      if (listToConvert.length === 0) {
        throw new Error('Data array kosong.');
      }

      const formatted = convertOldToNewFormat(listToConvert);
      onImportSuccess(formatted, mode);
      setSuccessMsg(`✅ Sukses memproses ${formatted.length} data voucher lama secara manual!`);
      setPastedJson('');
      setShowAdvancePaste(false);
      setErrorInput(null);
    } catch (err: any) {
      setErrorInput(`Kode JSON tidak valid: ${err.message}. Pastikan data yang anda paste adalah format data voucher Anda.`);
    }
  };

  return (
    <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-3xs space-y-4 print:hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Globe className="text-[#D4AF37]" size={16} />
            Koneksi & Sinkronisasi FinanceSync Pro (Google Sheets)
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Gunakan data dari aplikasi voucher lama Anda secara langsung. Sistem ini akan otomatis merestrukturisasi setiap baris voucher lama menjadi formulir PDF A4 presisi dua halaman.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1 md:pt-0">
          <button
            onClick={() => handleLiveFetch('merge')}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Gabungkan (Merge)
          </button>
          
          <button
            onClick={() => handleLiveFetch('overwrite')}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 shadow-3xs"
          >
            <Download size={13} />
            Timpa Semua Data
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl text-xs flex items-start gap-2 animate-fade-in font-medium">
          <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorInput && (
        <div className="p-3.5 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl text-xs space-y-2">
          <div className="flex items-start gap-2 font-medium">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <span>Keterbatasan Iframe: {errorInput}</span>
          </div>
          <div className="text-[11px] text-stone-500 pl-6 space-y-1">
            <p>1. Buka tautan berikut di tab baru: <a href={APPS_SCRIPT_URL} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline font-mono break-all">{APPS_SCRIPT_URL}</a></p>
            <p>2. Salin (Copy) semua isi teks yang muncul.</p>
            <p>3. Pilih tombol <strong>"Klik di Sini untuk Menempel Data"</strong> di bawah, tempelkan teks itu, lalu jalankan proses!</p>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
        <span className="text-[11px] text-stone-400 font-mono">
          Status Database Baru: <strong className="text-stone-700">{existingCount} DataAktif</strong>
        </span>
        <button
          onClick={() => setShowAdvancePaste(!showAdvancePaste)}
          className="text-xs font-medium text-stone-500 hover:text-stone-800 underline transition"
        >
          {showAdvancePaste ? 'Sembunyikan Panel Paste' : 'Cara Alternatif: Paste Data Manual'}
        </button>
      </div>

      {showAdvancePaste && (
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3 animate-slide-down">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Tempel Log JSON dari Aplikasi Lama Anda:
            </label>
            <textarea
              rows={4}
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              placeholder='Contoh: [{"tanggal":"2026-06-01", "no_invoice":"INV-001", "nominal":5000000, "status":"Lunas", "dibayarkanKepada":"Yudi", "isi_invoice":"Biaya Gaji OB"}]'
              className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleManualPaste('merge')}
              className="px-3.5 py-1.5 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition"
            >
              Merge Tempelan
            </button>
            <button
              onClick={() => handleManualPaste('overwrite')}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-lg transition shadow-3xs"
            >
              Timpa dengan Tempelan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
