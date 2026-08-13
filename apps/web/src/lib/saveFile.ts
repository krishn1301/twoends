import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Handing the user a file, on both platforms this app runs on.
 *
 * The browser way — an object URL and an `<a download>` — is the only way in a
 * browser, and does nothing at all inside an Android WebView: no download
 * manager is listening, no error is raised, and the web layer cannot tell the
 * difference. So the native app goes through a small plugin that writes to
 * Downloads via MediaStore.
 *
 * Both paths are here rather than at the call site because a "save this file"
 * button should not have to know which shell it is running in.
 */

interface ExporterBridge {
  save(options: {
    filename: string;
    /** Base64, with or without a data-URL prefix. */
    data: string;
    mimeType: string;
  }): Promise<{ uri: string }>;
}

const Exporter = registerPlugin<ExporterBridge>('Exporter');

export interface Saved {
  /** Where it went, when the platform can say. Null in a browser, which cannot. */
  location: string | null;
  error: string | null;
}

export async function saveFile(blob: Blob, filename: string): Promise<Saved> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const { uri } = await Exporter.save({
        filename,
        data: await toBase64(blob),
        mimeType: blob.type || 'application/octet-stream',
      });
      return { location: uri.startsWith('content://') ? 'Downloads' : uri, error: null };
    } catch (cause) {
      return { location: null, error: cause instanceof Error ? cause.message : 'Could not save.' };
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    return { location: null, error: null };
  } finally {
    // Revoked on the next tick rather than immediately: Safari has not started
    // reading the blob by the time `click()` returns, and revoking first gives
    // a silently empty file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Base64 without loading the whole file into a string twice.
 *
 * `FileReader` produces a data URL in one pass. Building it by hand from an
 * ArrayBuffer means a byte-per-character intermediate string, which on a
 * hundred-megabyte export is how an old phone runs out of memory.
 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}
