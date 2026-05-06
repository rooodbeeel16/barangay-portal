import QRCode from 'qrcode';

export async function generateQRCodeDataURL(trackingId: string, baseUrl: string = 'http://localhost:3000'): Promise<string> {
  const url = `${baseUrl}/track.html?id=${trackingId}`;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 256,
    margin: 2,
  });
}

export async function generateQRCodeBuffer(trackingId: string, baseUrl: string = 'http://localhost:3000'): Promise<Buffer> {
  const url = `${baseUrl}/track.html?id=${trackingId}`;
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 256,
    margin: 2,
  });
}
