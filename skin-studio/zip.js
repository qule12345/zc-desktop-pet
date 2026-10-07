;(function (global) {
  const CRC_TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    CRC_TABLE[n] = c >>> 0
  }

  function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function u16(n) {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, n, true)
    return b
  }
  function u32(n) {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n >>> 0, true)
    return b
  }

  function concat(parts) {
    let len = 0
    for (const p of parts) len += p.length
    const out = new Uint8Array(len)
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    return out
  }

  function encodeName(name) {
    return new TextEncoder().encode(String(name).replace(/\\/g, '/').replace(/^\.\//, ''))
  }

  function zipStore(files) {
    const locals = []
    const centrals = []
    let offset = 0
    const now = new Date()
    const dosTime =
      ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | (Math.floor(now.getSeconds() / 2) & 31)
    const dosDate =
      (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31)

    for (const f of files) {
      if (!f || !f.name || !f.data) continue
      const name = encodeName(f.name)
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data)
      const crc = crc32(data)
      const local = concat([
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        name,
        data,
      ])
      const central = concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ])
      locals.push(local)
      centrals.push(central)
      offset += local.length
    }

    const centralBlob = concat(centrals)
    const eocd = concat([
      new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
      u16(0),
      u16(0),
      u16(centrals.length),
      u16(centrals.length),
      u32(centralBlob.length),
      u32(offset),
      u16(0),
    ])
    return concat(locals.concat([centralBlob, eocd]))
  }

  function findEocd(buf) {
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        return i
      }
    }
    return -1
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持解压 DEFLATE zip')
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const ab = await new Response(stream).arrayBuffer()
    return new Uint8Array(ab)
  }

  async function unzip(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    const eocd = findEocd(bytes)
    if (eocd < 0) throw new Error('不是有效的 zip / .skin')
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const count = dv.getUint16(eocd + 10, true)
    let cd = dv.getUint32(eocd + 16, true)
    const files = {}
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error('zip 目录损坏')
      const method = dv.getUint16(cd + 10, true)
      const comp = dv.getUint32(cd + 20, true)
      const nameLen = dv.getUint16(cd + 28, true)
      const extraLen = dv.getUint16(cd + 30, true)
      const commentLen = dv.getUint16(cd + 32, true)
      const localOff = dv.getUint32(cd + 42, true)
      const name = new TextDecoder().decode(bytes.subarray(cd + 46, cd + 46 + nameLen)).replace(/\\/g, '/')
      cd += 46 + nameLen + extraLen + commentLen
      if (!name || name.endsWith('/')) continue
      const localNameLen = dv.getUint16(localOff + 26, true)
      const localExtra = dv.getUint16(localOff + 28, true)
      const dataStart = localOff + 30 + localNameLen + localExtra
      let data = bytes.subarray(dataStart, dataStart + comp)
      if (method === 0) {
        files[name.replace(/^\.\//, '')] = data.slice()
      } else if (method === 8) {
        files[name.replace(/^\.\//, '')] = await inflateRaw(data)
      } else {
        throw new Error('不支持的 zip 压缩方式: ' + method)
      }
    }
    return files
  }

  global.SkinZip = { zipStore, unzip, crc32 }
})(window)
