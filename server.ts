import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { PDFDocument } from 'pdf-lib';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Telegram Bot Setup
const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot: Telegraf | null = null;

if (botToken) {
  bot = new Telegraf(botToken);
  
  bot.start((ctx) => {
    ctx.reply('Привет! Я бот для работы с PDF. Пришли мне файл, и я помогу его обработать.');
  });

  bot.on('document', async (ctx) => {
    ctx.reply('Получил файл. Пока я в режиме настройки, скоро научусь его обрабатывать!');
  });

  bot.launch().then(() => {
    console.log('Telegram bot started');
  }).catch(err => {
    console.error('Error starting Telegram bot:', err);
  });
} else {
  console.log('TELEGRAM_BOT_TOKEN not found, bot disabled');
}

// Multer setup for file uploads (in-memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// API Routes
app.post('/api/convert', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const toFormat = (req.body.toFormat || 'PDF').toUpperCase();
    const mergeMode = req.body.mergeMode === 'true';
    
    if (toFormat === 'PDF') {
      const pdfDoc = await PDFDocument.create();

      for (const file of files) {
        if (file.mimetype.startsWith('image/')) {
          // Convert image to PDF page
          const imageBuffer = file.buffer;
          let image;
          
          if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBuffer);
          } else if (file.mimetype === 'image/png') {
            image = await pdfDoc.embedPng(imageBuffer);
          } else {
            // Convert other formats to PNG first using sharp
            const pngBuffer = await sharp(imageBuffer).png().toBuffer();
            image = await pdfDoc.embedPng(pngBuffer);
          }

          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        } else if (file.mimetype === 'application/pdf') {
          // Merge existing PDF
          const pdf = await PDFDocument.load(file.buffer);
          const copiedPages = await pdfDoc.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => pdfDoc.addPage(page));
        }
      }

      const pdfBytes = await pdfDoc.save();
      const buffer = Buffer.from(pdfBytes);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="converted.pdf"`);
      res.send(buffer);
    } else {
      // Basic fallback for other formats - if single file, just return "converted"
      // In a real app we'd do more, but for now let's handle the PDF use case which is the most common
      res.status(400).json({ error: `Conversion to ${toFormat} is not fully implemented yet` });
    }
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Internal server error during conversion' });
  }
});

app.post('/api/compress', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, originalname, mimetype } = file;

    // Check if it's an image we can compress
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only images are supported for compression right now' });
    }

    // Compression logic using Sharp
    let compressedBuffer: Buffer;
    const format = mimetype.split('/')[1];

    if (format === 'jpeg' || format === 'jpg') {
      compressedBuffer = await sharp(buffer).jpeg({ quality: 80, optimizeScans: true }).toBuffer();
    } else if (format === 'png') {
      compressedBuffer = await sharp(buffer).png({ quality: 80, compressionLevel: 9 }).toBuffer();
    } else if (format === 'webp') {
      compressedBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
    } else {
      // Fallback for other images
      compressedBuffer = await sharp(buffer).toBuffer();
    }

    // Setting headers to download the file
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="compressed_${originalname}"`);
    res.setHeader('X-Original-Size', buffer.length.toString());
    res.setHeader('X-Compressed-Size', compressedBuffer.length.toString());
    
    res.send(compressedBuffer);
  } catch (error) {
    console.error('Compression error:', error);
    res.status(500).json({ error: 'Internal server error during compression' });
  }
});

app.post('/api/merge-pdf', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const metadataStr = req.body.metadata;
    let metadata: any = null;
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.error('Metadata parse error:', e);
      }
    }

    const mergedPdf = await PDFDocument.create();

    if (metadata) {
      if (metadata.title) mergedPdf.setTitle(metadata.title);
      if (metadata.author) mergedPdf.setAuthor(metadata.author);
      if (metadata.subject) mergedPdf.setSubject(metadata.subject);
      mergedPdf.setProducer('AI Converter Pro');
      mergedPdf.setCreator('AI Converter Pro');
    }

    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        continue;
      }
      const pdf = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    const buffer = Buffer.from(mergedPdfBytes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.send(buffer);
  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ error: 'Internal server error during PDF merging' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
