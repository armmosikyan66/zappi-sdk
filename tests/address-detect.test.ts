import { describe, expect, it } from 'vitest'
import {
  detectAddressFamily,
  familyForNetworkId,
  isAmbiguousAddressFamily,
  networksForFamily,
  uniqueNetworkForFamily,
  uniqueNetworkInCatalog,
  validateDestination,
} from '../src/address-detect'

describe('address-detect', () => {
  describe('familyForNetworkId', () => {
    it('maps known networks', () => {
      expect(familyForNetworkId('mainnet')).toBe('bitcoin')
      expect(familyForNetworkId('lightning')).toBe('lightning')
      expect(familyForNetworkId('ethereum')).toBe('evm')
      expect(familyForNetworkId('base')).toBe('evm')
      expect(familyForNetworkId('solana')).toBe('solana')
      expect(familyForNetworkId('tron')).toBe('tron')
    })
    it('returns null for unknown', () => {
      expect(familyForNetworkId('cardano')).toBeNull()
      expect(familyForNetworkId(null)).toBeNull()
    })
  })

  it('isAmbiguousAddressFamily flags evm only', () => {
    expect(isAmbiguousAddressFamily('evm')).toBe(true)
    expect(isAmbiguousAddressFamily('bitcoin')).toBe(false)
    expect(isAmbiguousAddressFamily(null)).toBe(false)
  })

  it('uniqueNetworkForFamily returns single-network families', () => {
    expect(uniqueNetworkForFamily('bitcoin')).toBe('mainnet')
    expect(uniqueNetworkForFamily('solana')).toBe('solana')
    expect(uniqueNetworkForFamily('evm')).toBeNull() // multiple
  })

  it('networksForFamily filters catalog', () => {
    const catalog = ['mainnet', 'lightning', 'solana', 'ethereum', 'base']
    expect(networksForFamily(catalog, 'evm')).toEqual(['ethereum', 'base'])
    expect(networksForFamily(catalog, 'bitcoin')).toEqual(['mainnet'])
    expect(networksForFamily(catalog, null)).toEqual([])
  })

  it('uniqueNetworkInCatalog', () => {
    expect(uniqueNetworkInCatalog(['mainnet', 'lightning'], 'bitcoin')).toBe('mainnet')
    expect(uniqueNetworkInCatalog(['ethereum', 'base'], 'evm')).toBeNull()
  })

  describe('detectAddressFamily', () => {
    it('detects lightning invoices and lnurl', () => {
      expect(detectAddressFamily('lnbc100n1...').family).toBe('lightning')
      expect(detectAddressFamily('lnurl1dp68gurz...').family).toBe('lightning')
      expect(detectAddressFamily('lightning:lnbc100n1...').family).toBe('lightning')
    })
    it('detects EVM addresses', () => {
      expect(detectAddressFamily('0x' + 'a'.repeat(40)).family).toBe('evm')
      expect(detectAddressFamily('0x' + 'a'.repeat(38)).family).toBe('evm') // shape but invalid
      expect(detectAddressFamily('0x' + 'a'.repeat(38)).valid).toBe(false)
    })
    it('detects tron addresses (T + 33 base58)', () => {
      expect(detectAddressFamily('T' + 'a'.repeat(33)).family).toBe('tron')
    })
    it('detects bitcoin bech32 addresses', () => {
      expect(detectAddressFamily('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdj').family).toBe('bitcoin')
    })
    it('detects solana-shaped addresses', () => {
      const addr = '1'.repeat(44)
      expect(detectAddressFamily(addr).family).toBe('solana')
    })
    it('returns empty for empty input', () => {
      expect(detectAddressFamily('').family).toBeNull()
      expect(detectAddressFamily(null).valid).toBe(false)
    })
    it('returns unrecognized for garbage', () => {
      expect(detectAddressFamily('not-an-address').family).toBeNull()
    })
  })

  describe('validateDestination', () => {
    it('accepts a matching family', () => {
      const res = validateDestination('0x' + 'a'.repeat(40), 'ethereum')
      expect(res.valid).toBe(true)
      expect(res.normalized).toBe('0x' + 'a'.repeat(40))
    })
    it('rejects a wrong family', () => {
      const res = validateDestination('0x' + 'a'.repeat(40), 'solana')
      expect(res.valid).toBe(false)
      expect(res.errorCopy).toContain('solana')
    })
    it('rejects an unknown network', () => {
      const res = validateDestination('0x' + 'a'.repeat(40), 'cardano')
      expect(res.valid).toBe(false)
    })
    it('rejects empty input', () => {
      const res = validateDestination('', 'ethereum')
      expect(res.valid).toBe(false)
    })
  })
})
