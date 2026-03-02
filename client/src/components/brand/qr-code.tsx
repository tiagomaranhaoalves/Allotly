import { useEffect, useRef } from "react";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function QRCode({ value, size = 200, className = "" }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const modules = generateQR(value);
    const moduleCount = modules.length;
    const cellSize = size / (moduleCount + 8);
    const offset = cellSize * 4;

    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "#1F2937";
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (modules[row][col]) {
          ctx.fillRect(
            offset + col * cellSize,
            offset + row * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  }, [value, size]);

  return (
    <div className={`inline-block rounded-lg overflow-hidden border border-border dark:border-neutral-700 bg-white p-2 shadow-sm dark:shadow-none ${className}`} data-testid="qr-code" role="img" aria-label={`QR code for ${value}`}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
}

function generateQR(data: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);

  const bytes = new TextEncoder().encode(data);
  let bitIndex = 0;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5;
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const y = row;
        if (isReserved(x, y, size)) continue;
        if (bitIndex < bytes.length * 8) {
          const byteIdx = Math.floor(bitIndex / 8);
          const bitIdx = 7 - (bitIndex % 8);
          matrix[y][x] = ((bytes[byteIdx] >> bitIdx) & 1) === 1;
          bitIndex++;
        }
      }
    }
  }

  return matrix;
}

function addFinderPattern(matrix: boolean[][], row: number, col: number) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (row + r < matrix.length && col + c < matrix[0].length) {
        matrix[row + r][col + c] =
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  }
}

function isReserved(x: number, y: number, size: number): boolean {
  if (x < 8 && y < 8) return true;
  if (x >= size - 7 && y < 8) return true;
  if (x < 8 && y >= size - 7) return true;
  if (x === 6 || y === 6) return true;
  return false;
}
