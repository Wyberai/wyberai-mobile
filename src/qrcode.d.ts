declare module 'qrcode' {
  const QRCode: {
    toString(text: string, opts: { type: 'svg'; margin?: number; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): Promise<string>;
  };
  export default QRCode;
}
