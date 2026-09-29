const VERSION = 6;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 136;
const BLOCK_DATA_CODEWORDS = 68;
const EC_CODEWORDS = 18;
const TOTAL_CODEWORDS = 172;
const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;
const ERROR_CORRECTION_L = 1;

const EXP = new Array<number>(512).fill(0);
const LOG = new Array<number>(256).fill(0);
let value = 1;
for (let i = 0; i < 255; i += 1) {
  EXP[i] = value;
  LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

function multiply(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function generatorPolynomial(size: number) {
  let generator = [1];
  for (let i = 0; i < size; i += 1) {
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= multiply(generator[j], EXP[i]);
    }
    generator = next;
  }
  return generator;
}

function errorCorrection(data: number[]) {
  const generator = generatorPolynomial(EC_CODEWORDS);
  const message = [...data, ...new Array<number>(EC_CODEWORDS).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = message[i];
    if (factor === 0) continue;
    for (let j = 0; j < generator.length; j += 1) {
      message[i + j] ^= multiply(generator[j], factor);
    }
  }
  return message.slice(data.length);
}

function appendBits(target: number[], valueToAppend: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) target.push((valueToAppend >>> i) & 1);
}

function createCodewords(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 134) throw new Error('A URL de acompanhamento ficou longa demais para o QR local.');

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const capacity = DATA_CODEWORDS * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  let pad = 0;
  while (data.length < DATA_CODEWORDS) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
    pad += 1;
  }

  const blocks = [
    data.slice(0, BLOCK_DATA_CODEWORDS),
    data.slice(BLOCK_DATA_CODEWORDS, BLOCK_DATA_CODEWORDS * 2),
  ];
  const ecBlocks = blocks.map(errorCorrection);
  const output: number[] = [];

  for (let i = 0; i < BLOCK_DATA_CODEWORDS; i += 1) blocks.forEach((block) => output.push(block[i]));
  for (let i = 0; i < EC_CODEWORDS; i += 1) ecBlocks.forEach((block) => output.push(block[i]));
  if (output.length !== TOTAL_CODEWORDS) throw new Error('Falha ao montar o QR.');
  return output;
}

type Module = boolean | null;

function finder(matrix: Module[][], row: number, col: number) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) continue;
      const dark =
        r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      matrix[y][x] = dark;
    }
  }
}

function alignment(matrix: Module[][], centerRow: number, centerCol: number) {
  if (matrix[centerRow][centerCol] !== null) return;
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      matrix[centerRow + r][centerCol + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
    }
  }
}

function bchDigit(valueToCheck: number) {
  let digit = 0;
  let current = valueToCheck;
  while (current !== 0) {
    digit += 1;
    current >>>= 1;
  }
  return digit;
}

function formatBits(mask: number) {
  const data = (ERROR_CORRECTION_L << 3) | mask;
  let valueToEncode = data << 10;
  while (bchDigit(valueToEncode) - bchDigit(FORMAT_GENERATOR) >= 0) {
    valueToEncode ^= FORMAT_GENERATOR << (bchDigit(valueToEncode) - bchDigit(FORMAT_GENERATOR));
  }
  return ((data << 10) | valueToEncode) ^ FORMAT_MASK;
}

function maskBit(mask: number, row: number, col: number) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return (row * col) % 2 + (row * col) % 3 === 0;
    case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
    default: return ((row * col) % 3 + (row + col) % 2) % 2 === 0;
  }
}

function reserveFormat(matrix: Module[][], mask: number) {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    if (i < 6) matrix[i][8] = dark;
    else if (i < 8) matrix[i + 1][8] = dark;
    else matrix[SIZE - 15 + i][8] = dark;

    if (i < 8) matrix[8][SIZE - i - 1] = dark;
    else if (i < 9) matrix[8][15 - i] = dark;
    else matrix[8][15 - i - 1] = dark;
  }
  matrix[SIZE - 8][8] = true;
}

function mapData(matrix: Module[][], codewords: number[], mask: number) {
  let row = SIZE - 1;
  let direction = -1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    while (true) {
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        if (matrix[row][x] !== null) continue;
        let dark = false;
        if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        if (maskBit(mask, row, x)) dark = !dark;
        matrix[row][x] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= SIZE) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

export function createQrMatrix(text: string): boolean[][] {
  const matrix: Module[][] = Array.from({ length: SIZE }, () => new Array<Module>(SIZE).fill(null));
  finder(matrix, 0, 0);
  finder(matrix, SIZE - 7, 0);
  finder(matrix, 0, SIZE - 7);
  alignment(matrix, 34, 34);

  for (let i = 8; i < SIZE - 8; i += 1) {
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
  }

  const mask = 0;
  reserveFormat(matrix, mask);
  mapData(matrix, createCodewords(text), mask);
  return matrix.map((row) => row.map(Boolean));
}
