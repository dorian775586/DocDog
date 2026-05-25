export type FileFormat = 'JPG' | 'PNG' | 'PDF' | 'WEBP' | 'DOCX' | 'HEIC' | 'AUTO';

export interface FormatMetadata {
  label: string;
  color: string;
  iconColor: string;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  format: FileFormat;
  previewUrl?: string;
}

export type ProcessingState = 'idle' | 'processing' | 'completed' | 'error';
