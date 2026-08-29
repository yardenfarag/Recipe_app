import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  COOKBOOK_PAGE_PX,
  cookbookFileName,
  type CookbookPageSize,
} from '@/lib/cookbook/buildCookbookHtml';

export type CookbookExportResult = 'shared' | 'printed';
export { cookbookFileName };

function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Print is unavailable'));
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'cookbook-print');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      reject(new Error('Print is unavailable'));
      return;
    }

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve();
    };

    doc.open();
    doc.write(html);
    doc.close();

    win.onafterprint = cleanup;
    const images = Array.from(doc.images);
    const fontsReady =
      typeof doc.fonts?.ready?.then === 'function'
        ? doc.fonts.ready.catch(() => undefined)
        : Promise.resolve();
    Promise.all([
      fontsReady,
      ...images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((done) => {
              img.onload = () => done();
              img.onerror = () => done();
            }),
      ),
    ])
      .then(() => {
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      })
      .catch(() => {
        iframe.remove();
        reject(new Error('Print is unavailable'));
      });
  });
}

/** Native: write a PDF and open the share sheet. Web: iframe print / Save as PDF. */
export async function exportCookbookPdf(options: {
  html: string;
  title: string;
  pageSize: CookbookPageSize;
}): Promise<CookbookExportResult> {
  if (Platform.OS === 'web') {
    await printHtmlInIframe(options.html);
    return 'printed';
  }

  const size = COOKBOOK_PAGE_PX[options.pageSize];
  const { uri } = await Print.printToFileAsync({
    html: options.html,
    width: size.width,
    height: size.height,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: cookbookFileName(options.title),
    });
    return 'shared';
  }

  await Print.printAsync({ uri });
  return 'printed';
}
