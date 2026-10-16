/**
 * SHA-256 and RIPEMD-160 with no `node:crypto`. The fee script and the
 * browser sealer both need HASH160, and WebCrypto does not offer RIPEMD-160.
 */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

export function sha256(message: Uint8Array): Uint8Array {
  const length = message.length
  const total = ((length + 9 + 63) >> 6) << 6
  const data = new Uint8Array(total)
  data.set(message)
  data[length] = 0x80
  const view = new DataView(data.buffer)
  const bits = length * 8
  view.setUint32(total - 8, Math.floor(bits / 0x100000000), false)
  view.setUint32(total - 4, bits >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let offset = 0; offset < total; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getUint32(offset + index * 4, false)
    }
    for (let index = 16; index < 64; index += 1) {
      const w15 = w[index - 15] ?? 0
      const w2 = w[index - 2] ?? 0
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)
      w[index] = (((w[index - 16] ?? 0) + s0 + (w[index - 7] ?? 0) + s1) >>> 0)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + (SHA256_K[index] ?? 0) + (w[index] ?? 0)) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return out
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

export function hash160(bytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(bytes))
}

export function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes))
}

const RIPEMD_R = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2,
  14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3,
  7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
])

const RIPEMD_RP = new Uint8Array([
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4,
  9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12,
  2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
])

const RIPEMD_S = new Uint8Array([
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9,
  11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9,
  8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
])

const RIPEMD_SP = new Uint8Array([
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7,
  6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14,
  6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
])

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

function ripemdF(round: number, x: number, y: number, z: number): number {
  if (round === 0) return x ^ y ^ z
  if (round === 1) return (x & y) | (~x & z)
  if (round === 2) return (x | ~y) ^ z
  if (round === 3) return (x & z) | (y & ~z)
  return x ^ (y | ~z)
}

const RIPEMD_KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]
const RIPEMD_KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]

export function ripemd160(message: Uint8Array): Uint8Array {
  const length = message.length
  const total = ((length + 9 + 63) >> 6) << 6
  const data = new Uint8Array(total)
  data.set(message)
  data[length] = 0x80
  const view = new DataView(data.buffer)
  const bits = length * 8
  view.setUint32(total - 8, bits >>> 0, true)
  view.setUint32(total - 4, Math.floor(bits / 0x100000000), true)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const x = new Uint32Array(16)

  for (let offset = 0; offset < total; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      x[index] = view.getUint32(offset + index * 4, true)
    }
    let al = h0
    let bl = h1
    let cl = h2
    let dl = h3
    let el = h4
    let ar = h0
    let br = h1
    let cr = h2
    let dr = h3
    let er = h4
    for (let index = 0; index < 80; index += 1) {
      const round = Math.floor(index / 16)
      const leftIndex = RIPEMD_R[index] ?? 0
      const leftShift = RIPEMD_S[index] ?? 0
      const left =
        (rotl(
          (al + ripemdF(round, bl, cl, dl) + (x[leftIndex] ?? 0) + (RIPEMD_KL[round] ?? 0)) >>> 0,
          leftShift,
        ) +
          el) >>>
        0
      al = el
      el = dl
      dl = rotl(cl, 10)
      cl = bl
      bl = left

      const rightIndex = RIPEMD_RP[index] ?? 0
      const rightShift = RIPEMD_SP[index] ?? 0
      const right =
        (rotl(
          (ar + ripemdF(4 - round, br, cr, dr) + (x[rightIndex] ?? 0) + (RIPEMD_KR[round] ?? 0)) >>> 0,
          rightShift,
        ) +
          er) >>>
        0
      ar = er
      er = dr
      dr = rotl(cr, 10)
      cr = br
      br = right
    }
    const next = (h1 + cl + dr) >>> 0
    h1 = (h2 + dl + er) >>> 0
    h2 = (h3 + el + ar) >>> 0
    h3 = (h4 + al + br) >>> 0
    h4 = (h0 + bl + cr) >>> 0
    h0 = next
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, true)
  outView.setUint32(4, h1, true)
  outView.setUint32(8, h2, true)
  outView.setUint32(12, h3, true)
  outView.setUint32(16, h4, true)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
