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
const disableBot = process.env.DISABLE_TELEGRAM_BOT === 'true';
const appUrl = process.env.RENDER_EXTERNAL_URL; // Render provides this
let bot: Telegraf | null = null;

if (botToken && !disableBot) {
  bot = new Telegraf(botToken);
  
  bot.start((ctx) => {
    ctx.reply('Привет! Я бот DocDog. Я помогу тебе превратить твои изображения в PDF или объединить несколько файлов в один.\n\nПросто открой Mini App кнопкой ниже или пришли мне файлы прямо сюда!');
  });

  bot.on('document', async (ctx) => {
    ctx.reply('Получил файл. Пока я в режиме настройки, используй кнопку "Открыть DocDog" для обработки!');
  });

  // Handle errors
  bot.catch((err: any, ctx) => {
    console.error(`Tg Error for ${ctx.updateType}`, err);
  });

  const setupBot = async () => {
    try {
      // Remove any existing webhooks to avoid 409 Conflict
      await bot?.telegram.deleteWebhook();
      console.log('Previous Telegram webhook deleted');

      // Use Webhook instead of Polling to avoid 409 Conflict
      if (appUrl) {
        const secretPath = `/telegraf/${bot?.secretPathComponent()}`;
        app.use(bot!.webhookCallback(secretPath));
        
        await bot?.telegram.setWebhook(`${appUrl}${secretPath}`);
        console.log(`Telegram bot webhook set to: ${appUrl}${secretPath}`);
      } else {
        // Fallback to polling ONLY in development
        if (process.env.NODE_ENV !== 'production') {
          await bot?.launch();
          console.log('Telegram bot started via polling (Dev Mode)');
        } else {
          console.warn('Bot: RENDER_EXTERNAL_URL not found, webhook not set.');
        }
      }
    } catch (err: any) {
      if (err.response?.error_code === 409) {
        console.warn('Telegram Bot Conflict: Another instance is running (409).');
      } else {
        console.error('Failed to setup Telegram bot:', err);
      }
    }
  };

  setupBot();

  // Enable graceful stop
  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));
} else {
  if (disableBot) {
    console.log('Telegram bot disabled via DISABLE_TELEGRAM_BOT env var');
  } else {
    console.log('TELEGRAM_BOT_TOKEN not found, bot disabled');
  }
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
    const telegramUserId = req.body.telegramUserId;
    
    console.log(`Conversion request: toFormat=${toFormat}, mergeMode=${mergeMode}, tgId=${telegramUserId}`);

    if (toFormat === 'PDF') {
      const pdfDoc = await PDFDocument.create();

      for (const file of files) {
        if (file.mimetype.startsWith('image/')) {
          const imageBuffer = file.buffer;
          let image;
          
          try {
            if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
              image = await pdfDoc.embedJpg(imageBuffer);
            } else if (file.mimetype === 'image/png') {
              image = await pdfDoc.embedPng(imageBuffer);
            } else {
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
          } catch (err) {
            console.error(`Error embedding file ${file.originalname}:`, err);
          }
        } else if (file.mimetype === 'application/pdf') {
          try {
            const pdf = await PDFDocument.load(file.buffer);
            const copiedPages = await pdfDoc.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => pdfDoc.addPage(page));
          } catch (err) {
            console.error(`Error merging PDF ${file.originalname}:`, err);
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const buffer = Buffer.from(pdfBytes);
      const filename = req.body.filename || (mergeMode ? 'merged.pdf' : 'converted.pdf');

      if (telegramUserId && bot) {
        try {
          console.log(`CRITICAL: Attempting to send document to TG user ID: ${telegramUserId}`);
          await bot.telegram.sendDocument(telegramUserId, {
            source: buffer,
            filename: filename
          });
          console.log(`SUCCESS: Document sent to TG user ID: ${telegramUserId}`);
          return res.json({ success: true }); 
        } catch (tgError: any) {
          console.error(`CRITICAL TG ERROR for user ${telegramUserId}:`, tgError.message || tgError);
          return res.status(500).json({ success: false, error: tgError.message || 'Ошибка отправки в Telegram' });
        }
      }

      // If no telegramUserId, we assume it's a web browser request
      console.log('No telegramUserId, sending file directly for browser download');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
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
    console.log(`BOOT: Server started on port ${PORT}`);
    console.log(`BOOT: Env: ${process.env.NODE_ENV}`);
    console.log(`BOOT: BOT Token: ${process.env.TELEGRAM_BOT_TOKEN ? 'Present' : 'MISSING'}`);
    console.log(`BOOT: App URL: ${process.env.RENDER_EXTERNAL_URL || 'NONE (polling mode)'}`);
  });
}

startServer();
