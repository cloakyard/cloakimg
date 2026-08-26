interface HeifBitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

interface HeifCodecModule {
  jsDecodeImage(input: Uint8Array): { err: string; data: HeifBitmap[] };
  jsEncodeImage(
    input: Uint8Array,
    width: number,
    height: number,
    quality: number,
  ): { err: string; data: Uint8Array };
}

export default function createHeifCodec(): Promise<HeifCodecModule>;
