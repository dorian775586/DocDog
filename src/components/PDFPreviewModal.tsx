import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, RotateCw } from 'lucide-react';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFPreviewModalProps {
  file: File;
  onClose: () => void;
}

const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({ file, onClose }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [fileUrl, setFileUrl] = useState<string>('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const rotatePage = () => {
    setRotations(prev => ({
      ...prev,
      [pageNumber]: ((prev[pageNumber] || 0) + 90) % 360
    }));
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-5xl h-full bg-brand-slate border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-xl bg-white/5">
              <ZoomIn size={18} className="text-white/40" />
            </div>
            <div>
              <h3 className="text-sm font-bold truncate max-w-[200px]">{file.name}</h3>
              <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Просмотр документа</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/5 rounded-2xl p-1 shrink-0">
              <button 
                onClick={() => setScale(prev => Math.max(0.5, prev - 0.1))}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-[10px] font-bold w-12 text-center text-white/60">
                {Math.round(scale * 100)}%
              </span>
              <button 
                onClick={() => setScale(prev => Math.min(2, prev + 0.1))}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
              >
                <ZoomIn size={16} />
              </button>
            </div>

            <button 
              onClick={rotatePage}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"
              title="Повернуть страницу (90°)"
            >
              <RotateCw size={18} className="transition-transform active:rotate-90" />
            </button>

            <button 
              onClick={onClose}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Viewer Area */}
        <div className="flex-1 overflow-auto p-8 flex justify-center bg-black/20 custom-scrollbar">
          {fileUrl && (
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex flex-col items-center gap-4 mt-20">
                  <Loader2 className="animate-spin text-brand-primary" size={32} />
                  <p className="text-xs font-bold text-white/20 uppercase tracking-widest">Загрузка...</p>
                </div>
              }
            >
              <div className="shadow-2xl shadow-black/50">
                <Page 
                  pageNumber={pageNumber} 
                  scale={scale} 
                  rotate={rotations[pageNumber] || 0}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="rounded-lg overflow-hidden transition-transform duration-300"
                />
              </div>
            </Document>
          )}
        </div>

        {/* Footer Navigation */}
        {numPages && (
          <div className="p-6 border-t border-white/5 flex items-center justify-center gap-8">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(prev => prev - 1)}
              className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white disabled:opacity-20 transition-colors uppercase tracking-widest group"
            >
              <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Назад
            </button>
            
            <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10">
              <span className="text-xs font-bold">
                <span className="text-brand-primary">{pageNumber}</span>
                <span className="text-white/20 mx-2">/</span>
                <span className="text-white/40">{numPages}</span>
              </span>
            </div>

            <button
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber(prev => prev + 1)}
              className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white disabled:opacity-20 transition-colors uppercase tracking-widest group"
            >
              Вперед <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PDFPreviewModal;
