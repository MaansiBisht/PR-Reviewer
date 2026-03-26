import { DiffChunk } from '../types';
import { logger } from '../utils/logger';

interface FileDiff {
  filename: string;
  content: string;
}

export function parseDiffIntoFiles(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const filePattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  const parts = diff.split(/(?=^diff --git)/m);

  for (const part of parts) {
    if (!part.trim()) continue;
    
    const match = part.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (match) {
      files.push({
        filename: match[2],
        content: part,
      });
    }
  }

  return files;
}

export function chunkDiff(diff: string, maxChunkSize: number): DiffChunk[] {
  if (!diff || diff.trim().length === 0) {
    return [];
  }

  const files = parseDiffIntoFiles(diff);
  
  if (files.length === 0) {
    if (diff.length <= maxChunkSize) {
      return [{
        content: diff,
        files: ['unknown'],
        index: 0,
        total: 1,
      }];
    }
  }

  const chunks: DiffChunk[] = [];
  let currentChunk = '';
  let currentFiles: string[] = [];

  for (const file of files) {
    if (file.content.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push({
          content: currentChunk,
          files: [...currentFiles],
          index: chunks.length,
          total: 0,
        });
        currentChunk = '';
        currentFiles = [];
      }

      const subChunks = splitLargeFileDiff(file, maxChunkSize);
      for (const subChunk of subChunks) {
        chunks.push({
          content: subChunk,
          files: [file.filename],
          index: chunks.length,
          total: 0,
        });
      }
    } else if (currentChunk.length + file.content.length > maxChunkSize) {
      chunks.push({
        content: currentChunk,
        files: [...currentFiles],
        index: chunks.length,
        total: 0,
      });
      currentChunk = file.content;
      currentFiles = [file.filename];
    } else {
      currentChunk += file.content;
      currentFiles.push(file.filename);
    }
  }

  if (currentChunk) {
    chunks.push({
      content: currentChunk,
      files: [...currentFiles],
      index: chunks.length,
      total: 0,
    });
  }

  const total = chunks.length;
  for (const chunk of chunks) {
    chunk.total = total;
  }

  logger.debug(`Split diff into ${chunks.length} chunks`);
  return chunks;
}

function splitLargeFileDiff(file: FileDiff, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const lines = file.content.split('\n');
  
  const headerLines: string[] = [];
  let contentStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      contentStartIndex = i;
      break;
    }
    headerLines.push(lines[i]);
  }
  
  const header = headerLines.join('\n') + '\n';
  let currentChunk = header;
  
  for (let i = contentStartIndex; i < lines.length; i++) {
    const line = lines[i] + '\n';
    
    if (currentChunk.length + line.length > maxChunkSize) {
      if (currentChunk.length > header.length) {
        chunks.push(currentChunk);
      }
      currentChunk = header + line;
    } else {
      currentChunk += line;
    }
  }
  
  if (currentChunk.length > header.length) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
