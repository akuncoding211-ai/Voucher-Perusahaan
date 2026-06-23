import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set higher body limits to handle large image or PDF uploads in base64 format
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Google Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// AI Parse Receipt Endpoint
app.post("/api/gemini/parse-receipt", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType representation." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY tidak dikonfigurasi di server. Silakan hubungi admin atau periksa halaman Secrets." 
      });
    }

    // Clean base64 header if included
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");

    const documentPart = {
      inlineData: {
        mimeType: mimeType,
        data: cleanBase64,
      },
    };

    const promptText = `
Anda adalah sistem AI ekstraksi dokumen keuangan profesional. Tugas Anda adalah memindai/ekstrak data dari struk kwitansi digital, slip gaji, surat tagihan/invoice, atau berkas mutasi/slip transaksi (format PDF atau gambar).

Ekstrak informasi berikut dengan presisi tinggi:
1. tanggal: Cari tanggal transaksi dalam format YYYY-MM-DD. Jika tidak ditemukan, gunakan tanggal hari ini.
2. deskripsi/penerima: Cari nama merchant, vendor, penerima dana, atau keterangan singkat tujuan transaksi.
3. keterangan: Ringkasan singkat dokumen.
4. nominal: Nilai total nominal/amount dari struk/kwitansi (biasanya nilai grand total).
5. debit: Jika ini bukti penerimaan atau pengeluaran kas dengan pembukuan, cari saldo debit jika ada.
6. kredit: Cari nilai kredit jika ada.
7. saldo: Sisa saldo akun jika tercatat pada dokumen kwitansi/mutasi tersebut.
8. items: Daftar rincian barang/jasa atau item transaksi yang tertera. Untuk setiap item, ekstrak:
   - item (deskripsi barang/jasa/transaksi)
   - jumlahVolume (misal: "2 Pcs", "1 Ls", "3 Unit", jika tidak ada beri "1 Ls")
   - total (nominal per item tersebut)
   - keterangan (catatan/spesifikasi detail per item jika ada)
   - debit (nilai debit jika per item)
   - kredit (nilai kredit jika per item)
   - saldo (nilai saldo setelah baris item ini jika tertera)

PENTING: Seluruh nominal uang harus diekstrak sebagai angka (number) tanpa titik ribuan atau simbol mata uang.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        documentPart,
        { text: promptText }
      ],
      config: {
        systemInstruction: "Anda adalah analis keuangan handal yang mengembalikan response dalam format JSON yang valid dan selalu sesuai dengan schema yang ditentukan.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tanggal: { type: Type.STRING, description: "Tanggal transaksi dalam format YYYY-MM-DD" },
            deskripsi: { type: Type.STRING, description: "Nama penjual, merchant, vendor, atau deskripsi ringkas" },
            keterangan: { type: Type.STRING, description: "Penjelasan umum mengenai transaksi/kwitansi ini" },
            nominal: { type: Type.NUMBER, description: "Total grand nominal pengeluaran/pemasukan" },
            debit: { type: Type.NUMBER, description: "Nilai debit (opsional)" },
            kredit: { type: Type.NUMBER, description: "Nilai kredit (opsional)" },
            saldo: { type: Type.NUMBER, description: "Nilai saldo akhir yang tercatat (opsional)" },
            items: {
              type: Type.ARRAY,
              description: "Rincian baris item transaksi",
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: "Nama atau deskripsi item" },
                  jumlahVolume: { type: Type.STRING, description: "Jumlah/volume qty (misal: '2 Box', '1 Ls')" },
                  total: { type: Type.NUMBER, description: "Nominal uang total item" },
                  keterangan: { type: Type.STRING, description: "Spesifikasi tambahan atau detail item" },
                  debit: { type: Type.NUMBER, description: "Debit per item (opsional)" },
                  kredit: { type: Type.NUMBER, description: "Kredit per item (opsional)" },
                  saldo: { type: Type.NUMBER, description: "Saldo setelah item ini (opsional)" }
                },
                required: ["item", "total", "jumlahVolume"]
              }
            }
          },
          required: ["tanggal", "deskripsi", "keterangan", "nominal", "items"]
        },
        temperature: 0.1,
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    return res.json({ success: true, result: parsedData });

  } catch (error: any) {
    console.error("Error parsing receipt using Gemini API:", error);
    return res.status(500).json({ 
      error: "Gagal memproses kwitansi menggunakan AI. Periksa kembali kualitas dokumen atau berkas Anda.",
      details: error.message 
    });
  }
});

// Setup Vite Development Server or Serve static production bundle
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend files in production
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

bootstrap();
