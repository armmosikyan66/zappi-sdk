import { describe, expect, it } from 'vitest'
import {
  buildCashierCombo,
  isBtcCombo,
  isBtcNetwork,
  isCashierAsset,
  isCashierNetwork,
  isStableAsset,
  isStableCombo,
  isStableNetwork,
  isValidCashierCombo,
  parseCashierCombo,
  resolveCashierCombo,
} from '../src/combo'

describe('combo', () => {
  describe('isCashierAsset / isCashierNetwork', () => {
    it.each(['btc', 'usdc', 'usdt', 'eth'] as const)('accepts %s', (asset) => {
      expect(isCashierAsset(asset)).toBe(true)
    })
    it('rejects unknown assets', () => {
      expect(isCashierAsset('dogecoin')).toBe(false)
      expect(isCashierAsset(null)).toBe(false)
    })
    it('accepts known networks', () => {
      expect(isCashierNetwork('mainnet')).toBe(true)
      expect(isCashierNetwork('solana')).toBe(true)
      expect(isCashierNetwork('tron')).toBe(true)
    })
    it('rejects unknown networks', () => {
      expect(isCashierNetwork('cardano')).toBe(false)
      expect(isCashierNetwork(null)).toBe(false)
    })
  })

  describe('isBtcNetwork / isStableNetwork', () => {
    it('identifies btc networks', () => {
      expect(isBtcNetwork('mainnet')).toBe(true)
      expect(isBtcNetwork('lightning')).toBe(true)
      expect(isBtcNetwork('solana')).toBe(false)
    })
    it('identifies stable networks', () => {
      expect(isStableNetwork('solana')).toBe(true)
      expect(isStableNetwork('ethereum')).toBe(true)
      expect(isStableNetwork('mainnet')).toBe(false)
    })
  })

  it('isStableAsset', () => {
    expect(isStableAsset('usdc')).toBe(true)
    expect(isStableAsset('usdt')).toBe(true)
    expect(isStableAsset('btc')).toBe(false)
    expect(isStableAsset('eth')).toBe(false)
  })

  describe('isValidCashierCombo', () => {
    it('accepts btc + btc networks', () => {
      expect(isValidCashierCombo('btc', 'mainnet')).toBe(true)
      expect(isValidCashierCombo('btc', 'lightning')).toBe(true)
    })
    it('accepts eth on its deposit chains', () => {
      expect(isValidCashierCombo('eth', 'ethereum')).toBe(true)
      expect(isValidCashierCombo('eth', 'base')).toBe(true)
      expect(isValidCashierCombo('eth', 'robinhood')).toBe(true)
      expect(isValidCashierCombo('eth', 'solana')).toBe(false)
    })
    it('accepts stables on stable networks', () => {
      expect(isValidCashierCombo('usdc', 'solana')).toBe(true)
      expect(isValidCashierCombo('usdt', 'base')).toBe(true)
    })
    it('tron only accepts usdt (not usdc)', () => {
      expect(isValidCashierCombo('usdt', 'tron')).toBe(true)
      expect(isValidCashierCombo('usdc', 'tron')).toBe(false)
    })
    it('rejects nulls', () => {
      expect(isValidCashierCombo(null, 'solana')).toBe(false)
      expect(isValidCashierCombo('usdc', null)).toBe(false)
    })
    it('rejects btc on stable networks', () => {
      expect(isValidCashierCombo('btc', 'solana')).toBe(false)
    })
    it('accepts usdb on lightning and spark', () => {
      expect(isValidCashierCombo('usdb', 'lightning')).toBe(true)
      expect(isValidCashierCombo('usdb', 'spark')).toBe(true)
      expect(isValidCashierCombo('usdb', 'solana')).toBe(false)
    })
  })

  it('buildCashierCombo produces typed combos', () => {
    expect(buildCashierCombo('btc', 'mainnet')).toEqual({ asset: 'btc', network: 'mainnet' })
    expect(buildCashierCombo('eth', 'ethereum')).toEqual({ asset: 'eth', network: 'ethereum' })
    expect(buildCashierCombo('eth', 'base')).toEqual({ asset: 'eth', network: 'base' })
    expect(buildCashierCombo('usdc', 'solana')).toEqual({ asset: 'usdc', network: 'solana' })
    expect(buildCashierCombo('usdb', 'spark')).toEqual({ asset: 'usdb', network: 'spark' })
    expect(buildCashierCombo('usdb', 'lightning')).toEqual({
      asset: 'usdb',
      network: 'lightning',
    })
  })

  it('resolveCashierCombo returns null for invalid', () => {
    expect(resolveCashierCombo('usdc', 'tron')).toBeNull()
    expect(resolveCashierCombo(null, 'solana')).toBeNull()
    expect(resolveCashierCombo('usdb', 'spark')).toEqual({
      asset: 'usdb',
      network: 'spark',
    })
    expect(resolveCashierCombo('usdb', 'base')).toBeNull()
  })

  it('parseCashierCombo parses strings', () => {
    expect(parseCashierCombo('btc', 'mainnet')).toEqual({ asset: 'btc', network: 'mainnet' })
    expect(parseCashierCombo('USDC', 'solana')).toBeNull() // case-sensitive
    expect(parseCashierCombo('usdc', 'cardano')).toBeNull()
    expect(parseCashierCombo('eth', 'base')).toEqual({ asset: 'eth', network: 'base' })
    expect(parseCashierCombo('eth', 'solana')).toBeNull()
    expect(parseCashierCombo('usdb', 'spark')).toEqual({
      asset: 'usdb',
      network: 'spark',
    })
  })

  it('isBtcCombo / isStableCombo', () => {
    const btc = buildCashierCombo('btc', 'mainnet')
    const usdc = buildCashierCombo('usdc', 'solana')
    expect(isBtcCombo(btc)).toBe(true)
    expect(isStableCombo(btc)).toBe(false)
    expect(isBtcCombo(usdc)).toBe(false)
    expect(isStableCombo(usdc)).toBe(true)
  })
})
