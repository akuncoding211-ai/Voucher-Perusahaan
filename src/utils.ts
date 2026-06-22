// Utility functions for formatting and calculations
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface PdfInputSource {
  bytes: Uint8Array;
  type: string;
  name: string;
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const sanitizedPara = sanitizeString(para);
    const words = sanitizedPara.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (!word) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

export function sanitizeString(str: string | null | undefined): string {
  if (!str) return '';
  
  // 1. Map smart punctuation and other common symbols to standard ASCII equivalents
  const conversionMap: { [key: string]: string } = {
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '–': '-',
    '—': '-',
    '…': '...',
    '•': '*',
    '™': 'TM',
    '®': '(R)',
    '©': '(C)',
    '′': "'",
    '″': '"',
  };
  
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (conversionMap[char] !== undefined) {
      result += conversionMap[char];
    } else {
      result += char;
    }
  }
  
  // 2. Filter out anything that is not in the standard safe range of WinAnsi
  // Safe characters are from 32 to 126, and from 160 to 255.
  let cleanResult = '';
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      cleanResult += result[i];
    } else {
      // Replaces control characters or emojis with clean spacing
      if (code !== 10 && code !== 13 && code !== 9) {
        cleanResult += ' ';
      }
    }
  }
  
  return cleanResult;
}

export function cleanSingleLine(text: string | null | undefined): string {
  if (!text) return '';
  const flattened = text.replace(/[\r\n\t]+/g, ' ');
  return sanitizeString(flattened);
}

export async function generateF1PdfBytes(submission: any, grandTotal: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  
  // Draw Logo text
  page.drawText('PT. NUSANTARA MINERAL SUKSES ABADI', { x: 40, y: 795, size: 14, font: fontBold });
  page.drawText('VOUCHER SYSTEM PLATFORM', { x: 40, y: 780, size: 8, font: fontRegular });
  
  // Draw Code and Date Box top right
  page.drawRectangle({
    x: 370,
    y: 770,
    width: 185,
    height: 35,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(0.95, 0.95, 0.95)
  });
  page.drawText(cleanSingleLine(submission.kode), { x: 380, y: 782, size: 10, font: fontMono });
  page.drawText(`Tanggal : ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`, { x: 370, y: 755, size: 9, font: fontRegular });

  // Draw title in box
  page.drawRectangle({
    x: 40,
    y: 700,
    width: 515,
    height: 35,
    color: rgb(1, 1, 1),
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
  });
  page.drawText('BUKTI PENGELUARAN KAS / BANK', { x: 175, y: 712, size: 12, font: fontBold });

  // Draw metadata fields
  const yStart = 675;
  page.drawText('Dibayarkan Kepada  :   ' + cleanSingleLine(submission.dibayarkanKepada), { x: 45, y: yStart, size: 10, font: fontBold });
  
  page.drawText('Jenis Pengajuan       :   ' + cleanSingleLine(submission.jenisPengajuan), { x: 45, y: yStart - 18, size: 10, font: fontRegular });
  page.drawText('Kode                       :   ' + cleanSingleLine(submission.kode), { x: 45, y: yStart - 36, size: 10, font: fontMono });
  
  // Dibayarkan dengan
  page.drawText('Dibayarkan dengan   : ', { x: 45, y: yStart - 54, size: 10, font: fontRegular });
  
  // Draw Checkboxes
  page.drawRectangle({ x: 165, y: yStart - 56, width: 25, height: 12, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText(submission.dibayarkanDengan === 'Tunai' ? 'X' : '', { x: 174, y: yStart - 53, size: 9, font: fontBold });
  page.drawText('Tunai', { x: 195, y: yStart - 54, size: 9, font: fontRegular });
  
  page.drawRectangle({ x: 235, y: yStart - 56, width: 25, height: 12, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText(submission.dibayarkanDengan === 'Cek/Transfer' ? 'X' : '', { x: 244, y: yStart - 53, size: 9, font: fontBold });
  page.drawText('Cek / Transfer', { x: 265, y: yStart - 54, size: 9, font: fontRegular });

  // Draw table
  page.drawRectangle({
    x: 40,
    y: 530,
    width: 515,
    height: 25,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(1,1,1)
  });
  page.drawText('JENIS PENGAJUAN', { x: 50, y: 539, size: 9, font: fontBold });
  page.drawText('JUMLAH', { x: 490, y: 539, size: 9, font: fontBold });

  let curY = 530;
  const items = submission.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemTextWrapped = wrapText(item.item || '', 350, fontRegular, 9);
    const rowHeight = itemTextWrapped.length * 14 + 15;
    
    page.drawRectangle({
      x: 40,
      y: curY - rowHeight,
      width: 515,
      height: rowHeight,
      borderColor: rgb(0,0,0),
      borderWidth: 1,
    });
    // col check line
    page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - rowHeight }, thickness: 1 });

    for (let l = 0; l < itemTextWrapped.length; l++) {
      page.drawText(itemTextWrapped[l], { x: 50, y: curY - 15 - (l * 12), size: 9, font: fontBold });
    }
    
    page.drawText('Rp ' + formatRupiah(item.total), { x: 400, y: curY - 15, size: 10, font: fontBold });
    curY -= rowHeight;
  }

  // Draw total row
  page.drawRectangle({
    x: 40,
    y: curY - 25,
    width: 515,
    height: 25,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(0.98,0.98,0.98)
  });
  page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - 25 }, thickness: 1.5 });
  page.drawText('Total', { x: 50, y: curY - 17, size: 10, font: fontBold });
  page.drawText('Rp ' + formatRupiah(grandTotal), { x: 400, y: curY - 17, size: 10, font: fontBold });
  curY -= 25;

  // Draw Terbilang
  page.drawRectangle({
    x: 40,
    y: curY - 45,
    width: 515,
    height: 35,
    borderColor: rgb(0,0,0),
    borderWidth: 1,
    color: rgb(0.98,0.98,0.98)
  });
  page.drawText('Terbilang :', { x: 48, y: curY - 25, size: 9, font: fontBold });
  const wrappedTerbilang = wrapText('"' + numberToTerbilang(grandTotal) + '"', 420, fontRegular, 9);
  for (let l = 0; l < Math.min(wrappedTerbilang.length, 2); l++) {
    page.drawText(wrappedTerbilang[l], { x: 110, y: curY - 15 - (l * 11), size: 9, font: fontRegular });
  }
  curY -= 45;

  // Draw columns signature table block
  const sigTableY = curY - 95;
  page.drawRectangle({
    x: 40,
    y: sigTableY,
    width: 515,
    height: 80,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
  });
  
  // Column dividers
  const blockW = 515 / 4;
  page.drawLine({ start: { x: 40 + blockW, y: curY - 15 }, end: { x: 40 + blockW, y: sigTableY }, thickness: 1 });
  page.drawLine({ start: { x: 40 + blockW * 2, y: curY - 15 }, end: { x: 40 + blockW * 2, y: sigTableY }, thickness: 1 });
  page.drawLine({ start: { x: 40 + blockW * 3, y: curY - 15 }, end: { x: 40 + blockW * 3, y: sigTableY }, thickness: 1 });

  // Table header box background
  page.drawRectangle({
    x: 40,
    y: curY - 15,
    width: 515,
    height: 15,
    color: rgb(0.95,0.95,0.95),
    borderColor: rgb(0,0,0),
    borderWidth: 1
  });
  
  page.drawText('Diverifikasi', { x: 40 + 25, y: curY - 11, size: 8, font: fontBold });
  page.drawText('Disetujui', { x: 40 + blockW + 35, y: curY - 11, size: 8, font: fontBold });
  page.drawText('Disetujui', { x: 40 + blockW * 2 + 35, y: curY - 11, size: 8, font: fontBold });
  page.drawText('Dibukukan', { x: 40 + blockW * 3 + 30, y: curY - 11, size: 8, font: fontBold });

  // Signature names
  page.drawText(cleanSingleLine(submission.diverifikasiOleh), { x: 45, y: sigTableY + 15, size: 8, font: fontBold });
  page.drawText(cleanSingleLine(submission.diverifikasiJabatan), { x: 45, y: sigTableY + 5, size: 7, font: fontRegular });

  page.drawText(cleanSingleLine(submission.disetujuiOleh), { x: 45 + blockW, y: sigTableY + 15, size: 8, font: fontBold });
  page.drawText('Dir Keuangan', { x: 45 + blockW, y: sigTableY + 5, size: 7, font: fontRegular });

  page.drawText(cleanSingleLine(submission.disetujuiOleh2), { x: 45 + blockW * 2, y: sigTableY + 15, size: 8, font: fontBold });
  page.drawText(cleanSingleLine(submission.disetujuiJabatan2 || 'DIREKTUR'), { x: 45 + blockW * 2, y: sigTableY + 5, size: 7, font: fontRegular });

  page.drawText(cleanSingleLine(submission.dibukukanOleh), { x: 45 + blockW * 3, y: sigTableY + 15, size: 8, font: fontBold });
  page.drawText(cleanSingleLine(submission.dibukukanJabatan), { x: 45 + blockW * 3, y: sigTableY + 5, size: 7, font: fontRegular });

  return await pdfDoc.save();
}

export async function generateF2PdfBytes(submission: any, grandTotal: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  
  // Draw Logo text
  page.drawText('PT. NUSANTARA MINERAL SUKSES ABADI', { x: 40, y: 795, size: 14, font: fontBold });
  page.drawText('VOUCHER SYSTEM PLATFORM', { x: 40, y: 780, size: 8, font: fontRegular });
  
  // Draw title in box
  page.drawRectangle({
    x: 40,
    y: 720,
    width: 515,
    height: 35,
    color: rgb(0.85, 0.85, 0.85),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5,
  });
  page.drawText('FORMULIR PENGAJUAN HO', { x: 195, y: 732, size: 12, font: fontBold });

  // Draw metadata box
  page.drawRectangle({
    x: 40,
    y: 620,
    width: 515,
    height: 80,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5,
  });
  
  const txtLokasi = `Lokasi                      :  ${cleanSingleLine(submission.lokasi)}`;
  const txtTanggal = `Tanggal                    :  ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`;
  const txtJenis = `Jenis Pengajuan       :  ${cleanSingleLine(submission.jenisPengajuan)}`;
  const txtKode = `Kode                       :  ${cleanSingleLine(submission.kode)}`;
  
  page.drawText(txtLokasi, { x: 55, y: 680, size: 10, font: fontRegular });
  page.drawText(txtTanggal, { x: 55, y: 663, size: 10, font: fontRegular });
  page.drawText(txtJenis, { x: 55, y: 646, size: 10, font: fontRegular });
  page.drawText(txtKode, { x: 55, y: 629, size: 10, font: fontMono });

  // Draw Table header
  page.drawRectangle({
    x: 40,
    y: 575,
    width: 515,
    height: 25,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0,0,0),
    borderWidth: 1,
  });
  
  page.drawText('NO', { x: 45, y: 583, size: 8, font: fontBold });
  page.drawText('ITEM DETIL (INVOICE / DESKRIPSI)', { x: 75, y: 583, size: 8, font: fontBold });
  page.drawText('VOL', { x: 325, y: 583, size: 8, font: fontBold });
  page.drawText('TOTAL (RP)', { x: 400, y: 583, size: 8, font: fontBold });
  page.drawText('KETERANGAN', { x: 475, y: 583, size: 8, font: fontBold });

  let curY = 575;
  const items = submission.items || [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const descWrapped = wrapText(item.item || '', 240, fontRegular, 8);
    const ketWrapped = wrapText(item.keterangan || '-', 70, fontRegular, 8);
    const rowHeight = Math.max(descWrapped.length, ketWrapped.length, 1) * 12 + 10;
    
    // Draw row rectangle
    page.drawRectangle({
      x: 40,
      y: curY - rowHeight,
      width: 515,
      height: rowHeight,
      borderColor: rgb(0,0,0),
      borderWidth: 1,
    });
    
    // Draw columns vertical separation borders
    page.drawLine({ start: { x: 65, y: curY }, end: { x: 65, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 320, y: curY }, end: { x: 320, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 470, y: curY }, end: { x: 470, y: curY - rowHeight }, thickness: 1 });

    // Fill row texts
    page.drawText(String(i + 1), { x: 48, y: curY - 15, size: 8, font: fontMono });
    
    for (let dLine = 0; dLine < descWrapped.length; dLine++) {
      page.drawText(descWrapped[dLine], { x: 75, y: curY - 15 - (dLine * 11), size: 8, font: fontBold });
    }
    
    page.drawText(cleanSingleLine(item.jumlahVolume || '-'), { x: 325, y: curY - 15, size: 8, font: fontRegular });
    page.drawText(formatRupiah(item.total), { x: 395, y: curY - 15, size: 8, font: fontBold });
    
    for (let kLine = 0; kLine < ketWrapped.length; kLine++) {
      page.drawText(ketWrapped[kLine], { x: 475, y: curY - 15 - (kLine * 11), size: 8, font: fontRegular });
    }
    
    curY -= rowHeight;
  }
  
  // Total Row
  page.drawRectangle({
    x: 40,
    y: curY - 25,
    width: 515,
    height: 25,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
  });
  page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - 25 }, thickness: 1.5 });
  page.drawText('TOTAL PENYERAHAN', { x: 150, y: curY - 17, size: 9, font: fontBold });
  page.drawText(formatRupiah(grandTotal), { x: 395, y: curY - 17, size: 9, font: fontBold });
  
  curY -= 25;
  
  // Signatures
  const sigY = curY - 80;
  page.drawText('Dibuat Oleh', { x: 90, y: curY - 30, size: 10, font: fontRegular });
  page.drawText(cleanSingleLine(submission.dibuatOleh), { x: 70, y: sigY, size: 10, font: fontBold });
  page.drawLine({ start: { x: 60, y: sigY - 2 }, end: { x: 200, y: sigY - 2 }, thickness: 1 });
  
  page.drawText('Disetujui', { x: 410, y: curY - 30, size: 10, font: fontRegular });
  page.drawText(cleanSingleLine(submission.disetujuiOleh), { x: 390, y: sigY, size: 10, font: fontBold });
  page.drawLine({ start: { x: 370, y: sigY - 2 }, end: { x: 500, y: sigY - 2 }, thickness: 1 });
  
  // Notes block
  curY = sigY - 50;
  page.drawText('NOTE :', { x: 40, y: curY, size: 9, font: fontBold });
  page.drawRectangle({
    x: 40,
    y: curY - 50,
    width: 515,
    height: 40,
    borderColor: rgb(0,0,0),
    borderWidth: 1,
  });
  const wrappedNotes = wrapText(submission.notes || 'Tidak ada catatan tambahan.', 550, fontRegular, 8);
  for (let nLine = 0; nLine < Math.min(wrappedNotes.length, 3); nLine++) {
    page.drawText(wrappedNotes[nLine], { x: 45, y: curY - 14 - (nLine * 11), size: 8, font: fontRegular });
  }
  
  return await pdfDoc.save();
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatDateIndonesian(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const day = date.getDate().toString().padStart(2, '0');
  const month = INDONESIAN_MONTHS[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

export function numberToTerbilang(angka: number): string {
  const nominal = Math.floor(Math.abs(angka));
  if (nominal === 0) return 'Nol Rupiah';
  
  const prefix = angka < 0 ? 'Minus ' : '';
  const hasil = terbilangHelper(nominal).replace(/\s+/g, ' ').trim();
  return hasil ? prefix + hasil + ' Rupiah' : 'Nol Rupiah';
}

function terbilangHelper(nominal: number): string {
  const huruf = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];
  
  if (nominal < 12) {
    return ' ' + huruf[nominal];
  } else if (nominal < 20) {
    return terbilangHelper(nominal - 10) + ' Belas';
  } else if (nominal < 100) {
    return terbilangHelper(Math.floor(nominal / 10)) + ' Puluh' + terbilangHelper(nominal % 10);
  } else if (nominal < 200) {
    return ' Seratus' + terbilangHelper(nominal - 100);
  } else if (nominal < 1000) {
    return terbilangHelper(Math.floor(nominal / 100)) + ' Ratus' + terbilangHelper(nominal % 100);
  } else if (nominal < 2000) {
    return ' Seribu' + terbilangHelper(nominal - 1000);
  } else if (nominal < 1000000) {
    return terbilangHelper(Math.floor(nominal / 1000)) + ' Ribu' + terbilangHelper(nominal % 1000);
  } else if (nominal < 1000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000)) + ' Juta' + terbilangHelper(nominal % 1000000);
  } else if (nominal < 1000000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000000)) + ' Milyar' + terbilangHelper(nominal % 1000000000);
  } else if (nominal < 1000000000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000000000)) + ' Triliun' + terbilangHelper(nominal % 1000000000000);
  }
  return '';
}

export async function compressImage(
  imageBytes: Uint8Array,
  mimeType: string,
  maxWidthOrHeight: number = 1000,
  quality: number = 0.70
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  // If it's not a common web image, return unchanged
  if (!mimeType.startsWith('image/') || mimeType.includes('gif')) {
    return { bytes: imageBytes, mimeType };
  }

  return new Promise((resolve) => {
    try {
      const blob = new Blob([imageBytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Calculate new dimensions preserving aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
          if (width > height) {
            height = Math.round((height * maxWidthOrHeight) / width);
            width = maxWidthOrHeight;
          } else {
            width = Math.round((width * maxWidthOrHeight) / height);
            height = maxWidthOrHeight;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          console.warn('Could not get 2D context for canvas compression');
          resolve({ bytes: imageBytes, mimeType });
          return;
        }
        
        // Fill white background (useful for transparent PNG conversion to JPG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to highly compact JPEG format
        const outputMime = 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, quality);
        const base64Str = dataUrl.split(',')[1];
        const binaryStr = window.atob(base64Str);
        const outBytes = new Uint8Array(binaryStr.length);
        
        for (let i = 0; i < binaryStr.length; i++) {
          outBytes[i] = binaryStr.charCodeAt(i);
        }
        
        console.log(`[Image Compression] Standardised & compressed image: ${(imageBytes.length / 1024).toFixed(1)} KB -> ${(outBytes.length / 1024).toFixed(1)} KB`);
        resolve({ bytes: outBytes, mimeType: outputMime });
      };
      
      img.onerror = (err) => {
        console.warn('Failed to load image for compression fallback:', err);
        URL.revokeObjectURL(url);
        resolve({ bytes: imageBytes, mimeType });
      };
      
      img.src = url;
    } catch (e) {
      console.warn('Error during image compress execution:', e);
      resolve({ bytes: imageBytes, mimeType });
    }
  });
}

export async function convertImageToPdf(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  // Perform automatic compression and standardization
  let processedBytes = imageBytes;
  let processedMime = mimeType;
  try {
    const compressed = await compressImage(imageBytes, mimeType, 1200, 0.7);
    processedBytes = compressed.bytes;
    processedMime = compressed.mimeType;
  } catch (err) {
    console.warn('Failed image compression step inside pdf converter:', err);
  }

  const pdfDoc = await PDFDocument.create();
  let image;
  try {
    if (processedMime === 'image/png' || processedMime.includes('png')) {
      image = await pdfDoc.embedPng(processedBytes);
    } else {
      image = await pdfDoc.embedJpg(processedBytes);
    }
  } catch (err) {
    console.warn('Failed to embed image in PDF directly, attempting to embed as JPEG anyway:', err);
    try {
      image = await pdfDoc.embedJpg(processedBytes);
    } catch (e2) {
      throw new Error('Format gambar tidak didukung atau rusak.');
    }
  }

  // Get image dimensions
  const dims = image.scale(1);
  
  // Standard A4 dimensions in points: 595.27 x 841.89
  const a4Width = 595.27;
  const a4Height = 841.89;
  
  // Create page with A4 dimensions
  const page = pdfDoc.addPage([a4Width, a4Height]);
  
  // Calculate scaling factor to fit image on page with some margins (e.g. 20pt)
  const margin = 20;
  const maxWidth = a4Width - (margin * 2);
  const maxHeight = a4Height - (margin * 2);
  
  let scale = 1;
  if (dims.width > maxWidth || dims.height > maxHeight) {
    const scaleX = maxWidth / dims.width;
    const scaleY = maxHeight / dims.height;
    scale = Math.min(scaleX, scaleY);
  }
  
  const width = dims.width * scale;
  const height = dims.height * scale;
  
  // Center image on the page
  const x = (a4Width - width) / 2;
  const y = (a4Height - height) / 2;
  
  page.drawImage(image, {
    x,
    y,
    width,
    height,
  });
  
  return await pdfDoc.save();
}
